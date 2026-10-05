import { formatCents } from '../money'
import { App, Modal, Notice } from 'obsidian'
import { WalletFile } from '../io/WalletFile'
import type { ValidationIssue } from '../types'
import { t, tn } from '../labels'

export class ValidationModal extends Modal {
  private issues: ValidationIssue[]
  private walletFile: WalletFile

  constructor(app: App, walletFile: WalletFile, issues: ValidationIssue[]) {
    super(app)
    this.walletFile = walletFile
    this.issues = issues
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('ne-validation-modal')

    // Header: [X] [title] [spacer]
    const header = contentEl.createDiv('ne-validation-header')
    const closeBtn = header.createDiv('ne-validation-close-btn')
    closeBtn.setText('✕')
    closeBtn.addEventListener('click', () => this.close())
    header.createEl('h2', { text: t('validation.modalTitle'), cls: 'ne-validation-title' })
    header.createDiv('ne-validation-header-spacer')

    // Content
    const content = contentEl.createDiv('ne-validation-content')
    this.renderIssues(content)

    // Divider + footer
    contentEl.createDiv('ne-validation-divider')
    const footer = contentEl.createDiv('ne-validation-footer')
    const fixAllBtn = footer.createEl('button', {
      text: t('validation.fixAll'),
      cls: 'ne-validation-fix-all-btn',
    })
    fixAllBtn.addEventListener('click', () => void this.fixAll())
  }

  private renderIssues(container: HTMLElement) {
    const frontmatterIssues = this.issues.filter(i => i.type === 'frontmatter')
    const orphanIssues = this.issues.filter(i => i.type === 'orphanedWallet')

    if (frontmatterIssues.length > 0) {
      const sectionA = container.createDiv('ne-validation-section')
      sectionA.createEl('span', { text: t('validation.frontmatterSection'), cls: 'ne-validation-section-label' })
      for (const issue of frontmatterIssues) {
        if (issue.type !== 'frontmatter') continue
        const card = sectionA.createDiv('ne-validation-card')
        card.createEl('p', {
          text: tn('validation.frontmatterDesc', {
            month: issue.yearMonth,
            actualIncome: formatCents(issue.actualIncomeCents),
            storedIncome: formatCents(issue.storedIncomeCents),
            actualExpense: formatCents(issue.actualExpenseCents),
            storedExpense: formatCents(issue.storedExpenseCents),
          }),
          cls: 'ne-validation-card-text',
        })
        const cardFooter = card.createDiv('ne-validation-card-footer')
        const btn = cardFooter.createEl('button', { text: t('validation.fix'), cls: 'ne-validation-fix-btn' })
        btn.addEventListener('click', () => void (async () => {
          await this.walletFile.recalculateFrontmatter(issue.yearMonth)
          btn.setText('✓')
          btn.disabled = true
        })())
      }
    }

    if (orphanIssues.length > 0) {
      const sectionB = container.createDiv('ne-validation-section')
      sectionB.createEl('span', { text: t('validation.orphanSection'), cls: 'ne-validation-section-label' })
      const activeWallets = this.walletFile.getConfig().wallets.filter(w => w.status === 'active')
      for (const issue of orphanIssues) {
        if (issue.type !== 'orphanedWallet') continue
        const card = sectionB.createDiv('ne-validation-card')
        card.createEl('p', {
          text: tn('validation.orphanDesc', {
            wallet: issue.walletName,
            count: String(issue.transactionCount),
            months: issue.yearMonths.join(', '),
          }),
          cls: 'ne-validation-card-text',
        })
        const actions = card.createDiv('ne-validation-card-actions')
        const select = actions.createEl('select', { cls: 'ne-validation-remap-select' })
        select.createEl('option', { value: '', text: `— ${t('validation.remapTo')} —` })
        for (const w of activeWallets) {
          select.createEl('option', { value: w.name, text: w.name })
        }
        const fixBtn = actions.createEl('button', { text: t('validation.fix'), cls: 'ne-validation-fix-btn' })
        fixBtn.addEventListener('click', () => void (async () => {
          const remapTarget = select.value
          if (remapTarget) {
            await this.walletFile.renameWalletInTransactions(issue.walletName, remapTarget)
          } else {
            await this.walletFile.repairOrphanedWallet(issue.walletName)
          }
          fixBtn.setText('✓')
          fixBtn.disabled = true
          select.disabled = true
        })())
      }
    }
  }

  private async fixAll() {
    let count = 0
    for (const issue of this.issues) {
      if (issue.type === 'frontmatter') {
        await this.walletFile.recalculateFrontmatter(issue.yearMonth)
        count++
      } else if (issue.type === 'orphanedWallet') {
        await this.walletFile.repairOrphanedWallet(issue.walletName)
        count++
      }
    }
    new Notice(tn('validation.repaired', { count: String(count) }))
    this.close()
  }

  onClose() {
    this.contentEl.empty()
  }
}
