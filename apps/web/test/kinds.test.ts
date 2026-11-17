import { describe, expect, it } from "vitest";
import { kindList } from "@orbit/core";
import { countByKind, kindFromSlug, kindSlug } from "../src/lib/kinds.js";

const it_ = (kind: string, extra: Partial<{ archived: boolean; deleted: boolean }> = {}) => ({
  kind,
  archived: false,
  deleted: false,
  ...extra,
});

describe("countByKind", () => {
  it("counts live cards in the standard kind order, unknown kinds last", () => {
    const counts = countByKind([
      it_("Book"),
      it_("Movie"),
      it_("Movie"),
      it_("Zine"),
      it_("To-do"),
      it_("Movie", { deleted: true }),
      it_("Book", { archived: true }),
    ]);
    expect(counts).toEqual([
      { kind: "To-do", count: 1 },
      { kind: "Movie", count: 2 },
      { kind: "Book", count: 1 },
      { kind: "Zine", count: 1 },
    ]);
  });
});

describe("kind slugs", () => {
  it("round-trips standard kinds", () => {
    expect(kindSlug("To-do")).toBe("to-do");
    expect(kindFromSlug("to-do")).toBe("To-do");
    expect(kindFromSlug("movie")).toBe("Movie");
    expect(kindFromSlug("nope")).toBeUndefined();
  });
});

describe("custom kinds", () => {
  const kinds = kindList([{ name: "Zine", hue: 40 }]);
  it("open from their slug and keep their place in the order", () => {
    expect(kindFromSlug("zine", kinds)).toBe("Zine");
    expect(kindFromSlug("zine")).toBeUndefined();
    expect(countByKind([it_("Zine"), it_("Movie")], kinds).map((c) => c.kind)).toEqual(["Movie", "Zine"]);
  });
});
