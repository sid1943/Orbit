import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  HEADING_FONTS,
  TEXT_FONTS,
  appearanceVars,
  fontStylesheet,
  parseAppearance,
  textFont,
} from "../src/appearance.js";

describe("parseAppearance", () => {
  it("returns the defaults for anything that isn't an object", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance([1])).toEqual(DEFAULT_APPEARANCE);
  });

  it("reads Orbit today's theme 'auto' as 'system'", () => {
    expect(parseAppearance({ theme: "auto" }).theme).toBe("system");
  });

  it("keeps valid fields and replaces unknown ones", () => {
    expect(parseAppearance({ theme: "dark", size: 1.45, font: "comic", heads: "sora", detail: "x" })).toEqual({
      ...DEFAULT_APPEARANCE,
      theme: "dark",
      size: 1.45,
      heads: "sora",
    });
  });

  it("only accepts the listed text sizes", () => {
    expect(parseAppearance({ size: 3 }).size).toBe(DEFAULT_APPEARANCE.size);
  });
});

describe("font lists", () => {
  it("have unique ids", () => {
    for (const list of [TEXT_FONTS, HEADING_FONTS]) {
      expect(new Set(list.map((f) => f.id)).size).toBe(list.length);
    }
  });

  it("fall back to the first font for unknown ids", () => {
    expect(textFont("nope").id).toBe("plex");
  });
});

describe("appearanceVars", () => {
  it("sets size, fonts and detail style", () => {
    const v = appearanceVars({ theme: "light", size: 1.3, font: "inter", heads: "text", detail: "text" });
    expect(v["--fz"]).toBe("1.3");
    expect(v["--body"]).toMatch(/^"Inter",/);
    expect(v["--display"]).toBe(v["--body"]);
    expect(v["--mono"]).toBe(v["--body"]);
  });

  it("uses the typewriter font for detail lines by default", () => {
    expect(appearanceVars(DEFAULT_APPEARANCE)["--mono"]).toMatch(/IBM Plex Mono/);
    expect(appearanceVars(DEFAULT_APPEARANCE)["--display"]).toMatch(/Bricolage/);
  });
});

describe("fontStylesheet", () => {
  it("loads Google fonts only when needed", () => {
    expect(fontStylesheet(textFont("plex"))).toBeNull();
    expect(fontStylesheet(textFont("lexend"))).toBe(
      "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap",
    );
  });
});
