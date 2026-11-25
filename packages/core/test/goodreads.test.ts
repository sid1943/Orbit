import { describe, expect, it } from "vitest";
import { goodreadsByOpenLibrary, goodreadsByQid, type Fetch } from "../src/index.js";

// Made-up ids only.
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("goodreadsByQid", () => {
  it("reads work and book ids from Wikidata", async () => {
    const f: Fetch = async () =>
      json({
        results: {
          bindings: [
            { item: { value: "http://www.wikidata.org/entity/Q1" }, work: { value: "123" } },
            { item: { value: "http://www.wikidata.org/entity/Q2" }, book: { value: "456" } },
            { item: { value: "http://www.wikidata.org/entity/Q3" } },
          ],
        },
      });
    const map = await goodreadsByQid(f, ["Q1", "Q2", "Q3"]);
    expect([...map]).toEqual([
      ["Q1", { work: "123" }],
      ["Q2", { book: "456" }],
    ]);
  });
});

describe("goodreadsByOpenLibrary", () => {
  it("asks for all works at once and takes the lowest edition id", async () => {
    let asked = "";
    const f: Fetch = async (url) => {
      asked = decodeURIComponent(url);
      return json({ docs: [{ key: "/works/OL1W", id_goodreads: ["900", "77", "x"] }, { key: "/works/OL2W" }] });
    };
    const map = await goodreadsByOpenLibrary(f, ["OL1W", "OL2W", "bad"]);
    expect([...map]).toEqual([["OL1W", { book: "77" }]]);
    expect(asked).toContain('key:("/works/OL1W" OR "/works/OL2W")');
  });

  it("sends nothing without valid ids", async () => {
    const f: Fetch = async () => {
      throw new Error("no request expected");
    };
    expect((await goodreadsByOpenLibrary(f, ["nope"])).size).toBe(0);
  });
});
