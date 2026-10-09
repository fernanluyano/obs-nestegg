import { addIcon } from 'obsidian'

export const NESTEGG_ICON = 'nestegg-egg'

// An egg with a dollar sign, drawn on Obsidian's 100x100 canvas in currentColor so it follows the
// theme like the built-in icons.
const EGG_DOLLAR = `
<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M50 8 C65 8 76 32 76 48 C76 66 64 80 50 80 C36 80 24 66 24 48 C24 32 35 8 50 8 Z"/>
  <path d="M50 28 V68"/>
  <path d="M60 40 C60 33 40 33 40 42 C40 51 60 48 60 57 C60 65 40 65 40 58"/>
</g>`

export function registerIcon(): void {
  addIcon(NESTEGG_ICON, EGG_DOLLAR)
}
