import { t } from '../../labels'

export function renderWelcome(container: HTMLElement): void {
  container.createEl('p', { text: t('wizard.welcome.intro') })
  container.createEl('p', { text: t('wizard.welcome.required'), cls: 'ne-wizard-callout' })
}
