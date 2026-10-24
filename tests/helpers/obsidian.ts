// Vitest resolves the `obsidian` import to this file. The real package ships only type
// declarations, so each class below is just enough for the modules under test to load.
export class App {}

export class TFile {
  path = ''
  basename = ''
  extension = ''
}

export class Modal {
  constructor(public app: unknown) {}
  open() {}
  close() {}
}

export class Notice {
  constructor(public message: string) {}
}

export class Plugin {}

export const normalizePath = (path: string): string => path.replace(/\\/g, '/')
