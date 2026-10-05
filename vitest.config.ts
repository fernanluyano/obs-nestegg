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
				"io/WalletFile.ts",
				"modal/transactionState.ts",
				"modal/mobileCalculatorState.ts",
				"modal/TagPicker.ts",
				"view/detailRow.ts",
			],
			// Files that drive the Obsidian API directly aren't unit tested per this
			// project's convention (see CLAUDE.md) — only pure logic modules carry coverage.
			exclude: ["main.ts", "*.config.ts", "types.ts", "labels.ts", "svg.d.ts"],
			thresholds: {
				lines: 50,
				statements: 50,
				functions: 50,
				branches: 50,
			},
		},
	},
});
