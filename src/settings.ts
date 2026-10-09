import { App, PluginSettingTab, Setting } from "obsidian";
import type HeadingTiersPlugin from "./main";

export interface HeadingTiersSettings {
	enabled: boolean;
	indentWidth: number;
	/** Indent text one level deeper than its heading. */
	indentBody: boolean;
	showGuides: boolean;
	guideWidth: number;
	colorMode: "level" | "single";
	/** Per-level colors, H1 first. An empty string means the theme default. */
	levelColors: string[];
	/** Color for "single" mode. An empty string means the theme default. */
	singleColor: string;
}

export const DEFAULT_SETTINGS: HeadingTiersSettings = {
	enabled: true,
	indentWidth: 24,
	indentBody: true,
	showGuides: true,
	guideWidth: 1,
	colorMode: "level",
	levelColors: ["", "", "", "", "", ""],
	singleColor: "",
};

/** Theme variables used when a color is left empty. */
export const THEME_LEVEL_COLORS = [
	"var(--color-red)",
	"var(--color-orange)",
	"var(--color-yellow)",
	"var(--color-green)",
	"var(--color-blue)",
	"var(--color-purple)",
];
export const THEME_SINGLE_COLOR = "var(--text-faint)";

/** Fallbacks for the color picker, which can't show a CSS variable. */
const PICKER_FALLBACK = ["#cc241d", "#d65d0e", "#d79921", "#98971a", "#458588", "#b16286"];

const HEX = /^#[0-9a-f]{6}$/i;

function num(v: unknown, def: number, min: number, max: number): number {
	return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

export function loadSettings(data: unknown): HeadingTiersSettings {
	const d = (data && typeof data === "object" ? data : {}) as Partial<HeadingTiersSettings>;
	const colors = Array.isArray(d.levelColors) ? d.levelColors : [];
	return {
		enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_SETTINGS.enabled,
		indentWidth: num(d.indentWidth, DEFAULT_SETTINGS.indentWidth, 4, 80),
		indentBody: typeof d.indentBody === "boolean" ? d.indentBody : DEFAULT_SETTINGS.indentBody,
		showGuides: typeof d.showGuides === "boolean" ? d.showGuides : DEFAULT_SETTINGS.showGuides,
		guideWidth: num(d.guideWidth, DEFAULT_SETTINGS.guideWidth, 0.5, 4),
		colorMode: d.colorMode === "single" ? "single" : "level",
		levelColors: DEFAULT_SETTINGS.levelColors.map((_, i) => (typeof colors[i] === "string" && HEX.test(colors[i]) ? colors[i] : "")),
		singleColor: typeof d.singleColor === "string" && HEX.test(d.singleColor) ? d.singleColor : "",
	};
}

export class HeadingTiersSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: HeadingTiersPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = async (redraw = false) => {
			await this.plugin.saveSettings();
			if (redraw) this.display();
		};
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable")
			.setDesc("Indent content under headings. To turn it off for one note, add `heading-tiers: false` to its frontmatter.")
			.addToggle((t) =>
				t.setValue(s.enabled).onChange(async (v) => {
					s.enabled = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Indent width")
			.setDesc("Pixels per nesting level.")
			.addSlider((sl) =>
				sl
					.setLimits(4, 64, 2)
					.setValue(s.indentWidth)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.indentWidth = v;
						await save();
					}),
			);

		new Setting(containerEl)
			.setName("Indent body text")
			.setDesc("Indent text one level deeper than its heading. When off, text lines up with its heading and only nested headings are indented.")
			.addToggle((t) =>
				t.setValue(s.indentBody).onChange(async (v) => {
					s.indentBody = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Show guide lines")
			.setDesc("Draw a vertical line for each parent heading.")
			.addToggle((t) =>
				t.setValue(s.showGuides).onChange(async (v) => {
					s.showGuides = v;
					await save(true);
				}),
			);

		if (!s.showGuides) return;

		new Setting(containerEl)
			.setName("Guide width")
			.setDesc("Line width in pixels.")
			.addSlider((sl) =>
				sl
					.setLimits(0.5, 4, 0.5)
					.setValue(s.guideWidth)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.guideWidth = v;
						await save();
					}),
			);

		new Setting(containerEl)
			.setName("Guide colors")
			.setDesc("Color each guide by the level of its heading, or use one color for all.")
			.addDropdown((dd) =>
				dd
					.addOption("level", "Per heading level")
					.addOption("single", "Single color")
					.setValue(s.colorMode)
					.onChange(async (v) => {
						s.colorMode = v === "single" ? "single" : "level";
						await save(true);
					}),
			);

		if (s.colorMode === "single") {
			this.colorSetting("Guide color", "Empty uses the theme's faint text color.", s.singleColor, "#a89984", async (v) => {
				s.singleColor = v;
				await save(true);
			});
		} else {
			for (let i = 0; i < 6; i++) {
				this.colorSetting(`H${i + 1}`, "Empty uses the theme's color.", s.levelColors[i], PICKER_FALLBACK[i], async (v) => {
					s.levelColors[i] = v;
					await save(true);
				});
			}
		}
	}

	private colorSetting(name: string, desc: string, value: string, fallback: string, set: (v: string) => Promise<void>) {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(value ? value : `${desc}`)
			.addColorPicker((cp) => cp.setValue(value || fallback).onChange((v) => set(v)))
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Reset to theme color")
					.setDisabled(!value)
					.onClick(() => set("")),
			);
	}
}
