import { MarkdownView, Plugin, TFile } from "obsidian";
import { tierOptions } from "./depth";
import { headingTiersEditor } from "./editor";
import { headingSignature, processSection } from "./reading";
import {
	HeadingTiersSettingTab,
	THEME_LEVEL_COLORS,
	THEME_SINGLE_COLOR,
	loadSettings,
	type HeadingTiersSettings,
} from "./settings";

const BODY_VARS = ["--ht-indent", "--ht-guide-width", "--ht-c1", "--ht-c2", "--ht-c3", "--ht-c4", "--ht-c5", "--ht-c6"];
const BODY_CLASSES = ["ht-off", "ht-no-guides"];

export default class HeadingTiersPlugin extends Plugin {
	settings!: HeadingTiersSettings;
	private signatures = new Map<string, string>();

	async onload() {
		this.settings = loadSettings(await this.loadData());
		this.applyBodyStyle();
		this.addSettingTab(new HeadingTiersSettingTab(this.app, this));

		this.registerEditorExtension(headingTiersEditor);
		this.registerMarkdownPostProcessor((el, ctx) => processSection(el, ctx));

		// Reading view only re-renders the sections that changed, so a heading
		// added or removed above leaves stale depths below. Rerender when the
		// heading structure of a note changes.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file, _data, cache) => {
				const sig = headingSignature(cache.headings);
				const prev = this.signatures.get(file.path);
				this.signatures.set(file.path, sig);
				if (prev !== undefined && prev !== sig) this.rerenderReading(file);
			}),
		);
		this.registerEvent(this.app.vault.on("delete", (f) => this.signatures.delete(f.path)));
		this.registerEvent(
			this.app.vault.on("rename", (f, old) => {
				const sig = this.signatures.get(old);
				this.signatures.delete(old);
				if (sig !== undefined) this.signatures.set(f.path, sig);
			}),
		);

		this.app.workspace.onLayoutReady(() => this.rerenderReading());
	}

	onunload() {
		for (const v of BODY_VARS) document.body.style.removeProperty(v);
		document.body.classList.remove(...BODY_CLASSES);
		this.rerenderReading();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		const bodyChanged = tierOptions.indentBody !== this.settings.indentBody;
		this.applyBodyStyle();
		// The guide layer measures in pixels; make editors redraw it.
		this.app.workspace.updateOptions();
		// Depths are baked into rendered sections, unlike the body-level variables.
		if (bodyChanged) this.rerenderReading();
	}

	/** Settings live in body-level CSS variables, so no line decoration has to be rebuilt. */
	private applyBodyStyle() {
		const s = this.settings;
		const b = document.body;
		tierOptions.indentBody = s.indentBody;
		b.style.setProperty("--ht-indent", `${s.indentWidth}px`);
		b.style.setProperty("--ht-guide-width", `${s.guideWidth}px`);
		for (let i = 0; i < 6; i++) {
			const c = s.colorMode === "single" ? s.singleColor || THEME_SINGLE_COLOR : s.levelColors[i] || THEME_LEVEL_COLORS[i];
			b.style.setProperty(`--ht-c${i + 1}`, c);
		}
		b.classList.toggle("ht-off", !s.enabled);
		b.classList.toggle("ht-no-guides", !s.showGuides);
	}

	private rerenderReading(file?: TFile) {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) continue;
			if (file && view.file?.path !== file.path) continue;
			view.previewMode?.rerender(true);
		}
	}
}
