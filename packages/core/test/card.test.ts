import { describe, expect, it } from "vitest";
import {
  addChecklist,
  addComment,
  addRow,
  addTopics,
  checklistMatches,
  checklistProgress,
  deleteChecklist,
  deleteComment,
  deleteRow,
  editRow,
  hiddenFor,
  isTrelloUrl,
  linkedCardIds,
  localDay,
  moveRow,
  moveRowTo,
  relatedByTopics,
  removeTopic,
  renameChecklist,
  splitTopics,
  textParts,
  thingLinks,
  toggleRow,
  trelloCardFinder,
  trelloCardParts,
  usefulLinks,
  type Checklist,
  type Entity,
} from "../src/index.js";

// Made-up examples only.
const movie: Entity = {
  id: "e1",
  name: "Harbor Lights",
  category: "movie",
  confidence: "high",
  imdb: "tt0000001",
  wikipedia: "Harbor Lights (film)",
  description: "1999 film",
  updatedAt: 1,
};

const lists: Checklist[] = [
  {
    name: "Seen",
    rows: [
      { text: "One", done: true, entityId: "e1" },
      { text: "Two", done: false },
      { text: "Three", done: false },
    ],
  },
  { name: "Later", rows: [{ text: "Four", done: false }] },
];

describe("splitTopics", () => {
  it("takes #topics off the title", () => {
    expect(splitTopics("Visit the lake #summer trips #Family")).toEqual({
      title: "Visit the lake",
      tags: ["summer trips", "Family"],
    });
    expect(splitTopics("No topics")).toEqual({ title: "No topics", tags: [] });
  });
});

describe("links", () => {
  it("lists standard links first, then the card's, with readable names and no repeats", () => {
    const out = usefulLinks(
      {
        id: "c1",
        notes: "",
        links: [{ label: "https://www.imdb.com/title/tt0000001/", url: "https://www.imdb.com/title/tt0000001/" }],
        attachments: [{ label: "https://example.com/some-guide", url: "https://example.com/some-guide" }],
      },
      movie,
    );
    expect(out.map((l) => l.label)).toEqual(["IMDb", "Wikipedia", "Some Guide"]);
    expect(out[1]?.note).toBe("1999 film");
    expect(out[2]?.host).toBe("example.com");
  });

  it("leaves out hidden links and standard links already in the notes", () => {
    const out = usefulLinks(
      { id: "c1", notes: "see https://www.imdb.com/title/tt0000001/", links: [], attachments: [] },
      movie,
      new Set(["https://en.wikipedia.org/wiki/Harbor_Lights_(film)"]),
    );
    expect(out).toEqual([]);
  });

  it("adds links Sid pasted and finds hidden ones from reviews", () => {
    const e = { ...movie, userLinks: [{ label: "Fan site", url: "https://fans.example.com/" }] };
    const hidden = hiddenFor(
      [{ entityId: "x:e1", decision: { d: "hide", urls: ["https://www.imdb.com/title/tt0000001/"] }, at: 1 }],
      "e1",
    );
    expect(thingLinks(e, hidden).map((l) => l.label)).toEqual(["Wikipedia", "Fan site"]);
  });
});

describe("textParts", () => {
  it("names addresses, links cards and keeps the rest", () => {
    const parts = textParts(
      "Read [the guide](https://example.com/a) and https://example.com/x-y. See [[Other card]] **now**",
      (t) => (t === "Other card" ? "c2" : null),
    );
    expect(parts).toEqual([
      { t: "text", text: "Read " },
      { t: "url", url: "https://example.com/a", label: "the guide" },
      { t: "text", text: " and " },
      { t: "url", url: "https://example.com/x-y", label: "X Y" },
      { t: "text", text: "." },
      { t: "text", text: " See " },
      { t: "card", title: "Other card", id: "c2" },
      { t: "text", text: " " },
      { t: "bold", text: "now" },
    ]);
  });
});

describe("checklists", () => {
  it("counts and searches rows, also by the linked thing", () => {
    expect(checklistProgress({ checklists: lists })).toEqual({ done: 1, total: 4 });
    expect(checklistMatches(lists, "")).toBeNull();
    expect(checklistMatches(lists, "tw")).toEqual([[1], []]);
    expect(
      checklistMatches(lists, "harbor", (r) => (r.entityId === "e1" ? { ...movie, label: "Harbor Lights" } : null)),
    ).toEqual([[0], []]);
  });

  it("edits rows without changing the original", () => {
    expect(toggleRow(lists, 0, 1)[0]?.rows[1]?.done).toBe(true);
    expect(lists[0]?.rows[1]?.done).toBe(false);
    expect(addRow(lists, 1, "  Five ")[1]?.rows.map((r) => r.text)).toEqual(["Four", "Five"]);
    expect(addRow(lists, 1, " ")).toEqual(lists);
    expect(editRow(lists, 0, 0, "Uno")[0]?.rows[0]).toEqual({ text: "Uno", done: true, entityId: "e1" });
    expect(deleteRow(lists, 0, 1)[0]?.rows.map((r) => r.text)).toEqual(["One", "Three"]);
  });

  it("moves rows within and between checklists", () => {
    expect(moveRow(lists, 0, 0, 1)[0]?.rows.map((r) => r.text)).toEqual(["Two", "One", "Three"]);
    expect(moveRow(lists, 0, 0, -1)).toEqual(lists);
    const moved = moveRowTo(lists, 0, 2, 1);
    expect(moved.map((c) => c.rows.map((r) => r.text))).toEqual([
      ["One", "Two"],
      ["Four", "Three"],
    ]);
  });

  it("adds, renames and deletes checklists", () => {
    expect(addChecklist(lists, "New").map((c) => c.name)).toEqual(["Seen", "Later", "New"]);
    expect(renameChecklist(lists, 1, "Soon")[1]?.name).toBe("Soon");
    expect(deleteChecklist(lists, 0).map((c) => c.name)).toEqual(["Later"]);
  });
});

