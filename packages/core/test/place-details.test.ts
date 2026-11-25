import { describe, expect, it } from "vitest";
import { detailsFromTags, mergeDetails, osmDetails, overpassQuery, wikiDetails } from "../src/index.js";
import { cannedFetch } from "./helpers/fetch.js";

describe("overpassQuery", () => {
  it("asks for the places by their Wikidata ids only", () => {
    expect(overpassQuery(["Q1", "Q22", "bad"])).toContain('["wikidata"~"^(Q1|Q22)$"]');
  });
});

describe("detailsFromTags", () => {
  it("reads hours, fee, website, phone and access", () => {
    expect(
      detailsFromTags({
        opening_hours: "Tu-Su 10:00-17:00",
        fee: "yes",
        charge: "12 USD",
        "contact:website": "https://museum.example",
        phone: "+1 555 0100",
        wheelchair: "limited",
        dog: "leashed",
      }),
    ).toEqual({
      hours: "Tu-Su 10:00-17:00",
      fee: "12 USD",
      website: "https://museum.example",
      phone: "+1 555 0100",
      wheelchair: "limited",
      dogs: "leashed",
    });
  });

  it("drops odd values and marks disused places", () => {
    expect(detailsFromTags({ website: "museum.example", wheelchair: "maybe", "disused:tourism": "museum" })).toEqual({
      closed: true,
    });
  });
});

describe("osmDetails", () => {
  it("keeps the element with the most details for each place", async () => {
    const fetch = cannedFetch([
      [
        "overpass-api.de",
        {
          elements: [
            { tags: { wikidata: "Q1", fee: "no" } },
            { tags: { wikidata: "Q1", fee: "no", opening_hours: "24/7" } },
            { tags: { wikidata: "Q9", fee: "yes" } },
          ],
        },
      ],
    ]);
    const out = await osmDetails(fetch, ["Q1"]);
    expect([...out]).toEqual([["Q1", { fee: "no", hours: "24/7" }]]);
  });
});

describe("wikiDetails", () => {
  it("follows Wikipedia's redirects back to the asked title", async () => {
    const fetch = cannedFetch([
      [
        "en.wikipedia.org",
        {
          query: {
            redirects: [{ from: "Old Name", to: "Silver Falls" }],
            pages: [
              { title: "Silver Falls", extract: "A waterfall.", thumbnail: { source: "https://upload.example/a.jpg" } },
            ],
          },
        },
      ],
    ]);
    const out = await wikiDetails(fetch, ["Old Name", "Missing"]);
    expect(out.get("Old Name")).toEqual({ history: "A waterfall.", photo: "https://upload.example/a.jpg" });
    expect(out.has("Missing")).toBe(false);
  });
});

describe("mergeDetails", () => {
  it("keeps the first source's answer", () => {
    expect(mergeDetails({ website: "https://a.example" }, { website: "https://b.example", history: "x" })).toEqual({
      website: "https://a.example",
      history: "x",
    });
  });
});
