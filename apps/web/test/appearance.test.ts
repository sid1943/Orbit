import { DEFAULT_APPEARANCE } from "@orbit/core";
import { describe, expect, it } from "vitest";
import { rememberAppearance, rememberedAppearance } from "../src/lib/appearance.js";

/** A Map-backed stand-in for localStorage. */
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("remembered appearance", () => {
  it("starts from the defaults", () => {
    expect(rememberedAppearance(store())).toEqual(DEFAULT_APPEARANCE);
    expect(rememberedAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
  });

  it("reads back what was remembered", () => {
    const s = store();
    rememberAppearance(s, { ...DEFAULT_APPEARANCE, theme: "dark", size: 1.45 });
    expect(rememberedAppearance(s)).toMatchObject({ theme: "dark", size: 1.45 });
  });

  it("ignores broken values", () => {
    expect(rememberedAppearance({ getItem: () => "{nope" })).toEqual(DEFAULT_APPEARANCE);
    expect(
      rememberedAppearance({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual(DEFAULT_APPEARANCE);
  });
});
