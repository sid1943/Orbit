import { describe, expect, it } from "vitest";
import { idList, isReviewDecision, parseItemFields } from "../src/lib/validation.js";

describe("parseItemFields", () => {
  it("keeps only editable fields", () => {
    const r = parseItemFields({ title: "Dune", createdAt: 1, source: "x" });
    expect(r).toEqual({ ok: true, value: { title: "Dune" } });
  });

  it("rejects bad values", () => {
    expect(parseItemFields({ title: "  " }).ok).toBe(false);
    expect(parseItemFields({ status: "maybe" }).ok).toBe(false);
    expect(parseItemFields({ due: "12/01/2026" }).ok).toBe(false);
  });

  it("accepts a cleared due date", () => {
    expect(parseItemFields({ due: null }).ok).toBe(true);
  });
});

describe("isReviewDecision", () => {
  it("knows the decisions", () => {
    expect(isReviewDecision({ d: "yes" })).toBe(true);
    expect(isReviewDecision({ d: "maybe" })).toBe(false);
    expect(isReviewDecision(null)).toBe(false);
  });
});

describe("idList", () => {
  it("splits, trims and caps", () => {
    expect(idList(" a, b,,c ")).toEqual(["a", "b", "c"]);
    expect(idList(Array.from({ length: 200 }, (_, i) => `x${i}`).join(","))).toHaveLength(90);
    expect(idList(undefined)).toEqual([]);
  });
});
