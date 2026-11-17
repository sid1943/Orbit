import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, settingsSection } from "../src/lib/settings-sections.js";

describe("settings sections", () => {
  it("follow the Mac layout order", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.name)).toEqual([
      "Appearance",
      "Profile",
      "Location",
      "Lists",
      "Your data",
      "Guide",
      "About",
    ]);
  });

  it("open Appearance for a missing or unknown section", () => {
    expect(settingsSection(undefined)).toBe("appearance");
    expect(settingsSection("nope")).toBe("appearance");
    expect(settingsSection("about")).toBe("about");
  });
});
