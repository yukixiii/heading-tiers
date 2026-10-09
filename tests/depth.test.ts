import { describe, expect, it } from "vitest";
import { computeTiers } from "../src/depth";

/** Indent depth of every line. */
function depths(text: string): number[] {
	return computeTiers(text.split("\n")).tiers.map((t) => t.ancestors.length);
}

function ancestors(text: string): number[][] {
	return computeTiers(text.split("\n")).tiers.map((t) => t.ancestors);
}

describe("computeTiers", () => {
	it("nests by heading level", () => {
		const text = ["# A", "a", "## B", "b", "### C", "c"].join("\n");
		expect(depths(text)).toEqual([0, 1, 1, 2, 2, 3]);
		expect(ancestors(text)[5]).toEqual([1, 2, 3]);
	});

	it("counts nesting, not levels, when levels are skipped", () => {
		const text = ["# A", "### C", "c", "##### E", "e"].join("\n");
		expect(depths(text)).toEqual([0, 1, 2, 2, 3]);
		expect(ancestors(text)[4]).toEqual([1, 3, 5]);
	});

	it("does not push an H2-only note in twice", () => {
		expect(depths(["## A", "a", "## B", "b"].join("\n"))).toEqual([0, 1, 0, 1]);
	});

	it("text before the first heading has depth 0", () => {
		expect(depths(["intro", "# A", "a"].join("\n"))).toEqual([0, 0, 1]);
	});

	it("goes back up to a parent level", () => {
		const text = ["# A", "## B", "### C", "c", "## D", "d", "# E", "e"].join("\n");
		expect(depths(text)).toEqual([0, 1, 2, 3, 1, 2, 0, 1]);
		expect(ancestors(text)[5]).toEqual([1, 2]);
	});

	it("a shallower heading after a deep start closes it", () => {
		expect(depths(["### C", "c", "## B", "b"].join("\n"))).toEqual([0, 1, 0, 1]);
	});

	it("ignores # inside code fences", () => {
		const text = ["# A", "```", "# not", "```", "## B", "~~~~", "## not", "```", "~~~~", "b"].join("\n");
		expect(computeTiers(text.split("\n")).tiers.map((t) => t.headingLevel)).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
		expect(depths(text)).toEqual([0, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
	});

	it("ignores # inside $$ math blocks", () => {
		const text = ["# A", "$$", "# x", "$$", "$$ y $$", "## B"].join("\n");
		expect(computeTiers(text.split("\n")).tiers.map((t) => t.headingLevel)).toEqual([1, 0, 0, 0, 0, 2]);
	});

	it("skips frontmatter and reads the opt-out", () => {
		const text = ["---", "# yaml comment", "heading-tiers: false", "---", "# A", "a"].join("\n");
		const r = computeTiers(text.split("\n"));
		expect(r.disabled).toBe(true);
		expect(r.tiers.map((t) => t.ancestors.length)).toEqual([0, 0, 0, 0, 0, 1]);
		expect(computeTiers(["---", "a: 1", "---"]).disabled).toBe(false);
	});

	it("needs a space after the hashes", () => {
		expect(computeTiers(["#tag", "####### seven", "#", "  ## B"]).tiers.map((t) => t.headingLevel)).toEqual([0, 0, 1, 2]);
	});
});

describe("computeTiers with indentBody: false", () => {
	const flat = { indentBody: false };
	const depthsFlat = (text: string) => computeTiers(text.split("\n"), flat).tiers.map((t) => t.ancestors.length);

	it("lines text up with its heading", () => {
		const text = ["# A", "a", "## B", "b", "### C", "c"].join("\n");
		expect(depthsFlat(text)).toEqual([0, 0, 1, 1, 2, 2]);
		expect(computeTiers(text.split("\n"), flat).tiers[5].ancestors).toEqual([1, 2]);
	});

	it("follows the heading back up", () => {
		const text = ["# A", "## B", "### C", "c", "## D", "d", "# E", "e"].join("\n");
		expect(depthsFlat(text)).toEqual([0, 1, 2, 2, 1, 1, 0, 0]);
	});

	it("treats fenced and math lines as text", () => {
		const text = ["# A", "## B", "```", "# not", "```", "$$", "x", "$$"].join("\n");
		expect(depthsFlat(text)).toEqual([0, 1, 1, 1, 1, 1, 1, 1]);
	});

	it("leaves text before the first heading and frontmatter at 0", () => {
		expect(depthsFlat(["---", "a: 1", "---", "intro", "# A", "a"].join("\n"))).toEqual([0, 0, 0, 0, 0, 0]);
	});
});
