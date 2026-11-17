import {
  type AppearancePref,
  DEFAULT_APPEARANCE,
  appearanceVars,
  fontStylesheet,
  headingFont,
  parseAppearance,
  textFont,
} from "@orbit/core";

const KEY = "orbit.appearance";

/** The last appearance this browser used, so the first paint already has the right theme and size. */
export function rememberedAppearance(storage: Pick<Storage, "getItem"> | undefined): AppearancePref {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? parseAppearance(JSON.parse(raw)) : { ...DEFAULT_APPEARANCE };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function rememberAppearance(storage: Pick<Storage, "setItem"> | undefined, a: AppearancePref): void {
  try {
    storage?.setItem(KEY, JSON.stringify(a));
  } catch {
    // Storage can be full or blocked; the setting is still saved in Orbit.
  }
}

const loaded = new Set<string>();

/** Adds a font's stylesheet once. Fonts load only when chosen (or shown in the font picker). */
export function loadFont(href: string | null): void {
  if (!href || loaded.has(href) || typeof document === "undefined") return;
  loaded.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** Sets the theme and the font and size variables on the page. */
export function applyAppearance(a: AppearancePref, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(appearanceVars(a))) root.style.setProperty(name, value);
  if (a.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = a.theme;
  loadFont(fontStylesheet(textFont(a.font)));
  loadFont(fontStylesheet(headingFont(a.heads)));
}
