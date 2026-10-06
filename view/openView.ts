import type { App } from 'obsidian'

// Shows the view of this type, reusing its tab when one is already open.
export async function openOrRevealView(app: App, type: string, state?: Record<string, unknown>): Promise<void> {
  const { workspace } = app
  const leaf = workspace.getLeavesOfType(type)[0] ?? workspace.getLeaf('tab')
  await leaf.setViewState({ type, active: true, state })
  void workspace.revealLeaf(leaf)
}
