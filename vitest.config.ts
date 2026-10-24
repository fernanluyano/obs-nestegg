import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: { obsidian: fileURLToPath(new URL("./tests/helpers/obsidian.ts", import.meta.url)) },
	},
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: [
				"*.ts",
				"domain/*.ts",
				"notes/*.ts",
				"snapshot/*.ts",
				"validation/*.ts",
				"rename/*.ts",
				"services/*.ts",
				"storage/*.ts",
				"table/*.ts",
				"modal/assetState.ts",
				"modal/balanceCorrectionState.ts",
				"modal/bucketState.ts",
				"modal/entryDraft.ts",
				"modal/tagSheetState.ts",
				"modal/keypadState.ts",
				"view/txRowText.ts",
				"view/budgetRow.ts",
				"view/debtRows.ts",
				"view/detail/filters.ts",
				"view/detail/selection.ts",
				"wizard/model.ts",
			],
			// Files that drive the Obsidian API directly aren't unit tested per this project's
			// convention (see CLAUDE.md): everything else, including the services, runs against an
			// in-memory vault. Type-only files hold no logic.
			exclude: [
				"main.ts", "*.config.ts", "labels.ts", "svg.d.ts",
				"**/types.ts", "validation/issues.ts", "storage/VaultPort.ts", "storage/ObsidianVault.ts",
			],
			thresholds: {
				lines: 95,
				statements: 95,
				functions: 95,
				branches: 90,
			},
		},
	},
});
