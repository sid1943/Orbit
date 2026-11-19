import { STATUSES, byStatusThenRecent, topicCounts, type Status, type SyncItem, type TopicCount } from "@orbit/core";

/**
 * The topic map and topic pages, with Orbit today's rules: the 90 biggest topics as circles (bigger for more
 * cards, coloured by the kind most of their cards are), joined when two topics share at least two cards.
 */

export interface TopicNode {
  key: string;
  name: string;
  count: number;
  /** The kind most of its cards are, for the colour. */
  kind: string;
  /** Circle radius, before zoom. */
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TopicEdge {
  a: number;
  b: number;
  /** Cards the two topics share. */
  w: number;
}

export interface TopicGraph {
  nodes: TopicNode[];
  edges: TopicEdge[];
  maxW: number;
}

const live = (items: readonly SyncItem[]) => items.filter((i) => !i.deleted && !i.archived);

/** The map's topics and the lines between them. Starts on a spiral so the layout settles the same way each time. */
export function topicGraph(items: readonly SyncItem[], max = 90): TopicGraph {
  const cards = live(items);
  const top = topicCounts(cards).slice(0, max);
  const index = new Map(top.map((t, i) => [t.key, i]));
  const kinds = top.map(() => new Map<string, number>());
  const weights = new Map<string, number>();
  for (const c of cards) {
    const keys = [...new Set(c.tags.map((t) => t.toLowerCase()))].filter((k) => index.has(k));
    for (const k of keys) {
      const m = kinds[index.get(k)!]!;
      m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
    }
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const a = index.get(keys[i]!)!,
          b = index.get(keys[j]!)!;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
  }
  const nodes = top.map((t, i): TopicNode => {
    const kind = [...kinds[i]!].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "Note";
    const angle = i * 2.399,
      radius = 30 + Math.sqrt(i) * 38;
    return {
      key: t.key,
      name: t.name,
      count: t.count,
      kind,
      r: 4 + Math.sqrt(t.count) * 1.6,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });
  const edges = [...weights]
    .map(([key, w]) => {
      const [a, b] = key.split("|").map(Number) as [number, number];
      return { a, b, w };
    })
    .filter((e) => e.w >= 2);
  return { nodes, edges, maxW: Math.max(1, ...edges.map((e) => e.w)) };
}

/** One step of the layout: topics push apart, shared cards pull them together, everything drifts to the middle. */
export function layoutStep(g: TopicGraph, alpha: number): void {
  const { nodes, edges, maxW } = g;
  for (const a of nodes) {
    a.vx -= a.x * 0.004;
    a.vy -= a.y * 0.004;
  }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!,
        b = nodes[j]!;
      let dx = a.x - b.x,
        dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 0.01,
        d = Math.sqrt(d2);
      const min = a.r + b.r + 14;
      let f = 2400 / d2;
      if (d < min) f += (min - d) * 0.08;
      dx /= d;
      dy /= d;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
  for (const e of edges) {
    const a = nodes[e.a]!,
      b = nodes[e.b]!;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - 95) * 0.002 * Math.min(1, 0.25 + (e.w / maxW) * 3) * d * 0.02;
    a.vx += (dx / d) * f;
    a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f;
    b.vy -= (dy / d) * f;
  }
  for (const a of nodes) {
    a.vx *= 0.8;
    a.vy *= 0.8;
    a.x += a.vx * alpha;
    a.y += a.vy * alpha;
  }
}

/** Topics for the Big topics panel: on 6 or more cards, biggest first, at most 40. */
export const bigTopics = (items: readonly SyncItem[]): TopicCount[] =>
  topicCounts(live(items))
    .filter((t) => t.count >= 6)
    .slice(0, 40);

export interface TopicPage {
  /** The topic as most cards spell it, or null when no card has it. */
  name: string | null;
  /** Every visible card with the topic. */
  all: SyncItem[];
  kindCounts: { kind: string; count: number }[];
  statusCounts: { status: Status; count: number }[];
  /** Topics on the same cards, most shared first (16 at most). */
  connected: TopicCount[];
  /** The cards after the kind and status filters, in list order. */
  list: SyncItem[];
}

/** Everything one topic's page shows. `key` is the topic in lowercase. */
export function topicPage(
  items: readonly SyncItem[],
  key: string,
  { kind, status, showArchived }: { kind: string | null; status: Status | "all"; showArchived: boolean },
): TopicPage {
  const k = key.toLowerCase();
  const all = items.filter(
    (i) => !i.deleted && (showArchived || !i.archived) && i.tags.some((t) => t.toLowerCase() === k),
  );
  const name = all.length ? (topicCounts(all).find((t) => t.key === k)?.name ?? null) : null;
  const kinds = new Map<string, number>();
  for (const c of all) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);
  const connected = topicCounts(all)
    .filter((t) => t.key !== k)
    .slice(0, 16);
  return {
    name,
    all,
    kindCounts: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    statusCounts: STATUSES.map((s) => ({ status: s, count: all.filter((c) => c.status === s).length })).filter(
      (s) => s.count > 0,
    ),
    connected,
    list: all
      .filter((c) => (!kind || c.kind === kind) && (status === "all" || c.status === status))
      .sort(byStatusThenRecent),
  };
}
