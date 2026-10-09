const cache = new Map<string, string>();

/**
 * Inline style for a line under `ancestors`: the depth plus one guide stripe per
 * ancestor, as background-image / background-position lists. Everything else
 * (indent width, colors, guide width) comes from the body-level variables, so
 * changing a setting never rebuilds these strings.
 */
export function tierStyle(ancestors: readonly number[]): string {
	const key = ancestors.join(",");
	let style = cache.get(key);
	if (style === undefined) {
		const images = ancestors.map((level) => `linear-gradient(var(--ht-g${level}) 0 0)`);
		const positions = ancestors.map(
			(_, i) => `calc(var(--ht-shift, 0px) + ${i} * var(--ht-indent) + var(--ht-guide-offset)) 0`,
		);
		style = `--ht-depth:${ancestors.length};--ht-guide-img:${images.join(",")};--ht-guide-pos:${positions.join(",")}`;
		cache.set(key, style);
	}
	return style;
}

/** Splits a tierStyle() string into [property, value] pairs for element.style.setProperty. */
export function styleEntries(style: string): [string, string][] {
	return style.split(/;(?=--)/).map((decl) => {
		const i = decl.indexOf(":");
		return [decl.slice(0, i), decl.slice(i + 1)];
	});
}

export const STYLE_PROPS = ["--ht-depth", "--ht-guide-img", "--ht-guide-pos"];
