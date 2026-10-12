import { describe, expect, it } from "vitest";
import { hasTag, kindOf, NOTE_TAGS, stateOf, transitForOf } from "../../notes/kinds";
import {
	accountFolder, accountPath, assetPath, basenameNoExt, categoryPath, dirname, isInsideRoot, monthPath, SETTINGS_PATH, transitPath,
} from "../../notes/paths";
import { markCurrent, markInTransit } from "../../notes/transit";
import { parseProps } from "../../notes/frontmatter";

describe("kinds", () => {
	it("recognizes each plugin note by its tag", () => {
		expect(kindOf({ tags: [NOTE_TAGS.account] })).toBe("account");
		expect(kindOf({ tags: ["x", NOTE_TAGS.category] })).toBe("category");
		expect(kindOf({ tags: NOTE_TAGS.transactions })).toBe("transactions");
		expect(kindOf({ tags: ["#nestegg/settings"] })).toBe("settings");
		expect(kindOf({ tags: [NOTE_TAGS.asset] })).toBe("asset");
	});

	it("ignores other notes", () => {
		expect(kindOf({ tags: ["daily"] })).toBeNull();
		expect(kindOf({})).toBeNull();
		expect(hasTag({ tags: ["a"] }, "b")).toBe(false);
	});

	it("reads state, defaulting to current", () => {
		expect(stateOf({ state: "in_transit" })).toBe("in_transit");
		expect(stateOf({ state: "current" })).toBe("current");
		expect(stateOf({ state: "weird" })).toBe("current");
		expect(stateOf({})).toBe("current");
	});

	it("reads transitFor", () => {
		expect(transitForOf({ transitFor: "a/b.md" })).toBe("a/b.md");
		expect(transitForOf({ transitFor: "" })).toBeUndefined();
		expect(transitForOf({})).toBeUndefined();
	});
});

describe("paths", () => {
	it("lays notes out under the fixed Nestegg folder", () => {
		expect(SETTINGS_PATH).toBe("Nestegg/Settings.md");
		expect(accountFolder("Cash Main")).toBe("Nestegg/Accounts/Cash Main");
		expect(accountPath("Cash Main")).toBe("Nestegg/Accounts/Cash Main/Cash Main.md");
		expect(monthPath("Cash Main", "2026-10")).toBe("Nestegg/Accounts/Cash Main/Transactions/2026-10.md");
		expect(categoryPath("Food")).toBe("Nestegg/Categories/Food.md");
		expect(assetPath("House")).toBe("Nestegg/Assets/House.md");
	});

	it("tells whether a path is inside the root", () => {
		expect(isInsideRoot("Nestegg/Settings.md")).toBe(true);
		expect(isInsideRoot("Nestegg2/x.md")).toBe(false);
		expect(isInsideRoot("Other/x.md")).toBe(false);
	});

	it("splits paths", () => {
		expect(dirname("a/b/c.md")).toBe("a/b");
		expect(dirname("c.md")).toBe("");
		expect(basenameNoExt("a/b/c.md")).toBe("c");
		expect(basenameNoExt("c.md")).toBe("c");
	});

	it("builds the staged name beside the original", () => {
		expect(transitPath("Nestegg/Categories/Food.md")).toBe("Nestegg/Categories/Food (in transit).md");
	});
});

describe("transit marking", () => {
	const note = "---\ntags: [nestegg/category]\nstate: current\nname: Food\n---\nbody\n";

	it("marks a staged copy with its state and the path it replaces", () => {
		const staged = markInTransit(note, "Nestegg/Categories/Food.md");
		expect(parseProps(staged)).toMatchObject({ state: "in_transit", transitFor: "Nestegg/Categories/Food.md" });
		expect(staged.endsWith("body\n")).toBe(true);
	});

	it("restores a staged copy to current and drops the marker", () => {
		const restored = markCurrent(markInTransit(note, "x.md"));
		expect(restored).toBe(note);
	});
});
