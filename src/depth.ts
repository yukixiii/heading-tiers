/** One line's position in the heading tree. */
export interface Tier {
	/** 1–6 when the line is an ATX heading, otherwise 0. */
	headingLevel: number;
	/**
	 * Levels of the headings this line sits under, outermost first.
	 * Its length is the indent depth. A heading line lists only its parents.
	 */
	ancestors: number[];
}

export interface TierResult {
	tiers: Tier[];
	/** True when the frontmatter has `heading-tiers: false`. */
	disabled: boolean;
	/** The option the result was computed with, for cache checks. */
	indentBody: boolean;
}

export interface TierOptions {
	/**
	 * Indent text one level deeper than its heading. When false, non-heading
	 * lines drop their innermost ancestor and line up with their heading.
	 */
	indentBody: boolean;
}

/** Current options, set by the plugin from its settings. */
export const tierOptions: TierOptions = { indentBody: true };

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const MATH = /^\s*\$\$/;
const OPT_OUT = /^heading-tiers:\s*(false|no|off)\s*$/i;

const EMPTY: number[] = [];

export function computeTiers(lines: readonly string[], opts: TierOptions = { indentBody: true }): TierResult {
	const { indentBody } = opts;
	const tiers: Tier[] = new Array(lines.length);
	let disabled = false;
	let i = 0;

	// YAML frontmatter: only when the very first line is "---".
	if (lines.length > 0 && lines[0].trimEnd() === "---") {
		let end = -1;
		for (let j = 1; j < lines.length; j++) {
			const l = lines[j].trimEnd();
			if (l === "---" || l === "...") {
				end = j;
				break;
			}
		}
		if (end > 0) {
			for (; i <= end; i++) {
				if (OPT_OUT.test(lines[i].trim())) disabled = true;
				tiers[i] = { headingLevel: 0, ancestors: EMPTY };
			}
		}
	}

	// Open headings, outermost first. Shared arrays are copied on change only.
	let stack: number[] = [];
	// What non-heading lines use: the stack, or the stack without its innermost heading.
	let body: number[] = stack;
	let fence: string | null = null;
	let inMath = false;

	for (; i < lines.length; i++) {
		const line = lines[i];

		if (fence !== null) {
			const m = FENCE.exec(line);
			if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
			tiers[i] = { headingLevel: 0, ancestors: body };
			continue;
		}
		if (inMath) {
			if (MATH.test(line)) inMath = false;
			tiers[i] = { headingLevel: 0, ancestors: body };
			continue;
		}

		const fm = FENCE.exec(line);
		if (fm) {
			fence = fm[1];
			tiers[i] = { headingLevel: 0, ancestors: body };
			continue;
		}
		if (MATH.test(line)) {
			// "$$ x $$" on one line opens and closes at once.
			const rest = line.trim().slice(2);
			if (!rest.includes("$$")) inMath = true;
			tiers[i] = { headingLevel: 0, ancestors: body };
			continue;
		}

		const hm = HEADING.exec(line);
		if (hm) {
			const level = hm[1].length;
			let keep = stack.length;
			while (keep > 0 && stack[keep - 1] >= level) keep--;
			const parents = keep === stack.length ? stack : stack.slice(0, keep);
			tiers[i] = { headingLevel: level, ancestors: parents };
			stack = [...parents, level];
			body = indentBody ? stack : parents;
			continue;
		}

		tiers[i] = { headingLevel: 0, ancestors: body };
	}

	return { tiers, disabled, indentBody };
}
