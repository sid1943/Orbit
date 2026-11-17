import {
  cardKey,
  hiddenFor,
  linkedCardIds,
  relatedByTopics,
  thingLinks,
  usefulLinks,
  type ChecklistRow,
  type Entity,
  type FullItem,
  type SyncItem,
} from "@orbit/core";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import type { ItemEditFields } from "../api/client.js";
import { useDeleteItem, useEditCard, useFullItem, useItemSummaries, useKinds } from "../api/queries.js";
import { CardChecklists } from "../components/card-checklists.js";
import { CardComments } from "../components/card-comments.js";
import { CardHeader } from "../components/card-header.js";
import { CardNotes } from "../components/card-notes.js";
import { CardSide } from "../components/card-side.js";
import { UsefulLinks } from "../components/useful-links.js";
import { useCardFinder } from "../lib/card-finder.js";

/** Leaves the card: back where you came from inside the app, otherwise Today. */
function useClose() {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate("/");
  };
}

/** Everything on one card, laid out as the big centered card. */
function CardPanel({ full }: { full: FullItem }) {
  const { item, entities, reviews } = full;
  const edit = useEditCard(item.id);
  const del = useDeleteItem();
  const close = useClose();
  const navigate = useNavigate();
  const findCard = useCardFinder();
  const summaries = useItemSummaries();
  const cards = summaries.data;

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const byCard = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards]);

  const save = (fields: ItemEditFields) => edit.mutate(fields);
  const thing = item.entityId ? (byId.get(item.entityId) ?? null) : null;
  const links = usefulLinks(item, thing, hiddenFor(reviews, thing?.id ?? cardKey(item.id)));
  const thingOf = (row: ChecklistRow): Entity | null => (row.entityId ? (byId.get(row.entityId) ?? null) : null);
  const linksOf = (e: Entity) => thingLinks(e, hiddenFor(reviews, e.id));

  const linksTo = linkedCardIds(item, findCard)
    .map((id) => byCard.get(id))
    .filter((c): c is SyncItem => !!c && !c.deleted);
  const shown = new Set(linksTo.map((c) => c.id));
  const related = useMemo(
    () =>
      cards
        ? relatedByTopics(
            item,
            cards.filter((c) => !c.archived),
          )
        : [],
    [item, cards],
  ).filter((r) => !shown.has(r.card.id));
  const kindEntries = useKinds().data;
  const kinds = useMemo(
    () => [...new Set([...(kindEntries ?? []).map((k) => k.name), ...(cards ?? []).map((c) => c.kind)])],
    [kindEntries, cards],
  );
  const topics = useMemo(() => [...new Set((cards ?? []).flatMap((c) => c.tags))].sort(), [cards]);

  return (
    <article className="card-panel" aria-label={item.title}>
      <CardHeader
        item={item}
        kinds={kinds}
        save={save}
        onClose={close}
        onDelete={() => del.mutate(item.id, { onSuccess: () => void navigate("/") })}
      />
      {(edit.isError || del.isError) && (
        <div className="error card-error" role="alert">
          {edit.isError
            ? `Couldn't save that change: ${edit.error.message}`
            : `Couldn't delete this card: ${del.error?.message ?? ""}`}
        </div>
      )}
      <div className="card-grid">
        <div className="card-main">
          <UsefulLinks links={links} />
          <CardNotes notes={item.notes} onSave={(notes) => save({ notes })} />
          <CardChecklists
            lists={item.checklists}
            thingOf={thingOf}
            linksOf={linksOf}
            cardOf={(id) => byCard.get(id) ?? null}
            save={(checklists) => save({ checklists })}
          />
          <CardComments comments={item.comments} onSave={(comments) => save({ comments })} />
        </div>
        <CardSide item={item} save={save} linksTo={linksTo} related={related} />
      </div>
      <datalist id="all-topics">
        {topics.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </article>
  );
}

/** `/item/:id`: one card, opened. */
export function CardPage() {
  const { id } = useParams();
  const full = useFullItem(id);
  const close = useClose();

  if (full.data && !full.data.item.deleted) return <CardPanel key={full.data.item.id} full={full.data} />;
  return (
    <article className="card-panel card-empty">
      <div className="card-line1">
        <span className="spacer" />
        <button type="button" className="card-close" onClick={close} aria-label="Close" title="Close">
          ×
        </button>
      </div>
      {full.isPending ? (
        <p className="muted">Opening the card…</p>
      ) : full.isError && full.error.message !== "not found" ? (
        <p className="error" role="alert">
          Couldn't open this card: {full.error.message}
        </p>
      ) : (
        <p className="muted">This card isn't here. It may have been deleted.</p>
      )}
    </article>
  );
}
