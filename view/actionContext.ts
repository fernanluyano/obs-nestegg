import { App, Notice } from 'obsidian'
import { tn } from '../labels'
import type { Ledger } from '../services/Ledger'

export interface ActionContext {
  app: App
  ledger: Ledger
}

// Runs a ledger change, then refreshes the open views; a failure becomes a notice and leaves the
// screen as it was.
export async function runAction(ctx: ActionContext, action: () => Promise<void>, notice?: string): Promise<void> {
  try {
    await action()
    if (notice) new Notice(notice)
    ctx.app.workspace.trigger('nestegg:refresh')
  } catch (e) {
    new Notice(tn('notice.actionFailed', { reason: e instanceof Error ? e.message : String(e) }))
  }
}
