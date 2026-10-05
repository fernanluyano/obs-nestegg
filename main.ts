import { Notice, Plugin } from "obsidian";

export default class NesteggPlugin extends Plugin {
	onload(): void {
		this.addRibbonIcon("wallet", "Nestegg", () => {
			new Notice("Nestegg");
		});
	}
}
