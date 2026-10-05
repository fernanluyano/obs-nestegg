import { tn } from '../../labels'
import { activeAccounts } from '../../snapshot/queries'
import type { Snapshot } from '../../snapshot/snapshot'

export function renderDone(container: HTMLElement, snapshot: Snapshot): void {
  const categories = snapshot.categories.map(c => c.category)
  container.createEl('p', {
    text: tn('wizard.done.summary', {
      accounts: String(activeAccounts(snapshot).length),
      categories: String(categories.length),
      subcategories: String(categories.reduce((n, c) => n + c.subcategories.length, 0)),
    }),
  })
}
