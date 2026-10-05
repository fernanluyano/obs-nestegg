import { App, Modal, Notice } from 'obsidian'
import { todayString } from '../domain/dates'
import { t, tn } from '../labels'
import { applyFix } from '../services/fixes'
import type { Ledger } from '../services/Ledger'
import { describeIssue, groupBySection, type IssueFix, type IssueView } from '../validation/describe'
import type { ValidationIssue } from '../validation/issues'

export class ValidationModal extends Modal {
  private views: IssueView[]

  constructor(app: App, private ledger: Ledger, issues: ValidationIssue[], private onChange: () => void = () => {}) {
    super(app)
    this.views = issues.map(describeIssue)
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('ne-validation-modal')

    const header = contentEl.createDiv('ne-validation-header')
    const closeBtn = header.createDiv('ne-validation-close-btn')
    closeBtn.setText('✕')
    closeBtn.addEventListener('click', () => this.close())
    header.createEl('h2', { text: t('validation.modalTitle'), cls: 'ne-validation-title' })
    header.createDiv('ne-validation-header-spacer')

    this.renderSections(contentEl.createDiv('ne-validation-content'))

    contentEl.createDiv('ne-validation-divider')
    const footer = contentEl.createDiv('ne-validation-footer')
    const fixAllBtn = footer.createEl('button', { text: t('validation.fixAll'), cls: 'ne-validation-fix-all-btn' })
    fixAllBtn.disabled = !this.views.some(v => v.auto)
    fixAllBtn.addEventListener('click', () => void this.fixAll())
  }

  private renderSections(container: HTMLElement) {
    for (const [section, views] of groupBySection(this.views)) {
      const sectionEl = container.createDiv('ne-validation-section')
      sectionEl.createEl('span', { text: t(section), cls: 'ne-validation-section-label' })
      for (const view of views) this.renderCard(sectionEl, view)
    }
  }

  private renderCard(container: HTMLElement, view: IssueView) {
    const card = container.createDiv('ne-validation-card')
    card.createEl('p', { text: view.text, cls: 'ne-validation-card-text' })
    if (view.fixes.length === 0) return
    const footer = card.createDiv('ne-validation-card-footer')
    for (const fix of view.fixes) this.renderFixButton(footer, fix)
  }

  private renderFixButton(container: HTMLElement, fix: IssueFix) {
    const btn = container.createEl('button', { text: t(fix.label), cls: 'ne-validation-fix-btn' })
    btn.addEventListener('click', () => void (async () => {
      btn.disabled = true
      if (await this.tryFix(fix)) btn.setText('✓')
      else btn.disabled = false
    })())
  }

  private async tryFix(fix: IssueFix): Promise<boolean> {
    try {
      await applyFix(this.ledger, fix.action, todayString())
      this.onChange()
      return true
    } catch (e) {
      new Notice(tn('notice.fixFailed', { reason: e instanceof Error ? e.message : String(e) }))
      return false
    }
  }

  private async fixAll() {
    let count = 0
    for (const view of this.views) {
      if (view.auto && await this.tryFix(view.fixes[0])) count++
    }
    new Notice(tn('validation.repaired', { count: String(count) }))
    this.close()
  }

  onClose() {
    this.contentEl.empty()
  }
}
