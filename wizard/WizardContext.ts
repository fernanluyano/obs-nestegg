import { App, Notice } from 'obsidian'
import { tn } from '../labels'
import type { Ledger } from '../services/Ledger'

export interface WizardContext {
  app: App
  ledger: Ledger
  // Rebuilds the current step from the latest snapshot.
  rerender(): void
  close(): void
}

// Runs a ledger change, then refreshes the open views and the step; a failure becomes a notice
// and leaves the step as it was.
export async function runAction(ctx: WizardContext, action: () => Promise<void>, notice?: string): Promise<void> {
  try {
    await action()
    if (notice) new Notice(notice)
    ctx.app.workspace.trigger('nestegg:refresh')
    ctx.rerender()
  } catch (e) {
    new Notice(tn('notice.actionFailed', { reason: e instanceof Error ? e.message : String(e) }))
  }
}
