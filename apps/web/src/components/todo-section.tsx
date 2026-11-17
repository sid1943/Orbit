import { parseTodo } from "@orbit/core";
import { useState } from "react";
import { Link } from "react-router";
import { useCreateItem } from "../api/queries.js";
import type { TodoGroup } from "../lib/today-sections.js";
import { ItemRow } from "./item-row.js";
import { Section } from "./section.js";

/** To-do on Today: add one (with #Quest), tick them off, grouped by quest. */
export function TodoSection({ groups, count }: { groups: TodoGroup[]; count: number }) {
  const create = useCreateItem();
  const [text, setText] = useState("");

  const add = () => {
    const t = parseTodo(text);
    if (!t) return;
    create.mutate(
      { kind: "To-do", title: t.title, status: "todo", props: { Quest: t.quest } },
      { onSuccess: () => setText("") },
    );
  };

  return (
    <Section
      title="To-do"
      note={`${count.toLocaleString()} open`}
      action={
        <Link className="btn small" to="/kind/to-do">
          All to-dos →
        </Link>
      }
    >
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a to-do and press Enter (add #Quest to file it)"
          aria-label="Add a to-do"
          disabled={create.isPending}
        />
      </form>
      {create.isError && (
        <p className="error" role="alert">
          Couldn&apos;t add that to-do. Try again.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.quest}>
          <div className="group-head">
            {g.quest} · {g.items.length}
          </div>
          <div className="list">
            {g.items.map((i) => (
              <ItemRow key={i.id} item={i} todo />
            ))}
          </div>
        </div>
      ))}
      {!count && <p className="muted">Nothing to do. Nice.</p>}
    </Section>
  );
}
