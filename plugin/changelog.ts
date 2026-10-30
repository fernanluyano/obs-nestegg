import { Plugin } from 'obsidian'
import { isUpdateFrom } from '../changelog'
import { ChangelogModal } from '../modal/ChangelogModal'

// Per device, like the theme: it lives in data.json, which is re-read before every write so the
// theme saved elsewhere in the same file is never overwritten with a stale copy.
export async function maybeShowChangelog(plugin: Plugin): Promise<void> {
  const current = plugin.manifest.version
  const stored = ((await plugin.loadData()) ?? {}) as { lastSeenVersion?: string }
  if (stored.lastSeenVersion === current) return
  await plugin.saveData({ ...stored, lastSeenVersion: current })
  if (isUpdateFrom(stored.lastSeenVersion, current)) new ChangelogModal(plugin.app, current).open()
}
