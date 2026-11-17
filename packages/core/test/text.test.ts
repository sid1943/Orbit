import { describe, expect, it } from "vitest";
import { matcher, normalize, readableLink, slug } from "../src/index.js";

describe("matcher", () => {
  it("matches at the start of words, not in the middle", () => {
    const m = matcher("ace");
    expect(m("Ace Combat 3")).toBe(true);
    expect(m("Smokin' Aces")).toBe(true);
    expect(m("Poker Face")).toBe(false);
  });

  it("treats a trailing space as 'the last word must be whole'", () => {
    expect(matcher("new york ")("New York Public Library")).toBe(true);
    expect(matcher("new york ")("newer yorkshire")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matcher("  ")("anything")).toBe(true);
  });
});

describe("readableLink", () => {
  it("names well-known sites", () => {
    expect(readableLink("https://www.reddit.com/r/books/comments/abc/the_best_list/").label).toBe(
      "Reddit r/books: The Best List",
    );
    expect(readableLink("https://www.imdb.com/title/tt0111161/").label).toBe("IMDb page");
  });

  it("keeps a label the user gave", () => {
    expect(readableLink("https://example.com/x", "My link").label).toBe("My link");
  });
});

describe("slug and normalize", () => {
  it("slugs titles", () => {
    expect(slug("The Complete Robot - By Issac Asimov")).toBe("the-complete-robot-by-issac-asimov");
  });

  it("drops accents and punctuation", () => {
    expect(normalize("Amélie & Co.")).toBe("amelie and co");
  });
});
