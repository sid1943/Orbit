import { kindHue, type KindInfo } from "@orbit/core";
import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useItemSummaries, useKinds } from "../api/queries.js";
import { bigTopics, focusRing, graphBounds, layoutStep, topicGraph, type TopicGraph } from "../lib/topic-map.js";

const FRAMES = 260;
/** Frames the hover ring takes to open or close. */
const FOCUS_FRAMES = 14;

type Point = { x: number; y: number };

/** The map's drawing state, kept outside React so dragging and zooming don't re-render the page. */
interface View {
  tx: number;
  ty: number;
  scale: number;
  /** The user moved or zoomed: stop fitting the map to the box. */
  touched: boolean;
  hover: number;
  /** The topic whose ring is showing (or closing), its neighbours' ring spots, and how open it is (0–1). */
  focus: number;
  ring: Map<number, Point>;
  open: number;
  w: number;
  h: number;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Where a topic is drawn: its place, moved toward its ring spot while a ring is open. */
function at(g: TopicGraph, v: View, i: number): Point {
  const n = g.nodes[i]!;
  const to = v.ring.get(i);
  if (!to || v.open <= 0) return n;
  const t = v.open * v.open * (3 - 2 * v.open);
  return { x: n.x + (to.x - n.x) * t, y: n.y + (to.y - n.y) * t };
}

/** Fit every topic and its name in the box (until the user moves or zooms). */
function fit(g: TopicGraph, v: View) {
  if (v.touched || !v.w || !v.h) return;
  const b = graphBounds(g);
  const scale = Math.min(1.4, (v.w - 40) / (b.maxX - b.minX || 1), (v.h - 40) / (b.maxY - b.minY || 1));
  v.scale = Math.max(0.15, scale);
  v.tx = -((b.minX + b.maxX) / 2) * v.scale;
  v.ty = -((b.minY + b.maxY) / 2) * v.scale;
}

function draw(ctx: CanvasRenderingContext2D, g: TopicGraph, v: View, kinds: readonly KindInfo[] | undefined) {
  const ink = css("--ink"),
    line = css("--line"),
    muted = css("--muted"),
    panel = css("--panel"),
    sat = css("--kind-s"),
    light = css("--kind-l"),
    fz = Number(css("--fz")) || 1,
    font = css("--body") || "sans-serif";
  const colour = (kind: string) => `hsl(${kindHue(kind, kinds)} ${sat} ${light})`;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, v.w, v.h);
  ctx.translate(v.w / 2 + v.tx, v.h / 2 + v.ty);
  ctx.scale(v.scale, v.scale);

  // While a ring is open, the hovered topic and its neighbours stand out and everything else steps back.
  const lit = v.focus >= 0 && v.open > 0 ? new Set([v.focus, ...v.ring.keys()]) : null;
  const fade = (i: number) => (lit && !lit.has(i) ? 1 - 0.85 * v.open : 1);
  const pos = g.nodes.map((_, i) => at(g, v, i));

