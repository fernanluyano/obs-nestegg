import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian'
import Sortable from 'sortablejs'
import { formatCents, parseCents } from '../money'
import { WalletFile } from '../io/WalletFile'
import { ConfirmModal } from '../modal/ConfirmModal'
import { WalletEditModal } from '../modal/WalletEditModal'
import { Wallet, WalletBalance, WalletType } from '../types'
import { t, tn } from '../labels'

export class NesteggSettingTab extends PluginSettingTab {
  private walletFile: WalletFile

  constructor(app: App, plugin: Plugin, walletFile: WalletFile) {
    super(app, plugin)
    this.walletFile = walletFile
  }

  display(restoreScrollTop?: number): void {
    const { containerEl } = this
    containerEl.empty()

    void (async () => {
      let walletBalances: WalletBalance[] = []
      let walletsWithTransactions = new Set<string>()
      try {
        const data = await this.walletFile.calculateWalletData()
        walletBalances = data.balances
        walletsWithTransactions = data.walletsWithTransactions
      } catch { /* show initial balance only if calculation fails */ }

      this.renderGeneral()
      this.renderActiveWallets(walletBalances, walletsWithTransactions)
      this.renderArchivedWallets()
      this.renderAddWallet()
      this.renderCategories()

      if (restoreScrollTop !== undefined) {
        const scrollEl = containerEl.closest<HTMLElement>('.vertical-tab-content')
        if (scrollEl) scrollEl.scrollTop = restoreScrollTop
      }
    })()
  }

  private getSettingsScrollTop(): number {
    return this.containerEl.closest<HTMLElement>('.vertical-tab-content')?.scrollTop ?? 0
  }

  private renderGeneral() {
    const config = this.walletFile.getConfig()
    const { containerEl } = this

    new Setting(containerEl).setName(t('settings.general')).setHeading()

    const group = containerEl.createDiv('ne-settings-group')

    new Setting(group)
      .setName(t('settings.folderName'))
      .setDesc(t('settings.folderNameDesc'))
      .addText(text => text
        .setValue(config.folderName)
        .onChange((value) => {
          if (value.trim()) {
            this.walletFile.updateConfig({ folderName: value.trim() })
            void this.walletFile.saveConfig()
          }
        }))

    new Setting(group)
      .setName(t('settings.defaultWallet'))
      .setDesc(t('settings.defaultWalletDesc'))
      .addDropdown(drop => {
        const active = config.wallets.filter(w => w.status === 'active')
        for (const w of active) drop.addOption(w.name, w.name)
        drop.setValue(config.defaultWallet)
        drop.onChange((value) => {
          this.walletFile.updateConfig({ defaultWallet: value })
          void this.walletFile.saveConfig()
        })
      })


    new Setting(group)
      .setName(t('settings.autoValidate'))
      .setDesc(t('settings.autoValidateDesc'))
      .addToggle(toggle => toggle
        .setValue(config.autoValidateOnLoad)
        .onChange(async (value) => {
          this.walletFile.updateConfig({ autoValidateOnLoad: value })
          await this.walletFile.saveConfig()
        }),
      )
  }

