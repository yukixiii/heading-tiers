import type { MarkdownPostProcessorContext } from "obsidian";
import { computeTiers, type TierResult } from "./depth";
import { styleEntries, tierStyle } from "./style";

let lastText: string | null = null;
let lastResult: TierResult | null = null;

function tiersOf(text: string): TierResult {
	if (text !== lastText) {
		lastText = text;
		lastResult = computeTiers(text.split("\n"));
	}
	return lastResult!;
}

/** Tags one rendered section of Reading view with its depth and guides. */
export function processSection(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	// Embedded notes, dataview output and some callout internals have no section info.
	const info = ctx.getSectionInfo(el);
	if (!info) return;
	const { tiers, disabled } = tiersOf(info.text);
	const t = tiers[info.lineStart];
	if (disabled || !t) return;
	const style = tierStyle(t.ancestors);
	for (const [p, v] of styleEntries(style)) el.style.setProperty(p, v);
	el.classList.add("ht-section");
	requestAnimationFrame(() => measureGaps(el, 0));
}

/**
 * Guides are stretched over the collapsed margin between sections. The gap is
 * only known after layout, so measure it once the section is in the document.
 * A table section can't stretch (it clips), so the section above it stretches
 * down instead.
 */
function measureGaps(el: HTMLElement, tries: number) {
	if (!el.isConnected || el.offsetHeight === 0) {
		if (tries < 30) requestAnimationFrame(() => measureGaps(el, tries + 1));
		return;
	}
	const r = el.getBoundingClientRect();
	const prev = el.previousElementSibling;
	if (prev instanceof HTMLElement && prev.classList.contains("ht-section") && prev.offsetHeight > 0) {
		const gap = `${Math.max(0, r.top - prev.getBoundingClientRect().bottom)}px`;
		if (el.classList.contains("el-table")) prev.style.setProperty("--ht-gap-below", gap);
		else el.style.setProperty("--ht-gap-above", gap);
	}
	const next = el.nextElementSibling;
	if (next instanceof HTMLElement && next.classList.contains("el-table") && next.classList.contains("ht-section")) {
		el.style.setProperty("--ht-gap-below", `${Math.max(0, next.getBoundingClientRect().top - r.bottom)}px`);
	}
}

/** Levels of a note's headings in order; Reading view must rerender when this changes. */
export function headingSignature(headings: { level: number }[] | undefined): string {
	return (headings ?? []).map((h) => h.level).join("");
}
