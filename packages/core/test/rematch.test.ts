import { describe, expect, it } from "vitest";
import {
  authorAgrees,
  movieGuesses,
  openLibrarySure,
  rematchBook,
  tidyTitle,
  titleGuesses,
  titleKey,
  wikidataBooksByTitle,
  type Fetch,
} from "../src/index.js";

// Made-up titles and authors only.
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("tidyTitle and titleKey", () => {
  it("tidies quotes, dots, edition notes and colons", () => {
    expect(tidyTitle("A Sailor’s Year, 2nd Edition")).toBe("A Sailor's Year");
    expect(tidyTitle("The Red Lamp:Light and Dark.")).toBe("The Red Lamp: Light and Dark");
  });
  it("compares titles without case, punctuation or a leading article", () => {
    expect(titleKey("The Sailor's Year")).toBe(titleKey("a sailors year".replace("sailors", "sailor's")));
  });
});

describe("titleGuesses", () => {
  const first = (s: string) => titleGuesses(s)[0];
  it("reads the usual ways a row names its author", () => {
    expect(first("Harbor Tales by ada lane.")).toEqual({ title: "Harbor Tales", author: "ada lane" });
    expect(first("Harbor Tales (Lane)")).toEqual({ title: "Harbor Tales", author: "Lane" });
    expect(first("Ada Lane's Harbor Tales")).toEqual({ title: "Harbor Tales", author: "Ada Lane" });
    expect(first('Ada Lane "Harbor Tales')).toEqual({ title: "Harbor Tales", author: "Ada Lane" });
    expect(first("Harbor Tales, Lane, Moss")).toEqual({ title: "Harbor Tales", author: "Lane" });
    expect(first("How to sail a small boat Ada Lane")).toEqual({
      title: "How to sail a small boat",
      author: "Ada Lane",
    });
  });
  it("doesn't take an article for an author", () => {
    expect(titleGuesses("A Wise Sailor's Year").some((g) => g.author === "A Wise Sailor")).toBe(false);
  });
  it("pulls the book out of a recommendation and skips chat", () => {
    expect(titleGuesses("If you like Lane, check out Harbor Tales")).toEqual([{ title: "Harbor Tales" }]);
    expect(titleGuesses("Night Story - u/someone")).toEqual([]);
  });
  it("also tries the title without its subtitle", () => {
    expect(titleGuesses("Harbor Tales: A Life by Ada Lane")).toContainEqual({
      title: "Harbor Tales",
      author: "Ada Lane",
    });
  });
});

describe("authorAgrees", () => {
  it("matches on the surname or every given word", () => {
    expect(authorAgrees("lane", ["Ada Lane"])).toBe(true);
    expect(authorAgrees("Ada Lane", ["A. Lane"])).toBe(true);
    expect(authorAgrees("Moss", ["Ada Lane"])).toBe(false);
    expect(authorAgrees(undefined, [])).toBe(true);
  });
});

describe("openLibrarySure", () => {
  const ol =
    (docs: unknown[]): Fetch =>
    async () =>
      json({ docs });
  const doc = (title: string, author: string, editions = 10, key = "OL1W") => ({
    key: `/works/${key}`,
    title,
    author_name: [author],
    edition_count: editions,
  });

  it("is sure when title and author agree", async () => {
    const r = await openLibrarySure(ol([doc("Other", "Ada Lane"), doc("Harbor Tales", "Ada Lane")]), {
      title: "The Harbor Tales",
      author: "lane",
    });
    expect(r?.entity).toMatchObject({ openLibrary: "OL1W", label: "Harbor Tales", author: "Ada Lane" });
  });

  it("without an author, wants a clear first result", async () => {
    const guess = { title: "Harbor Tales" };
    expect(
      await openLibrarySure(ol([doc("Harbor Tales", "Ada Lane", 40), doc("Harbor Tales", "Study Guides", 2)]), guess),
    ).not.toBeNull();
    expect(
      await openLibrarySure(ol([doc("Harbor Tales", "Ada Lane", 40), doc("Harbor Tales", "Bo Moss", 20)]), guess),
    ).toBeNull();
    expect(await openLibrarySure(ol([doc("Harbor Tales", "Ada Lane", 1)]), guess)).toBeNull();
    expect(await openLibrarySure(ol([doc("Other", "Ada Lane"), doc("Harbor Tales", "Ada Lane")]), guess)).toBeNull();
  });

  it("searches without the leading article", async () => {
    let asked = "";
    const f: Fetch = async (url) => {
      asked = decodeURIComponent(url);
      return json({ docs: [] });
    };
    await openLibrarySure(f, { title: "The Harbor", author: "Lane" });
    expect(asked).toContain("q=Harbor Lane");
  });
});

describe("rematchBook", () => {
  it("tries the readings with an author first and stops at a sure one", async () => {
    const asked: string[] = [];
    const f: Fetch = async (url) => {
      asked.push(decodeURIComponent(url));
      return json({
        docs: [{ key: "/works/OL7W", title: "Harbor Tales", author_name: ["Ada Lane"], edition_count: 5 }],
      });
    };
    const r = await rematchBook(f, "Harbor Tales by Ada Lane");
    expect(r?.entity.openLibrary).toBe("OL7W");
    expect(asked).toHaveLength(1);
  });
});

describe("wikidataBooksByTitle", () => {
  const row = (term: string, item: string, label: string, author: string, sites = "1") => ({
    term: { value: term },
    item: { value: `http://www.wikidata.org/entity/${item}` },
    label: { value: label },
    author: { value: author },
    sites: { value: sites },
  });
  it("keeps one clear work per book, by title and author", async () => {
    const f: Fetch = async () =>
      json({
        results: {
          bindings: [
            row("Harbor Tales", "Q1", "Harbor Tales", "Ada Lane", "12"),
            row("Harbor Tales", "Q2", "Harbor Tales", "Ada Lane", "1"),
            row("Night Story", "Q3", "Night Story", "Bo Moss"),
            row("Night Story", "Q4", "Night Story", "Bo Moss"),
            row("Sea Glass", "Q5", "Sea Glass", "Someone Else"),
          ],
        },
      });
    const map = await wikidataBooksByTitle(f, [
      { id: "a", title: "Harbor Tales", author: "Ada Lane" },
      { id: "b", title: "Night Story", author: "Bo Moss" },
      { id: "c", title: "Sea Glass", author: "Ada Lane" },
      { id: "d", title: "No Author", author: "" },
    ]);
    expect([...map]).toEqual([["a", "Q1"]]);
  });
});

describe("movieGuesses", () => {
  it("reads years and drops director notes", () => {
    expect(movieGuesses("Harbor Lights (1951) (dir. Ada Lane)")).toContainEqual({ title: "Harbor Lights", year: 1951 });
    expect(movieGuesses("Night Story – https://example.com")).toEqual([]);
  });
});
