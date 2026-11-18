import { relativeDays } from "@orbit/core";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useItemSummaries } from "../api/queries.js";
import { AllCardsView } from "../components/all-cards-view.js";
import { ItemCard } from "../components/item-card.js";
import { ItemRow } from "../components/item-row.js";
import { KindTiles } from "../components/kind-tiles.js";
import { NearYouSection } from "../components/near-you-section.js";
import { ProgressBar } from "../components/progress-bar.js";
import { Segmented } from "../components/segmented.js";
import { Section } from "../components/section.js";
import { TodoSection } from "../components/todo-section.js";
import { TopicCloud } from "../components/topic-cloud.js";
import { shortDate } from "../lib/dates.js";
import { todaySections } from "../lib/today-sections.js";

const MONTH = () => new Date().toLocaleDateString(undefined, { month: "long" });

const VIEWS = [
  { value: "today", label: "Today" },
  { value: "all", label: "All cards" },
] as const;

/**
 * Home, and where Back always goes: kind tiles, then what matters today. The "All cards" switch shows every
 * card with filters instead (`?all=1`, with the filters in the address too).
 */
export function Today() {
  const items = useItemSummaries();
  const [params, setParams] = useSearchParams();
  const showAll = params.get("all") === "1";
  const s = useMemo(() => (items.data ? todaySections(items.data) : null), [items.data]);

  if (!items.data || !s) {
    return (
      <div className="pad">{items.isPending && !items.isError && <p className="muted">Loading your cards…</p>}</div>
    );
  }

  return (
    <div className="pad today">
      <KindTiles items={items.data} canAdd />

      <div className="today-switch">
        <Segmented
          label="Show"
          value={showAll ? "all" : "today"}
          options={VIEWS}
          onChange={(v) => setParams(v === "all" ? { all: "1" } : {}, { replace: true })}
        />
      </div>

      {showAll ? <AllCardsView /> : <TodaySections s={s} />}
    </div>
  );
}

/** Today's own sections: Near you, Coming up, In season, In progress, To-do, and the rest. */
function TodaySections({ s }: { s: ReturnType<typeof todaySections> }) {
  return (
    <>
      <NearYouSection />

      {s.comingUp.length > 0 && (
        <Section title="Coming up" note="dated events in the next 4 months">
          <div className="list">
            {s.comingUp.map(({ item, when, days }) => (
              <ItemRow
                key={item.id}
                item={item}
                note={when.text}
                right={
                  <>
                    <b className="when-d">{relativeDays(days!)}</b> {when.next && shortDate(when.next)}
                  </>
                }
              />
            ))}
          </div>
        </Section>
      )}

      {s.inSeason.length > 0 && (
        <Section title="In season now" note={`${MONTH()} is a good time for these`}>
          <div className="list">
            {s.inSeason.map(({ item }) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        </Section>
      )}

      {s.inProgress.length > 0 && (
        <Section title="In progress" note={`${s.doingCount.toLocaleString()} running`}>
          <div className="list">
            {s.inProgress.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </div>
        </Section>
      )}

      <TodoSection groups={s.todos} count={s.todoCount} />

      {s.closest.length > 0 && (
        <Section title="Closest to finished" note="checklists with the most ticked off">
          <div className="cards">
            {s.closest.map((i) => (
              <ItemCard key={i.id} item={i}>
                <ProgressBar done={i.done} total={i.total} wide />
                <span className="small">
                  {i.done} of {i.total} · {Math.round((i.done / i.total) * 100)}%
                </span>
              </ItemCard>
            ))}
          </div>
        </Section>
      )}

      {s.picks.length > 0 && (
        <Section title="Pick one today" note="a different six each day">
          <div className="cards">
            {s.picks.map((i) => (
              <ItemCard key={i.id} item={i}>
                <span className="small">
                  {i.tags
                    .slice(0, 3)
                    .map((t) => `#${t}`)
                    .join("  ")}
                </span>
              </ItemCard>
            ))}
          </div>
        </Section>
      )}

      {s.recent.length > 0 && (
        <Section title="Recently changed">
          <div className="list">
            {s.recent.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </div>
        </Section>
      )}

      {s.topics.length > 0 && (
        <Section title="Topics" note="click one to see everything that shares it, across every kind">
          <TopicCloud topics={s.topics} />
        </Section>
      )}
    </>
  );
}