  private renderActiveWallets(walletBalances: WalletBalance[], walletsWithTransactions: Set<string>) {
    const config = this.walletFile.getConfig()
    const { containerEl } = this

    new Setting(containerEl).setName(t('settings.activeWallets')).setHeading()

    const active = config.wallets.filter(w => w.status === 'active')
    if (active.length === 0) {
      containerEl.createEl('p', { text: t('settings.noActiveWallets'), cls: 'ne-settings-empty' })
      return
    }

    const group = containerEl.createDiv('ne-settings-group')

    for (const wallet of active) {
      group.appendChild(this.buildWalletRow(wallet, walletBalances, walletsWithTransactions))
    }

    Sortable.create(group, {
      animation: 150,
      handle: '.ne-drag-handle',
      ghostClass: 'ne-drag-ghost',
      chosenClass: 'ne-dragging',
      forceFallback: true,
      fallbackOnBody: true,
      scroll: group.closest<HTMLElement>('.vertical-tab-content') ?? true,
      scrollSensitivity: 80,
      scrollSpeed: 8,
      onEnd: (evt: Sortable.SortableEvent) => {
        const from = evt.oldIndex
        const to = evt.newIndex
        if (from === undefined || to === undefined || from === to) return
        const wallets = [...config.wallets]
        const activeIndices = wallets.reduce<number[]>((acc, w, i) => {
          if (w.status === 'active') { acc.push(i) }
          return acc
        }, [])
        const [moved] = wallets.splice(activeIndices[from], 1)
        // Recalculate target index after splice
        const toGlobalIdx = activeIndices[to] > activeIndices[from]
          ? activeIndices[to] - 1
          : activeIndices[to]
        wallets.splice(toGlobalIdx, 0, moved)
        this.walletFile.updateConfig({ wallets })
        void this.walletFile.saveConfig().then(() => {
          new Notice(t('notice.walletReordered'))
          this.app.workspace.trigger('nestegg:refresh')
        })
      },
    })
  }

  private renderArchivedWallets() {
    const config = this.walletFile.getConfig()
    const { containerEl } = this

    const archived = config.wallets.filter(w => w.status === 'archived')
    if (archived.length === 0) return

    new Setting(containerEl).setName(t('settings.archivedWallets')).setHeading()

    const group = containerEl.createDiv('ne-settings-group')

    for (const wallet of archived) {
      const row = group.createDiv('ne-wallet-row')

      const info = row.createDiv('ne-wallet-row-info')
      info.createSpan({ text: wallet.name, cls: 'ne-wallet-row-name' })
      info.createSpan({
        text: t(`label.walletType.${wallet.type}`),
        cls: `ne-wallet-badge ne-badge-${wallet.type}`,
      })
      const descSpan = info.createSpan({
        text: wallet.includeInNetAsset
          ? t('settings.includeInNetAssetOn')
          : t('settings.includeInNetAssetOff'),
        cls: 'ne-wallet-row-desc',
      })

      const actions = row.createDiv('ne-wallet-row-actions')

      const toggleEl = actions.createDiv({ cls: 'checkbox-container' + (wallet.includeInNetAsset ? ' is-enabled' : '') })
      const checkboxEl = toggleEl.createEl('input', { type: 'checkbox' })
      checkboxEl.checked = wallet.includeInNetAsset
      toggleEl.addEventListener('click', () => {
        const newVal = !checkboxEl.checked
        checkboxEl.checked = newVal
        toggleEl.classList.toggle('is-enabled', newVal)
        descSpan.textContent = newVal ? t('settings.includeInNetAssetOn') : t('settings.includeInNetAssetOff')
        const wallets = config.wallets.map(w =>
          w.name === wallet.name ? { ...w, includeInNetAsset: newVal } : w)
        this.walletFile.updateConfig({ wallets })
        void this.walletFile.saveConfig()
      })

      const unarchiveBtn = actions.createEl('button', { text: t('ui.unarchive') })
      unarchiveBtn.dataset['action'] = 'unarchive'
      unarchiveBtn.addEventListener('click', () => {
        new ConfirmModal(this.app, t('confirm.unarchiveWallet'), async () => {
          const scrollTop = this.getSettingsScrollTop()
          const wallets = config.wallets.map(w =>
            w.name === wallet.name ? { ...w, status: 'active' as const } : w)
          this.walletFile.updateConfig({ wallets })
          await this.walletFile.saveConfig()
          void this.display(scrollTop)
        }).open()
      })
    }
  }

