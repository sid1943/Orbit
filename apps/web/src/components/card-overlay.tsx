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
import { useEffect, useMemo, type ReactNode } from "react";
import type { ItemEditFields } from "../api/client.js";
import { useDeleteItem, useEditCard, useFullItem, useItemSummaries, useKinds } from "../api/queries.js";
import { CardChecklists } from "./card-checklists.js";
import { CardComments } from "./card-comments.js";
import { CardHeader } from "./card-header.js";
import { CardNotes } from "./card-notes.js";
import { CardSide } from "./card-side.js";
import { UsefulLinks } from "./useful-links.js";
import { useCardFinder, useTrelloCards } from "../lib/card-finder.js";
import { isTyping } from "../lib/keys.js";

/** Everything on one card, laid out as the big centered card. */
function CardPanel({
  full,
  close,
  back,
}: {
  full: FullItem;
  close: () => void;
  back?: { title: string; go: () => void };
}) {
  const { item, entities, reviews } = full;
  const edit = useEditCard(item.id);
  const del = useDeleteItem();
  const findCard = useCardFinder();
  const summaries = useItemSummaries();
  const cards = summaries.data;

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const byCard = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards]);

  const save = (fields: ItemEditFields) => edit.mutate(fields);
  const thing = item.entityId ? (byId.get(item.entityId) ?? null) : null;
  const cardForUrl = useTrelloCards();
  const links = usefulLinks(item, thing, hiddenFor(reviews, thing?.id ?? cardKey(item.id)), cardForUrl);
  // A row's own linked thing, else that of the card it points at, so a row shows IMDb and its card both.
  const thingOf = (row: ChecklistRow): Entity | null => {
    const id = row.entityId ?? (row.ref ? byCard.get(row.ref)?.entityId : null);
    return id ? (byId.get(id) ?? null) : null;
  };
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
    <>
      <CardHeader
        item={item}
        kinds={kinds}
        save={save}
        onClose={close}
        back={back}
        onDelete={() => del.mutate(item.id, { onSuccess: close })}
      />
      <div className="card-body">
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
      </div>
      <datalist id="all-topics">
        {topics.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

/** The dimmed backdrop and the centered card. Clicking the backdrop or pressing Escape closes it. */
function Overlay({ label, close, children }: { label: string; close: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTyping(document.activeElement) && !document.querySelector(".new-item-scrim"))
        close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="card-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <article className="card-panel" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </article>
    </div>
  );
}

/**
 * A card (`/item/:id`), opened over the page you were on, as in Orbit today. The page behind stays as
 * it was; `onClose` goes back to it.
 */
export function CardOverlay({
  id,
  cameFrom,
  onBack,
  onClose,
}: {
  id: string;
  /** The card this one was opened from, if any: the header then has Back to it. */
  cameFrom?: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const full = useFullItem(id);
  const from = useItemSummaries().data?.find((c) => c.id === cameFrom);
  const back = from ? { title: from.title, go: onBack } : undefined;

  if (full.data && !full.data.item.deleted)
    return (
      <Overlay label={full.data.item.title} close={onClose}>
        <CardPanel key={full.data.item.id} full={full.data} close={onClose} back={back} />
      </Overlay>
    );
  return (
    <Overlay label="Card" close={onClose}>
      <div className="card-empty">
        <div className="card-line1">
          <span className="spacer" />
          <button type="button" className="card-close" onClick={onClose} aria-label="Close" title="Close">
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
      </div>
    </Overlay>
  );
}
