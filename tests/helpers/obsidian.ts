// Stands in for the `obsidian` package, which ships types only, so modules that import it can load under Vitest.
export class TFile {
  path = ''
  basename = ''
  extension = ''
}

export const normalizePath = (p: string) => p.replace(/\\/g, '/')

export class App {}
export class Modal {
  app: unknown
  constructor(app: unknown) { this.app = app }
  open() {}
  close() {}
}
export class Notice { constructor(_: string) {} }
export class Plugin {}