  private buildWalletRow(
    wallet: Wallet,
    walletBalances: WalletBalance[],
    walletsWithTransactions: Set<string>,
  ): HTMLElement {
    const config = this.walletFile.getConfig()
    const wb = walletBalances.find(b => b.wallet.name === wallet.name)
    const currentBalance = wb?.balanceCents ?? wallet.initialBalanceCents
    const isDebt = wallet.type === 'creditCard'
    const displayBalance = isDebt
      ? `${t('settings.creditDebtPrefix')}${formatCents(currentBalance)}`
      : formatCents(currentBalance)

    const row = createDiv('ne-wallet-row')

    const handle = row.createDiv('ne-drag-handle')
    const svg = handle.createSvg('svg', { attr: { viewBox: '0 0 16 16', width: '14', height: '14', fill: 'currentColor' } })
    for (const [cx, cy] of [[5,4],[5,8],[5,12],[11,4],[11,8],[11,12]] as [number,number][]) {
      svg.createSvg('circle', { attr: { cx, cy, r: '1.2' } })
    }

    const info = row.createDiv('ne-wallet-row-info')
    info.createSpan({ text: wallet.name, cls: 'ne-wallet-row-name' })
    info.createSpan({ text: t(`label.walletType.${wallet.type}`), cls: `ne-wallet-badge ne-badge-${wallet.type}` })

    row.createSpan({ text: displayBalance, cls: `ne-wallet-row-balance${isDebt ? ' is-debt' : ''}` })

    const actions = row.createDiv('ne-wallet-row-actions')

    const editBtn = actions.createEl('button', { text: t('ui.edit') })
    editBtn.dataset['action'] = 'edit'
    editBtn.addEventListener('click', () => {
      new WalletEditModal(this.app, wallet, async (updated) => {
        const scrollTop = this.getSettingsScrollTop()
        const wallets = config.wallets.map(w => w.name === wallet.name ? { ...w, ...updated } : w)
        if (updated.name && updated.name !== wallet.name && config.defaultWallet === wallet.name) {
          this.walletFile.updateConfig({ wallets, defaultWallet: updated.name })
        } else {
          this.walletFile.updateConfig({ wallets })
        }
        await this.walletFile.saveConfig()
        if (updated.name && updated.name !== wallet.name) {
          await this.walletFile.renameWalletInTransactions(wallet.name, updated.name)
        }
        this.app.workspace.trigger('nestegg:refresh')
        void this.display(scrollTop)
      }).open()
    })

    const actionBtn = actions.createEl('button')
    if (walletsWithTransactions.has(wallet.name)) {
      actionBtn.textContent = t('ui.archive')
      actionBtn.dataset['action'] = 'archive'
      actionBtn.classList.add('mod-warning')
      actionBtn.addEventListener('click', () => {
        new ConfirmModal(this.app, t('confirm.archiveWallet'), async () => {
          const scrollTop = this.getSettingsScrollTop()
          const wallets = config.wallets.map(w =>
            w.name === wallet.name ? { ...w, status: 'archived' as const } : w)
          this.walletFile.updateConfig({ wallets })
          await this.walletFile.saveConfig()
          void this.display(scrollTop)
        }).open()
      })
    } else {
      actionBtn.textContent = t('ui.delete')
      actionBtn.dataset['action'] = 'delete'
      actionBtn.classList.add('mod-warning')
      actionBtn.addEventListener('click', () => {
        new ConfirmModal(this.app, t('confirm.deleteWallet'), async () => {
          const scrollTop = this.getSettingsScrollTop()
          const wallets = config.wallets.filter(w => w.name !== wallet.name)
          const defaultWallet = config.defaultWallet === wallet.name
            ? (wallets.find(w => w.status === 'active')?.name ?? '')
            : config.defaultWallet
          this.walletFile.updateConfig({ wallets, defaultWallet })
          await this.walletFile.saveConfig()
          void this.display(scrollTop)
        }).open()
      })
    }

    return row
  }

