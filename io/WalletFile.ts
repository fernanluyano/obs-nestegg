// Derived from Penny Wallet's WalletFile.ts (MIT) — see NOTICE.
import { App, TFile, normalizePath } from 'obsidian'
import {
  computeNetAsset,
  computeNetAssetFromMap,
  computeWalletBalances,
  applyTransaction,
  compareTransactions,
  detectFrontmatterIssues,
  detectOrphanedWallets,
  findTransactionIndex,
  groupByCategory,
  initialBalances,
  renameWallet,
} from '../ledger'
import { buildMonthContent, parseFrontmatter, parseMonthFile, summarize } from '../transactionTable'
import {
  DEFAULT_CONFIG,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSFER_CATEGORIES,
} from '../types'
import type {
  MonthSummary,
  NesteggConfig,
  NesteggOptions,
  Transaction,
  ValidationIssue,
  WalletBalance,
} from '../types'

export interface ConfigStore {
  load(): Promise<unknown>
  save(data: NesteggConfig): Promise<void>
}

export class WalletFile {
  private config: NesteggConfig = { ...DEFAULT_CONFIG }
  private createdDefaultConfigOnLastLoad = false

  constructor(private app: App, private store: ConfigStore) {}

  get folderName(): string {
    return this.config.folderName
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  async loadConfig(): Promise<NesteggConfig> {
    const saved = (await this.store.load()) as Partial<NesteggConfig> | null
    this.createdDefaultConfigOnLastLoad = !saved
    this.config = { ...DEFAULT_CONFIG, ...saved, options: this.normalizeOptions(saved ?? {}) }
    if (this.createdDefaultConfigOnLastLoad) {
      await this.ensureFolder()
      await this.saveConfig()
    }
    return this.config
  }

  didCreateDefaultConfigOnLastLoad(): boolean {
    return this.createdDefaultConfigOnLastLoad
  }

  updateCustomCategories(type: 'expense' | 'income' | 'transfer', custom: string[]): void {
    const { options } = this.config
    this.config = {
      ...this.config,
      options: {
        ...options,
        categories: {
          ...options.categories,
          [type]: { ...options.categories[type], custom },
        },
      },
    }
  }

  private normalizeOptions(parsed: Partial<NesteggConfig>): NesteggOptions {
    const c = parsed.options?.categories
    return {
      types: { default: ['expense', 'income', 'transfer'], custom: parsed.options?.types?.custom ?? [] },
      categories: {
        expense: { default: [...DEFAULT_EXPENSE_CATEGORIES], custom: c?.expense?.custom ?? [] },
        income: { default: [...DEFAULT_INCOME_CATEGORIES], custom: c?.income?.custom ?? [] },
        transfer: { default: [...DEFAULT_TRANSFER_CATEGORIES], custom: c?.transfer?.custom ?? [] },
      },
    }
  }

  private mergeTags(newTags: string[]): void {
    if (!newTags.length) return
    this.config = { ...this.config, tags: [...new Set([...this.config.tags, ...newTags])].sort() }
  }

  async addTag(name: string): Promise<{ ok: true } | { ok: false, reason: 'empty' | 'duplicate' }> {
    const trimmed = name.trim().replace(/^#/, '').trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (this.config.tags.includes(trimmed)) return { ok: false, reason: 'duplicate' }
    this.config = { ...this.config, tags: [...this.config.tags, trimmed].sort() }
    await this.saveConfig()
    return { ok: true }
  }

  async saveConfig(): Promise<void> {
    await this.store.save(this.config)
  }

  getConfig(): NesteggConfig {
    return this.config
  }

  updateConfig(patch: Partial<NesteggConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  // ── Month file helpers ───────────────────────────────────────────────────────

  private monthFilePath(yearMonth: string): string {
    return normalizePath(`${this.config.folderName}/${yearMonth}.md`)
  }

  private listMonthFiles(): TFile[] {
    const folder = this.app.vault.getFolderByPath(this.config.folderName)
    if (!folder) return []
    return folder.children.filter((f): f is TFile =>
      f instanceof TFile &&
      f.extension === 'md' &&
      /^\d{4}-\d{2}$/.test(f.basename),
    )
  }

  private async ensureFolder(): Promise<void> {
    const folder = this.config.folderName
    if (this.app.vault.getFolderByPath(folder)) return
    try {
      await this.app.vault.createFolder(folder)
    } catch (e: unknown) {
      // Two writes racing on first launch both try to create it
      if (!(e instanceof Error) || !e.message?.includes('already exists')) throw e
    }
  }

  private async readMonthFile(yearMonth: string): Promise<string | null> {
    const file = this.app.vault.getFileByPath(this.monthFilePath(yearMonth))
    return file ? await this.app.vault.read(file) : null
  }

  private async writeMonthFile(yearMonth: string, transactions: Transaction[]): Promise<void> {
    await this.ensureFolder()
    const path = this.monthFilePath(yearMonth)
    const content = buildMonthContent(yearMonth, transactions)
    const file = this.app.vault.getFileByPath(path)
    if (file) {
      await this.app.vault.process(file, () => content)
      return
    }
    try {
      await this.app.vault.create(path, content)
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message?.includes('already exists')) throw e
      const retry = this.app.vault.getFileByPath(path)
      if (retry) await this.app.vault.process(retry, () => content)
    }
  }

  // ── Read Transactions ────────────────────────────────────────────────────────

  async readMonth(yearMonth: string): Promise<Transaction[]> {
    const content = await this.readMonthFile(yearMonth)
    return content ? parseMonthFile(content) : []
  }

  async readMonthSummary(yearMonth: string): Promise<MonthSummary | null> {
    const content = await this.readMonthFile(yearMonth)
    if (!content) return null
    const fm = parseFrontmatter(content)
    if (fm.incomeCents === undefined || fm.expenseCents === undefined) return null
    return { incomeCents: fm.incomeCents, expenseCents: fm.expenseCents }
  }

  // ── Write / Edit / Delete ────────────────────────────────────────────────────

  /** `tx.date` is "MM/DD"; `yearMonth` is "yyyy-mm". */
  async writeTransaction(tx: Transaction, yearMonth: string): Promise<void> {
    const transactions = await this.readMonth(yearMonth)
    transactions.push({ ...tx, createdAt: tx.createdAt ?? new Date().toISOString() })
    transactions.sort(compareTransactions)
    await this.saveTags(tx.tags)
    await this.writeMonthFile(yearMonth, transactions)
  }

  /** Handles cross-month moves. */
  async updateTransaction(
    oldTx: Transaction,
    oldYearMonth: string,
    newTx: Transaction,
    newYearMonth: string,
  ): Promise<void> {
    if (oldYearMonth !== newYearMonth) {
      await this.deleteTransactionFromMonth(oldTx, oldYearMonth)
      await this.writeTransaction(newTx, newYearMonth)
      return
    }
    const transactions = await this.readMonth(oldYearMonth)
    const idx = findTransactionIndex(transactions, oldTx)
    if (idx !== -1) {
      transactions[idx] = { ...newTx, createdAt: newTx.createdAt ?? oldTx.createdAt ?? new Date().toISOString() }
    }
    transactions.sort(compareTransactions)
    await this.saveTags(newTx.tags)
    await this.writeMonthFile(oldYearMonth, transactions)
  }

  async deleteTransaction(tx: Transaction, yearMonth: string): Promise<void> {
    await this.deleteTransactionFromMonth(tx, yearMonth)
  }

  async renameWalletInTransactions(oldName: string, newName: string): Promise<void> {
    await Promise.all(this.getAllYearMonths().map(async (ym) => {
      const transactions = await this.readMonth(ym)
      const touches = transactions.some(tx =>
        tx.wallet === oldName || tx.fromWallet === oldName || tx.toWallet === oldName)
      if (touches) await this.writeMonthFile(ym, renameWallet(transactions, oldName, newName))
    }))
  }

  private async saveTags(tags: string[] | undefined): Promise<void> {
    if (!tags?.length) return
    this.mergeTags(tags)
    await this.saveConfig()
  }

  private async deleteTransactionFromMonth(tx: Transaction, yearMonth: string): Promise<void> {
    const content = await this.readMonthFile(yearMonth)
    if (!content) return
    const transactions = parseMonthFile(content)
    const idx = findTransactionIndex(transactions, tx)
    if (idx !== -1) transactions.splice(idx, 1)
    await this.writeMonthFile(yearMonth, transactions)
  }

  // ── Frontmatter Cache ────────────────────────────────────────────────────────

  /** On plugin load: only recalculate months that are missing frontmatter. */
  async bootstrapFrontmatter(): Promise<void> {
    for (const file of this.listMonthFiles()) {
      const fm = parseFrontmatter(await this.app.vault.read(file))
      if (fm.incomeCents === undefined || fm.expenseCents === undefined) {
        await this.recalculateFrontmatter(file.basename)
      }
    }
  }

  async recalculateFrontmatter(yearMonth: string): Promise<void> {
    const content = await this.readMonthFile(yearMonth)
    if (!content) return
    await this.writeMonthFile(yearMonth, parseMonthFile(content))
  }

  // ── Data Validation ──────────────────────────────────────────────────────────

  async validateAllData(): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = []
    const monthData = new Map<string, Transaction[]>()

    for (const file of this.listMonthFiles()) {
      const content = await this.app.vault.read(file)
      const transactions = parseMonthFile(content)
      monthData.set(file.basename, transactions)

      const fm = parseFrontmatter(content)
      if (fm.incomeCents !== undefined && fm.expenseCents !== undefined) {
        issues.push(...detectFrontmatterIssues(file.basename, transactions, {
          incomeCents: fm.incomeCents,
          expenseCents: fm.expenseCents,
        }))
      }
    }

    issues.push(...detectOrphanedWallets(monthData, this.config.wallets))
    return issues
  }

  async repairOrphanedWallet(walletName: string): Promise<void> {
    if (this.config.wallets.some(w => w.name === walletName)) return
    this.config = {
      ...this.config,
      wallets: [
        ...this.config.wallets,
        {
          name: walletName,
          type: 'bank',
          initialBalanceCents: 0,
          status: 'archived',
          includeInNetAsset: false,
        },
      ],
    }
    await this.saveConfig()
  }

  // ── Net Asset & Wallet Balance Calculation ────────────────────────────────────

  async calculateAllWalletBalances(): Promise<WalletBalance[]> {
    return (await this.calculateWalletData()).balances
  }

  async calculateWalletData(): Promise<{ balances: WalletBalance[]; walletsWithTransactions: Set<string> }> {
    const monthTransactions = await Promise.all(this.getAllYearMonths().map(ym => this.readMonth(ym)))
    const all = monthTransactions.flat()

    const walletsWithTransactions = new Set<string>()
    for (const tx of all) {
      for (const name of [tx.wallet, tx.fromWallet, tx.toWallet]) {
        if (name) walletsWithTransactions.add(name)
      }
    }

    return { balances: this.computeWalletBalances(all), walletsWithTransactions }
  }

  computeWalletBalances(transactions: Transaction[]): WalletBalance[] {
    return computeWalletBalances(this.config.wallets, transactions)
  }

  computeNetAsset(walletBalances: WalletBalance[]): number {
    return computeNetAsset(walletBalances)
  }

  computeSummary(transactions: Transaction[]): MonthSummary {
    return summarize(transactions)
  }

  groupByCategory(transactions: Transaction[], type: 'expense' | 'income'): Map<string, number> {
    return groupByCategory(transactions, type)
  }

  /** Per-wallet balance at each target month end — cash + bank only */
  async getWalletBalanceTrend(targetMonths: string[]): Promise<Map<string, Map<string, number>>> {
    const { wallets } = this.config
    const tracked = wallets.filter(w => w.status === 'active' && (w.type === 'cash' || w.type === 'bank'))
    const result = new Map<string, Map<string, number>>(tracked.map(w => [w.name, new Map()]))

    await this.walkMonths(targetMonths, (ym, balances) => {
      for (const w of tracked) result.get(w.name)?.set(ym, balances.get(w.name) ?? 0)
    })
    return result
  }

  async getNetAssetTimeline(targetMonths: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    await this.walkMonths(targetMonths, (ym, balances) => {
      result.set(ym, computeNetAssetFromMap(this.config.wallets, balances))
    })
    return result
  }

  // Replays every month up to the last target so balances carry over, reporting at each target month.
  private async walkMonths(
    targetMonths: string[],
    onTarget: (yearMonth: string, balances: Map<string, number>) => void,
  ): Promise<void> {
    const lastTarget = targetMonths[targetMonths.length - 1]
    const relevant = this.getAllYearMonths().filter(m => m <= lastTarget)
    const monthTransactions = await Promise.all(relevant.map(ym => this.readMonth(ym)))
    const balances = initialBalances(this.config.wallets)

    relevant.forEach((ym, i) => {
      for (const tx of monthTransactions[i]) applyTransaction(tx, balances, this.config.wallets)
      if (targetMonths.includes(ym)) onTarget(ym, balances)
    })
  }

  async getCategoryTrend(yearMonths: string[], category: string): Promise<Map<string, number>> {
    const allTxs = await Promise.all(yearMonths.map(ym => this.readMonth(ym)))
    const result = new Map<string, number>()
    yearMonths.forEach((ym, i) => {
      result.set(ym, allTxs[i]
        .filter(tx => tx.category === category)
        .reduce((sum, tx) => sum + tx.amountCents, 0))
    })
    return result
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  async walletHasTransactions(walletName: string): Promise<boolean> {
    for (const ym of this.getAllYearMonths()) {
      const txs = await this.readMonth(ym)
      if (txs.some(tx => tx.wallet === walletName || tx.fromWallet === walletName || tx.toWallet === walletName)) {
        return true
      }
    }
    return false
  }

  getAllYearMonths(): string[] {
    return this.listMonthFiles().map(f => f.basename).sort()
  }

  async getMonthSummaries(yearMonths: string[]): Promise<Map<string, MonthSummary>> {
    const result = new Map<string, MonthSummary>()
    for (const ym of yearMonths) {
      const summary = await this.readMonthSummary(ym)
      if (summary) result.set(ym, summary)
    }
    return result
  }
}