describe("comments and topics", () => {
  it("adds dated comments at the end and deletes them", () => {
    const now = new Date(2026, 10, 17);
    expect(localDay(now)).toBe("2026-11-17");
    const c = addComment([{ date: "2026-01-01", text: "a" }], " b ", now);
    expect(c).toEqual([
      { date: "2026-01-01", text: "a" },
      { date: "2026-11-17", text: "b" },
    ]);
    expect(deleteComment(c, 0)).toEqual([{ date: "2026-11-17", text: "b" }]);
  });

  it("adds topics without repeats and removes them in any case", () => {
    expect(addTopics(["Summer"], "summer")).toEqual(["Summer"]);
    expect(addTopics(["Summer"], "#lake #road trip")).toEqual(["Summer", "lake", "road trip"]);
    expect(removeTopic(["Summer", "lake"], "SUMMER")).toEqual(["lake"]);
  });
});

describe("connections", () => {
  it("finds linked cards from refs and [[titles]]", () => {
    const ids = linkedCardIds({ id: "c1", refs: ["c2"], notes: "[[Third]] and [[Missing]] and [[Self]]" }, (t) =>
      t === "Third" ? "c3" : t === "Self" ? "c1" : null,
    );
    expect(ids).toEqual(["c2", "c3"]);
  });

  it("ranks cards sharing rarer topics first", () => {
    const cards = [
      { id: "a", kind: "Movie", tags: ["common", "rare"] },
      { id: "b", kind: "Movie", tags: ["common"] },
      { id: "c", kind: "Book", tags: ["rare"] },
      { id: "d", kind: "Movie", tags: ["common"] },
      { id: "e", kind: "Movie", tags: ["other"] },
    ];
    const out = relatedByTopics(cards[0]!, cards);
    expect(out.map((r) => r.card.id)).toEqual(["c", "b", "d"]);
    expect(out[0]?.topics).toEqual(["rare"]);
  });
});

describe("old Trello links", () => {
  const find = trelloCardFinder([
    { id: "AbC123xy", title: "Harbor Lights" },
    { id: "it_2", title: "Sea Stories (2001)" },
    { id: "gone", title: "Gone", deleted: true },
  ]);

  it("finds the Orbit card by Trello id, then by title", () => {
    expect(isTrelloUrl("https://trello.com/b/xyz/board")).toBe(true);
    expect(isTrelloUrl("https://example.com/trello.com")).toBe(false);
    expect(trelloCardParts("https://trello.com/c/AbC123xy/12-harbor-lights")).toEqual({
      shortId: "AbC123xy",
      slug: "harbor-lights",
    });
    expect(find("https://trello.com/c/AbC123xy")).toEqual({ id: "AbC123xy", title: "Harbor Lights" });
    expect(find("https://trello.com/c/zzzz/7-sea-stories-2001")).toEqual({ id: "it_2", title: "Sea Stories (2001)" });
    expect(find("https://trello.com/c/zzzz/7-gone")).toBeNull();
    expect(find("https://trello.com/b/xyz/board")).toBeNull();
  });

  it("turns Trello links into card links and drops the rest", () => {
    const out = usefulLinks(
      {
        id: "me",
        notes: "",
        links: [{ label: "x", url: "https://trello.com/c/AbC123xy/1-harbor-lights" }],
        attachments: [
          { label: "JnHH3kCd", url: "https://trello.com/c/JnHH3kCd" },
          { label: "Board", url: "https://trello.com/b/xyz/board" },
          { label: "again", url: "https://trello.com/c/AbC123xy" },
        ],
      },
      null,
      new Set(),
      find,
    );
    expect(out).toEqual([{ label: "Harbor Lights", url: "/item/AbC123xy", host: "Orbit", cardId: "AbC123xy" }]);
  });

  it("does the same inside text", () => {
    expect(
      textParts(
        "See https://trello.com/c/AbC123xy/1-x and [old](https://trello.com/c/none) and https://trello.com/b/q.",
        undefined,
        find,
      ),
    ).toEqual([
      { t: "text", text: "See " },
      { t: "card", title: "Harbor Lights", id: "AbC123xy" },
      { t: "text", text: " and " },
      { t: "text", text: "old" },
      { t: "text", text: " and " },
      { t: "text", text: "." },
    ]);
  });
});