  for (const e of g.edges) {
    const a = pos[e.a]!,
      b = pos[e.b]!;
    const hot = lit !== null && (e.a === v.focus || e.b === v.focus);
    ctx.strokeStyle = hot ? colour(g.nodes[v.focus]!.kind) : line;
    ctx.globalAlpha = hot ? 0.5 + 0.5 * v.open : Math.min(fade(e.a), fade(e.b)) * Math.min(1, 0.35 + e.w / g.maxW);
    ctx.lineWidth = (hot ? 1.6 : 0.6 + (e.w / g.maxW) * 3) / v.scale;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Circles first, then every name on top with a halo in the background colour, so names stay readable.
  const order = g.nodes.map((_, i) => i).sort((a, b) => Number(lit?.has(a) ?? false) - Number(lit?.has(b) ?? false));
  for (const i of order) {
    const n = g.nodes[i]!,
      p = pos[i]!;
    ctx.globalAlpha = fade(i);
    ctx.fillStyle = colour(n.kind);
    ctx.beginPath();
    ctx.arc(p.x, p.y, n.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = panel;
    ctx.lineWidth = 1.5 / v.scale;
    ctx.stroke();
  }
  // Names keep a readable size on screen however far out the map is zoomed.
  const size = (12 * fz) / Math.max(v.scale, 0.55);
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  for (const i of order) {
    const n = g.nodes[i]!,
      p = pos[i]!;
    const strong = i === v.focus && lit !== null;
    ctx.globalAlpha = fade(i);
    ctx.font = `${strong ? 700 : lit?.has(i) ? 600 : 500} ${size}px ${font}`;
    const y = p.y + n.r + size;
    ctx.strokeStyle = panel;
    ctx.lineWidth = 4 / Math.max(v.scale, 0.55);
    ctx.strokeText(n.name, p.x, y);
    ctx.fillStyle = strong || lit?.has(i) ? ink : muted;
    ctx.fillText(n.name, p.x, y);
  }
  ctx.globalAlpha = 1;
}

/**
 * Map, the fourth side of Center Base's switch (`?map=1`): the 90 biggest topics as a network, every name shown in
 * full. Drag to move, scroll to zoom, hover a topic to pull its connected topics into a ring around it, click to open
 * the topic. Big topics sit in a side panel.
 */
export function TopicMapView() {
  const items = useItemSummaries();
  const kinds = useKinds().data;
  const navigate = useNavigate();
  const canvas = useRef<HTMLCanvasElement>(null);
  const graph = useMemo(() => (items.data ? topicGraph(items.data) : null), [items.data]);
  const big = useMemo(() => (items.data ? bigTopics(items.data) : []), [items.data]);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || !graph || !graph.nodes.length) return;
    const v: View = {
      tx: 0,
      ty: 0,
      scale: 1,
      touched: false,
      hover: -1,
      focus: -1,
      ring: new Map(),
      open: 0,
      w: 0,
      h: 0,
    };
    let frame = 0,
      raf = 0,
      stopped = false;
    const redraw = () => draw(ctx, graph, v, kinds);
    const size = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      v.w = r.width;
      v.h = r.height;
      fit(graph, v);
      redraw();
    };
    // One loop runs while the layout settles or the hover ring opens or closes, then stops.
    const tick = () => {
      raf = 0;
      if (stopped) return;
      let busy = false;
      if (frame < FRAMES) {
        layoutStep(graph, Math.max(0.05, 1 - frame / FRAMES));
        frame++;
        fit(graph, v);
        busy = true;
        if (v.focus >= 0) v.ring = focusRing(graph, v.focus);
      }
      const want = v.hover >= 0 && v.hover === v.focus ? 1 : 0;
      if (v.open !== want) {
        v.open = want > v.open ? Math.min(1, v.open + 1 / FOCUS_FRAMES) : Math.max(0, v.open - 1 / FOCUS_FRAMES);
        busy = true;
      }
      // Once the old ring has closed, open the one for the topic now under the pointer.
      if (v.open === 0 && v.hover !== v.focus) {
        v.focus = v.hover;
        v.ring = v.focus >= 0 ? focusRing(graph, v.focus) : new Map();
        busy = busy || v.focus >= 0;
      }
      redraw();
      if (busy) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf && !stopped) raf = requestAnimationFrame(tick);
    };
    size();
    const resize = new ResizeObserver(size);
    resize.observe(cv);
    wake();

    const toWorld = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left - v.w / 2 - v.tx) / v.scale, y: (e.clientY - r.top - v.h / 2 - v.ty) / v.scale };
    };
    const hit = (e: PointerEvent) => {
      const p = toWorld(e);
      let best = -1,
        bestD = Infinity;
      graph.nodes.forEach((n, i) => {
        const q = at(graph, v, i);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < n.r + 8 / v.scale && d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };
    let drag: { x: number; y: number; tx: number; ty: number } | null = null,
      moved = false;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty };
      moved = false;
      cv.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          moved = true;
          v.touched = true;
        }
        v.tx = drag.tx + dx;
        v.ty = drag.ty + dy;
        redraw();
        return;
      }
      const h = hit(e);
      // Staying over the open ring's topic or one of its neighbours keeps the ring open.
      const keep = h >= 0 && v.focus >= 0 && (h === v.focus || v.ring.has(h)) ? v.focus : h;
      if (keep !== v.hover) {
        v.hover = keep;
        cv.style.cursor = h >= 0 ? "pointer" : "grab";
        wake();
      }
    };
    const leave = () => {
      if (drag) return;
      v.hover = -1;
      wake();
    };
    const up = (e: PointerEvent) => {
      const was = drag;
      drag = null;
      if (was && !moved) {
        const h = hit(e);
        if (h >= 0) navigate(`/topic/${encodeURIComponent(graph.nodes[h]!.key)}`);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      v.touched = true;
      const f = Math.exp(-e.deltaY * 0.0015);
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left - v.w / 2,
        my = e.clientY - r.top - v.h / 2;
      const scale = Math.min(6, Math.max(0.15, v.scale * f));
      const k = scale / v.scale;
      v.tx = mx - (mx - v.tx) * k;
      v.ty = my - (my - v.ty) * k;
      v.scale = scale;
      redraw();
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointerleave", leave);
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointerleave", leave);
      cv.removeEventListener("wheel", wheel);
    };
  }, [graph, kinds, navigate]);

  if (!items.data) return items.isPending && !items.isError ? <p className="muted">Loading your cards…</p> : null;
  if (!graph?.nodes.length)
    return (
      <p className="empty">No topics yet. Add #topics to cards and they show up here, joined by what they share.</p>
    );

  return (
    <div className="map-view">
      <p className="muted map-note">
        Bigger circles hold more things. Lines join topics that appear on the same things. Drag to move, scroll to zoom,
        click a topic to open it. Showing the {graph.nodes.length} biggest topics.
      </p>
      <div className="map-split">
        <div className="map-canvas">
          <canvas ref={canvas} aria-label="Topic map" role="img" />
        </div>
        <aside className="map-big" aria-label="Big topics">
          <div className="map-big-head">Big topics</div>
          {big.map((t) => (
            <Link key={t.key} className="map-big-item" to={`/topic/${encodeURIComponent(t.key)}`}>
              #{t.name}
              <span className="n">{t.count.toLocaleString()}</span>
            </Link>
          ))}
        </aside>
      </div>
    </div>
  );
}
