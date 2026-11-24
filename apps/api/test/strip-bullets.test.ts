import { readFileSync } from "node:fs";
import type { Entity, Item } from "@orbit/core";
import { describe, expect, it } from "vitest";
import { UPSERT_ENTITY, UPSERT_ITEM, entityRow, itemRow } from "../src/db/statements.js";
import { testDb } from "./helpers/d1.js";

const MIGRATION = readFileSync(new URL("../migrations/0006_strip_bullets.sql", import.meta.url), "utf8");

const card = (id: string, title: string, rows: string[][]): Item => ({
  id,
  kind: "Places",
  title,
  status: "todo",
  tags: [],
  source: "",
  props: {},
  notes: "",
  due: null,
  start: null,
  archived: false,
  deleted: false,
  entityId: null,
  refs: [],
  links: [],
  attachments: [],
  comments: [],
  checklists: rows.map((r, i) => ({
    name: `List ${i}`,
    rows: r.map((text, j) => ({ text, done: j === 0, ref: null, entityId: j === 1 ? "e1" : null })),
  })),
  coverId: null,
  createdAt: 1,
  updatedAt: 1,
});

const place = (id: string, name: string): Entity => ({
  id,
  name,
  category: "place",
  confidence: "none",
  updatedAt: 1,
});

describe("migration 0006: strip bullets", () => {
  it("drops the marker from row text, titles and names, and leaves the rest as it was", () => {
    const { sqlite } = testDb();
    const put = (sql: string, args: unknown[]) => sqlite.prepare(sql).run(...(args as never[]));
    put(UPSERT_ITEM, itemRow(card("a", "National parks", [["**California**", "* Fort Ord", "---"], ["- Muir Woods"]])));
    put(UPSERT_ITEM, itemRow(card("b", "* Weekend list", [["Plain"]])));
    put(UPSERT_ITEM, itemRow(card("c", "Untouched", [["Plain", "**Bold**"]])));
    put(UPSERT_ENTITY, entityRow(place("e1", "* Fort Ord")));
    put(UPSERT_ENTITY, entityRow(place("e2", "Yosemite")));

    sqlite.exec(MIGRATION);

    const items = Object.fromEntries(
      sqlite
        .prepare("SELECT id, title, data, updated_at FROM items")
        .all()
        .map((r) => [
          r.id as string,
          {
            title: r.title as string,
            data: r.data as string,
            updated_at: r.updated_at as number,
            item: JSON.parse(r.data as string) as Item,
          },
        ]),
    );
    const a = items.a!.item;
    expect(a.checklists.map((c) => c.rows.map((r) => r.text))).toEqual([
      ["**California**", "Fort Ord", "---"],
      ["Muir Woods"],
    ]);
    expect(a.checklists[0]!.rows[0]).toEqual({ text: "**California**", done: true, ref: null, entityId: null });
    expect(a.checklists[0]!.rows[1]).toEqual({ text: "Fort Ord", done: false, ref: null, entityId: "e1" });
    expect(a.checklists[1]!.name).toBe("List 1");
    expect(items.a!.updated_at).toBeGreaterThan(1);
    expect(a.updatedAt).toBe(items.a!.updated_at);

    expect(items.b!.title).toBe("Weekend list");
    expect(items.b!.item.title).toBe("Weekend list");
    expect(items.c!.updated_at).toBe(1);
    expect(items.c!.data).toBe(JSON.stringify(card("c", "Untouched", [["Plain", "**Bold**"]])));

    const ents = sqlite.prepare("SELECT id, name, data, updated_at FROM entities ORDER BY id").all();
    expect(ents.map((e) => e.name)).toEqual(["Fort Ord", "Yosemite"]);
    expect((JSON.parse(ents[0]!.data as string) as Entity).name).toBe("Fort Ord");
    expect(ents[1]!.updated_at).toBe(1);

    // Running it again changes nothing.
    const before = sqlite.prepare("SELECT data FROM items ORDER BY id").all();
    sqlite.exec(MIGRATION);
    expect(sqlite.prepare("SELECT data FROM items ORDER BY id").all()).toEqual(before);
  });
});