  private buildAddWalletForm(cardEl: HTMLElement): {
    getName: () => string
    getType: () => WalletType
    getBalance: () => number
    bindSubmitKey: (handler: () => void) => void
  } {
    const formEl = cardEl.createDiv('ne-add-wallet-form')

    let name = ''
    const nameField = formEl.createDiv('ne-add-wallet-field')
    nameField.createEl('label', { text: t('settings.walletName'), cls: 'ne-setting-input-subtitle' })
    const nameInput = nameField.createEl('input', {
      type: 'text', placeholder: t('settings.walletName'), cls: 'ne-add-wallet-input',
    })
    nameInput.addEventListener('input', () => { name = nameInput.value.trim() })

    let type: WalletType = 'cash'
    const typeField = formEl.createDiv('ne-add-wallet-field')
    typeField.createEl('label', { text: t('settings.walletType'), cls: 'ne-setting-input-subtitle' })
    const typeSelect = typeField.createEl('select', { cls: 'ne-add-wallet-input' })
    const walletTypes: WalletType[] = ['cash', 'bank', 'creditCard']
    for (const wt of walletTypes) {
      typeSelect.createEl('option', { value: wt, text: t(`label.walletType.${wt}`) })
    }
    typeSelect.value = 'cash'

    let balance = 0
    const balanceField = formEl.createDiv('ne-add-wallet-field')
    balanceField.createEl('label', { text: t('settings.initialBalance'), cls: 'ne-setting-input-subtitle' })
    const balanceInput = balanceField.createEl('input', { type: 'number', placeholder: '0.00', cls: 'ne-add-wallet-input' })
    balanceInput.addEventListener('input', () => { balance = parseCents(balanceInput.value) ?? 0 })

    const balanceHintEl = cardEl.createDiv('ne-balance-hint')
    const updateBalanceHint = () => {
      balanceHintEl.textContent = type === 'creditCard'
        ? t('settings.creditBalanceHint')
        : t('settings.cashBankBalanceHint')
    }
    typeSelect.addEventListener('change', () => { type = typeSelect.value as WalletType; updateBalanceHint() })
    updateBalanceHint()

    return {
      getName: () => name,
      getType: () => type,
      getBalance: () => balance,
      bindSubmitKey: (handler) => {
        for (const el of [nameInput as HTMLElement, typeSelect as HTMLElement, balanceInput as HTMLElement]) {
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handler() }
          })
        }
      },
    }
  }

  private renderAddWallet() {
    const { containerEl } = this
    new Setting(containerEl).setName(t('settings.addWallet')).setHeading()

    const cardEl = containerEl.createDiv('ne-card ne-add-wallet-card')
    const form = this.buildAddWalletForm(cardEl)

    const submitRow = cardEl.createDiv('ne-add-wallet-submit')
    const addBtn = submitRow.createEl('button', { text: t('settings.addWallet'), cls: 'mod-cta' })

    const submitAddWallet = async () => {
      const scrollTop = this.getSettingsScrollTop()
      const config = this.walletFile.getConfig()
      const name = form.getName()
      const type = form.getType()
      const balance = form.getBalance()
      if (!name) { new Notice(t('err.walletNameEmpty')); return }
      if (config.wallets.some(w => w.name === name)) { new Notice(t('err.walletNameDuplicate')); return }
      if ((type === 'cash' || type === 'bank') && balance < 0) { new Notice(t('err.cashBankNegativeBalance')); return }
      if (type === 'creditCard' && balance < 0) { new Notice(t('err.creditNegativeBalance')); return }
      const newWallet: Wallet = { name, type, initialBalanceCents: balance, status: 'active', includeInNetAsset: true }
      this.walletFile.updateConfig({ wallets: [...config.wallets, newWallet] })
      await this.walletFile.saveConfig()
      new Notice(tn('notice.walletAdded', { name }))
      void this.display(scrollTop)
    }

    addBtn.addEventListener('click', () => { void submitAddWallet() })
    form.bindSubmitKey(() => { void submitAddWallet() })
  }

  private renderCategories() {
    const config = this.walletFile.getConfig()
    const { containerEl } = this

    new Setting(containerEl).setName(t('settings.customCategories')).setHeading()
    const cardEl = containerEl.createDiv('ne-card ne-category-card')

    const expenseCustom = config.options.categories.expense.custom
    const incomeCustom = config.options.categories.income.custom
    const transferCustom = config.options.categories.transfer.custom

    this.renderCategorySection(
      cardEl,
      t('settings.expenseCategories'),
      expenseCustom,
      [...incomeCustom, ...transferCustom],
      config.options.categories.expense.default,
      async (updated) => {
        const scrollTop = this.getSettingsScrollTop()
        this.walletFile.updateCustomCategories('expense', updated)
        await this.walletFile.saveConfig()
        this.app.workspace.trigger('nestegg:refresh')
        this.display(scrollTop)
      },
    )

    cardEl.createEl('hr', { cls: 'ne-category-divider' })

    this.renderCategorySection(
      cardEl,
      t('settings.incomeCategories'),
      incomeCustom,
      [...expenseCustom, ...transferCustom],
      config.options.categories.income.default,
      async (updated) => {
        const scrollTop = this.getSettingsScrollTop()
        this.walletFile.updateCustomCategories('income', updated)
        await this.walletFile.saveConfig()
        this.app.workspace.trigger('nestegg:refresh')
        this.display(scrollTop)
      },
    )

    cardEl.createEl('hr', { cls: 'ne-category-divider' })

    this.renderCategorySection(
      cardEl,
      t('settings.transferCategories'),
      transferCustom,
      [...expenseCustom, ...incomeCustom],
      config.options.categories.transfer.default,
      async (updated) => {
        const scrollTop = this.getSettingsScrollTop()
        this.walletFile.updateCustomCategories('transfer', updated)
        await this.walletFile.saveConfig()
        this.app.workspace.trigger('nestegg:refresh')
        this.display(scrollTop)
      },
    )
  }

  private renderCategorySection(
    container: HTMLElement,
    title: string,
    categories: string[],
    otherCategories: string[],
    defaultKeys: readonly string[],
    onChange: (updated: string[]) => void | Promise<void>,
  ) {
    container.createEl('div', { text: title, cls: 'ne-setting-input-subtitle' })

    const tagsEl = container.createDiv('ne-category-tags')
    for (const cat of categories) {
      const tag = tagsEl.createDiv('ne-category-tag')
      tag.createEl('span', { text: cat })
      const removeBtn = tag.createEl('button', { cls: 'ne-tag-remove' })
      const svg = removeBtn.createSvg('svg', { attr: { viewBox: '0 0 10 10', width: '10', height: '10', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' } })
      svg.createSvg('line', { attr: { x1: '2', y1: '2', x2: '8', y2: '8' } })
      svg.createSvg('line', { attr: { x1: '8', y1: '2', x2: '2', y2: '8' } })
      removeBtn.addEventListener('click', () => {
        void onChange(categories.filter(c => c !== cat))
      })
    }

    const addRow = container.createDiv('ne-category-add-row')
    const input = addRow.createEl('input', {
      type: 'text',
      placeholder: t('settings.categoryPlaceholder'),
      cls: 'ne-category-input',
    })
    const addBtn = addRow.createEl('button', { text: t('settings.addCategory'), cls: 'mod-cta' })
    addBtn.addEventListener('click', () => {
      const val = input.value.trim()
      if (!val) return
      if (defaultKeys.includes(val))     { new Notice(t('err.categoryExists')); return }
      if (categories.includes(val))      { new Notice(t('err.categoryExists')); return }
      if (otherCategories.includes(val)) { new Notice(t('err.categoryExistsInOtherList')); return }
      void onChange([...categories, val])
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn.click()
    })
  }
}
