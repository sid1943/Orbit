import { describe, expect, it } from "vitest";
import { idList, intParam, parseReviewDecision, parseItemFields } from "../src/lib/validation.js";

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

describe("parseReviewDecision", () => {
  it("accepts the six answers and checks their fields", () => {
    expect(parseReviewDecision({ d: "yes", extra: 1 })).toEqual({ ok: true, value: { d: "yes" } });
    expect(parseReviewDecision({ d: "alt", qid: "Q1" })).toEqual({ ok: true, value: { d: "alt", qid: "Q1" } });
    expect(parseReviewDecision({ d: "alt" }).ok).toBe(false);
    expect(parseReviewDecision({ d: "fix", text: "Pier" })).toEqual({
      ok: true,
      value: { d: "fix", text: "Pier", add: false },
    });
    expect(parseReviewDecision({ d: "fix" }).ok).toBe(false);
    expect(parseReviewDecision({ d: "hide", urls: ["https://a.example"] }).ok).toBe(true);
    expect(parseReviewDecision({ d: "hide", urls: [1] }).ok).toBe(false);
    expect(parseReviewDecision({ d: "maybe" }).ok).toBe(false);
    expect(parseReviewDecision(null).ok).toBe(false);
  });
});

describe("idList", () => {
  it("splits, trims and de-duplicates, and refuses more than 2000 instead of cutting", () => {
    expect(idList(" a, b,,c,a ")).toEqual({ ok: true, value: ["a", "b", "c"] });
    expect(idList(Array.from({ length: 200 }, (_, i) => `x${i}`).join(","))).toMatchObject({
      ok: true,
      value: expect.any(Array),
    });
    expect(idList(Array.from({ length: 2001 }, (_, i) => `x${i}`).join(",")).ok).toBe(false);
    expect(idList(undefined)).toEqual({ ok: true, value: [] });
  });
});

describe("intParam", () => {
  it("reads whole numbers and falls back otherwise", () => {
    expect(intParam("12", 0)).toBe(12);
    expect(intParam("-1", 5)).toBe(5);
    expect(intParam("x", 5)).toBe(5);
    expect(intParam(undefined, 5)).toBe(5);
  });
});
