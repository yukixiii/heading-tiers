import { RangeSetBuilder, type Text } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	layer,
	type LayerMarker,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { computeTiers, type TierResult } from "./depth";
import { STYLE_PROPS, styleEntries, tierStyle } from "./style";

const tierCache = new WeakMap<Text, TierResult>();

function tiersOf(doc: Text): TierResult {
	let r = tierCache.get(doc);
	if (!r) {
		r = computeTiers(Array.from(doc.iterLines()));
		tierCache.set(doc, r);
	}
	return r;
}

// ---------- Indent: line decorations ----------

const lineDecoCache = new Map<string, Decoration>();

function lineDeco(ancestors: readonly number[]): Decoration {
	const style = tierStyle(ancestors);
	let d = lineDecoCache.get(style);
	if (!d) {
		d = Decoration.line({ attributes: { class: "ht-line", style } });
		lineDecoCache.set(style, d);
	}
	return d;
}

function build(view: EditorView): DecorationSet {
	const { doc } = view.state;
	const { tiers, disabled } = tiersOf(doc);
	if (disabled) return Decoration.none;
	const b = new RangeSetBuilder<Decoration>();
	let last = -1;
	for (const { from, to } of view.visibleRanges) {
		const end = doc.lineAt(to).number;
		for (let n = doc.lineAt(from).number; n <= end; n++) {
			if (n <= last) continue;
			last = n;
			const t = tiers[n - 1];
			if (t && t.ancestors.length > 0) {
				const pos = doc.line(n).from;
				b.add(pos, pos, lineDeco(t.ancestors));
			}
		}
	}
	return b.finish();
}

// ---------- Indent: block widgets ----------

/**
 * Block widgets (tables, callouts, math, note embeds in Live Preview) are not lines, so line
 * decorations miss them. Tag their DOM with the same variables instead.
 */
function tagBlocks(view: EditorView) {
	const { doc } = view.state;
	const { tiers, disabled } = tiersOf(doc);
	const blocks = view.contentDOM.querySelectorAll<HTMLElement>(":scope > :not(.cm-line):not(.cm-widgetBuffer)");
	const updates: [HTMLElement, string | null][] = [];
	blocks.forEach((el) => {
		let style: string | null = null;
		if (!disabled) {
			try {
				const t = tiers[doc.lineAt(view.posAtDOM(el)).number - 1];
				if (t && t.ancestors.length > 0) style = tierStyle(t.ancestors);
			} catch {
				// Not mapped to the document (being torn down); leave it alone.
			}
		}
		if (el.dataset.htStyle !== (style ?? undefined)) updates.push([el, style]);
	});
	return updates;
}

function applyBlocks(updates: [HTMLElement, string | null][]) {
	for (const [el, style] of updates) {
		for (const p of STYLE_PROPS) el.style.removeProperty(p);
		if (style === null) {
			el.classList.remove("ht-block");
			delete el.dataset.htStyle;
			continue;
		}
		for (const [p, v] of styleEntries(style)) el.style.setProperty(p, v);
		el.classList.add("ht-block");
		el.dataset.htStyle = style;
	}
}

const indentPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = build(view);
			this.scheduleBlocks(view);
		}

		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
			this.scheduleBlocks(u.view);
		}

		scheduleBlocks(view: EditorView) {
			view.requestMeasure({
				key: this,
				read: () => tagBlocks(view),
				write: (updates) => applyBlocks(updates),
			});
		}
	},
	{ decorations: (v) => v.decorations },
);

// ---------- Guides: a layer behind the text ----------

/**
 * One vertical bar for a run of consecutive lines under the same heading.
 * Drawn in a layer, not on the lines, so widgets that clip their overflow,
 * code-block borders and line gaps don't affect it.
 */
class GuideMarker implements LayerMarker {
	constructor(
		readonly level: number,
		readonly left: number,
		readonly top: number,
		readonly height: number,
	) {}

	draw(): HTMLElement {
		const el = document.createElement("div");
		this.adjust(el);
		return el;
	}

	update(el: HTMLElement, prev: LayerMarker): boolean {
		if (!(prev instanceof GuideMarker)) return false;
		this.adjust(el);
		return true;
	}

	eq(other: LayerMarker): boolean {
		return (
			other instanceof GuideMarker &&
			other.level === this.level &&
			other.left === this.left &&
			other.top === this.top &&
			other.height === this.height
		);
	}

	private adjust(el: HTMLElement) {
		el.className = `ht-guide ht-guide-${this.level}`;
		el.style.left = `${this.left}px`;
		el.style.top = `${this.top}px`;
		el.style.height = `${this.height}px`;
	}
}

function px(style: CSSStyleDeclaration, name: string, def: number): number {
	const v = parseFloat(style.getPropertyValue(name));
	return Number.isFinite(v) ? v : def;
}

function guideMarkers(view: EditorView): LayerMarker[] {
	const body = document.body;
	if (body.classList.contains("ht-off") || body.classList.contains("ht-no-guides")) return [];
	const { doc } = view.state;
	const { tiers, disabled } = tiersOf(doc);
	if (disabled) return [];

	const bodyStyle = getComputedStyle(body);
	const indent = px(bodyStyle, "--ht-indent", 24);
	const offset = px(bodyStyle, "--ht-guide-offset", 2);

	// Same coordinate base that CodeMirror's own layers (selection, cursor) use.
	// (scaleX/scaleY are missing in older CodeMirror builds.)
	const sx = view.scaleX || 1;
	const sy = view.scaleY || 1;
	const scroll = view.scrollDOM.getBoundingClientRect();
	const baseLeft = scroll.left - view.scrollDOM.scrollLeft * sx;
	const baseTop = scroll.top - view.scrollDOM.scrollTop * sy;
	const content = view.contentDOM.getBoundingClientRect();
	const x0 = (content.left - baseLeft) / sx + px(getComputedStyle(view.contentDOM), "padding-left", 0) + offset;
	const y0 = (view.documentTop - baseTop) / sy;

	const markers: LayerMarker[] = [];
	// Open runs by guide index: [level, top, bottom].
	let open: [number, number, number][] = [];
	const close = (from: number) => {
		for (let i = from; i < open.length; i++) {
			const [level, top, bottom] = open[i];
			markers.push(new GuideMarker(level, x0 + i * indent, y0 + top, bottom - top));
		}
		open = open.slice(0, from);
	};

	for (const block of view.viewportLineBlocks) {
		const t = tiers[doc.lineAt(block.from).number - 1];
		const ancestors = t ? t.ancestors : [];
		// Keep the runs that continue: same level at the same index, touching the previous block.
		let keep = 0;
		while (
			keep < open.length &&
			keep < ancestors.length &&
			open[keep][0] === ancestors[keep] &&
			Math.abs(open[keep][2] - block.top) < 1
		)
			keep++;
		close(keep);
		for (let i = 0; i < keep; i++) open[i][2] = block.bottom;
		for (let i = keep; i < ancestors.length; i++) open.push([ancestors[i], block.top, block.bottom]);
	}
	close(0);
	return markers;
}

const guideLayer = layer({
	above: false,
	class: "ht-guides",
	markers: guideMarkers,
	update: (u) => u.docChanged || u.viewportChanged || u.geometryChanged || u.transactions.some((tr) => tr.reconfigured),
});

export const headingTiersEditor = [indentPlugin, guideLayer];
