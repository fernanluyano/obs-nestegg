import { App, Modal, Notice } from 'obsidian'
import { todayString } from '../domain/dates'
import { t, tn } from '../labels'
import { applyFix } from '../services/fixes'
import type { Ledger } from '../services/Ledger'
import { describeIssue, groupBySection, type IssueFix, type IssueView } from '../validation/describe'
import type { ValidationIssue } from '../validation/issues'

const reasonOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

// Lists what the data check found, grouped by section, with a button per available fix and one
// to apply every automatic fix at once.
export class IssueReviewModal extends Modal {
  private readonly findings: IssueView[]

  constructor(app: App, private ledger: Ledger, issues: ValidationIssue[], private onChange: () => void = () => {}) {
    super(app)
    this.findings = issues.map(describeIssue)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('ne-validation-modal')

    const top = contentEl.createDiv('ne-validation-header')
    const closeX = top.createDiv('ne-validation-close-btn')
    closeX.setText('✕')
    closeX.addEventListener('click', () => this.close())
    top.createEl('h2', { text: t('validation.modalTitle'), cls: 'ne-validation-title' })
    top.createDiv('ne-validation-header-spacer')

    this.drawSections(contentEl.createDiv('ne-validation-content'))

    contentEl.createDiv('ne-validation-divider')
    const bottom = contentEl.createDiv('ne-validation-footer')
    const fixAll = bottom.createEl('button', { text: t('validation.fixAll'), cls: 'ne-validation-fix-all-btn' })
    fixAll.disabled = !this.findings.some(finding => finding.auto)
    fixAll.addEventListener('click', () => void this.applyAutomaticFixes())
  }

  private drawSections(parent: HTMLElement) {
    for (const [section, findings] of groupBySection(this.findings)) {
      const block = parent.createDiv('ne-validation-section')
      block.createEl('span', { text: t(section), cls: 'ne-validation-section-label' })
      for (const finding of findings) this.drawFinding(block, finding)
    }
  }

  private drawFinding(parent: HTMLElement, finding: IssueView) {
    const card = parent.createDiv('ne-validation-card')
    card.createEl('p', { text: finding.text, cls: 'ne-validation-card-text' })
    if (finding.fixes.length === 0) return
    const actions = card.createDiv('ne-validation-card-footer')
    for (const fix of finding.fixes) this.drawFixButton(actions, fix)
  }

  private drawFixButton(parent: HTMLElement, fix: IssueFix) {
    const button = parent.createEl('button', { text: t(fix.label), cls: 'ne-validation-fix-btn' })
    button.addEventListener('click', () => void (async () => {
      button.disabled = true
      if (await this.attempt(fix)) button.setText('✓')
      else button.disabled = false
    })())
  }

  private async attempt(fix: IssueFix): Promise<boolean> {
    try {
      await applyFix(this.ledger, fix.action, todayString())
      this.onChange()
      return true
    } catch (error) {
      new Notice(tn('notice.fixFailed', { reason: reasonOf(error) }))
      return false
    }
  }

  private async applyAutomaticFixes() {
    let repaired = 0
    for (const finding of this.findings) {
      if (finding.auto && await this.attempt(finding.fixes[0])) repaired++
    }
    new Notice(tn('validation.repaired', { count: String(repaired) }))
    this.close()
  }

  onClose() {
    this.contentEl.empty()
  }
}
