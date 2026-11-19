import { relativeDays } from "@orbit/core";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useItemSummaries, usePendingReview } from "../api/queries.js";
import { AllCardsView } from "../components/all-cards-view.js";
import { ItemCard } from "../components/item-card.js";
import { ItemRow } from "../components/item-row.js";
import { KindTiles } from "../components/kind-tiles.js";
import { NearMeView } from "../components/near-me-view.js";
import { ProgressBar } from "../components/progress-bar.js";
import { ReviewView } from "../components/review-view.js";
import { Segmented } from "../components/segmented.js";
import { Section } from "../components/section.js";
import { TodoPart, TodoSection } from "../components/todo-section.js";
import { TopicMapView } from "../components/topic-map-view.js";
import { shortDate } from "../lib/dates.js";
import { todaySections } from "../lib/today-sections.js";
import { readTodayView, todayViewParams, todayViews } from "../lib/today-view.js";

const MONTH = () => new Date().toLocaleDateString(undefined, { month: "long" });

/**
 * Center Base, the home page and where Back always goes: kind tiles, then a switch between Today (to-dos and what's
 * moving), Coming up (`?soon=1`), In season (`?season=1`), All cards (every card with filters, `?all=1`), Near me (places by distance, `?near=1`) and Map
 * (topics as a network, `?map=1`), plus Review (`?review=1`) only while link guesses wait for an answer. Each side
 * keeps its filters in the address.
 */
export function Today() {
  const items = useItemSummaries();
  const [params, setParams] = useSearchParams();
  const view = readTodayView(params);
  const pending = usePendingReview().data?.length ?? 0;
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
          value={view}
          options={todayViews(pending, view)}
          onChange={(v) => setParams(todayViewParams(v), { replace: true })}
        />
      </div>

      {view === "soon" ? (
        <ComingUp s={s} />
      ) : view === "season" ? (
        <InSeason s={s} />
      ) : view === "all" ? (
        <AllCardsView />
      ) : view === "near" ? (
        <NearMeView />
      ) : view === "map" ? (
        <TopicMapView />
      ) : view === "review" ? (
        <ReviewView />
      ) : (
        <TodaySections s={s} />
      )}
    </div>
  );
}

/** Today: To-do, with what's in progress, closest to finished and recently changed inside it, then a daily pick. */
function TodaySections({ s }: { s: ReturnType<typeof todaySections> }) {
  return (
    <>
      <TodoSection groups={s.todos} count={s.todoCount}>
        {s.inProgress.length > 0 && (
          <TodoPart title="In progress" note={`${s.doingCount.toLocaleString()} running`}>
            <div className="list">
              {s.inProgress.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </div>
          </TodoPart>
        )}
        {s.closest.length > 0 && (
          <TodoPart title="Closest to finished" note="checklists with the most ticked off">
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
          </TodoPart>
        )}
        {s.recent.length > 0 && (
          <TodoPart title="Recently changed">
            <div className="list">
              {s.recent.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </div>
          </TodoPart>
        )}
      </TodoSection>

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
    </>
  );
}

/** Coming up: every open card with a date, soonest first. */
function ComingUp({ s }: { s: ReturnType<typeof todaySections> }) {
  return (
    <Section title="Coming up" note="dated things, soonest first">
      {s.comingUp.length ? (
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
      ) : (
        <p className="empty">Nothing dated yet. Give a card a Preferable Time (a date or a month) and it shows here.</p>
      )}
    </Section>
  );
}

/** In season: every open card that's good to do this month. */
function InSeason({ s }: { s: ReturnType<typeof todaySections> }) {
  return (
    <Section title="In season now" note={`${MONTH()} is a good time for these`}>
      {s.inSeason.length ? (
        <div className="list">
          {s.inSeason.map(({ item }) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="empty">Nothing is in season this month.</p>
      )}
    </Section>
  );
}
