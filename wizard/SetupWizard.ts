import { App, Events, Modal, Notice } from 'obsidian'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { canAdvance, nextStep, prevStep, WIZARD_STEPS, type WizardStep } from './model'
import { renderAccounts } from './steps/accountsStep'
import { renderCategories } from './steps/categoriesStep'
import { renderDone } from './steps/doneStep'
import { renderGeneral } from './steps/generalStep'
import { renderWelcome } from './steps/welcomeStep'
import type { WizardContext } from './WizardContext'

export class SetupWizard extends Modal {
  private step: WizardStep = 'welcome'
  private bodyEl!: HTMLElement
  private footerEl!: HTMLElement
  private headingEl!: HTMLElement

  constructor(app: App, private ledger: Ledger) {
    super(app)
  }

  onOpen() {
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wizard-container')
    contentEl.empty()
    contentEl.addClass('ne-modal', 'ne-wizard')
    this.headingEl = contentEl.createEl('h2')
    this.bodyEl = contentEl.createDiv('ne-wizard-body')
    this.footerEl = contentEl.createDiv('ne-btn-row ne-wizard-footer')
    this.render()
  }

  private context(): WizardContext {
    return { app: this.app, ledger: this.ledger, rerender: () => this.render() }
  }

  private render() {
    const scroll = this.bodyEl.scrollTop
    const index = WIZARD_STEPS.indexOf(this.step)
    this.headingEl.setText(`${t(`wizard.${this.step}.title`)}  ·  ${tn('wizard.stepOf', { n: String(index + 1), total: String(WIZARD_STEPS.length) })}`)

    this.bodyEl.empty()
    const ctx = this.context()
    switch (this.step) {
      case 'welcome': renderWelcome(this.bodyEl); break
      case 'accounts': renderAccounts(this.bodyEl, ctx); break
      case 'categories': renderCategories(this.bodyEl, ctx); break
      case 'general': renderGeneral(this.bodyEl, ctx); break
      case 'done': renderDone(this.bodyEl, this.ledger.snapshot); break
    }
    this.bodyEl.scrollTop = scroll
    this.renderFooter()
  }

  private renderFooter() {
    this.footerEl.empty()
    if (this.step !== 'welcome') {
      this.footerEl.createEl('button', { text: t('wizard.back') }).addEventListener('click', () => this.go(prevStep(this.step)))
    }
    const last = this.step === 'done'
    const next = this.footerEl.createEl('button', { text: last ? t('wizard.finish') : t('wizard.next'), cls: 'mod-cta' })
    next.addEventListener('click', () => (last ? this.close() : this.advance()))
  }

  private go(step: WizardStep) {
    this.step = step
    this.render()
  }

  private advance() {
    const check = canAdvance(this.step, this.ledger.snapshot)
    if (!check.ok) {
      new Notice(tn(check.reason, check.vars ?? {}))
      return
    }
    this.go(nextStep(this.step))
  }

  onClose() {
    this.containerEl.removeClass('ne-wizard-container')
    this.contentEl.empty()
    ;(this.app.workspace as Events).trigger('nestegg:refresh')
  }
}
