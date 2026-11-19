import { kindHue, type KindInfo } from "@orbit/core";
import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useItemSummaries, useKinds } from "../api/queries.js";
import { bigTopics, layoutStep, topicGraph, type TopicGraph } from "../lib/topic-map.js";

const FRAMES = 260;

/** The map's drawing state, kept outside React so dragging and zooming don't re-render the page. */
interface View {
  tx: number;
  ty: number;
  scale: number;
  hover: number;
  w: number;
  h: number;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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

  const near = new Set<number>();
  if (v.hover >= 0)
    for (const e of g.edges) {
      if (e.a === v.hover) near.add(e.b);
      if (e.b === v.hover) near.add(e.a);
    }
  for (const e of g.edges) {
    const a = g.nodes[e.a]!,
      b = g.nodes[e.b]!;
    const hot = v.hover >= 0 && (e.a === v.hover || e.b === v.hover);
    ctx.strokeStyle = hot ? colour(g.nodes[v.hover]!.kind) : line;
    ctx.globalAlpha = v.hover >= 0 && !hot ? 0.25 : Math.min(1, 0.35 + e.w / g.maxW);
    ctx.lineWidth = (hot ? 1.5 : 0.6 + (e.w / g.maxW) * 3) / v.scale;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  g.nodes.forEach((n, i) => {
    const dim = v.hover >= 0 && i !== v.hover && !near.has(i);
    ctx.globalAlpha = dim ? 0.3 : 1;
    ctx.fillStyle = colour(n.kind);
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = panel;
    ctx.lineWidth = 1.5 / v.scale;
    ctx.stroke();
    if (n.r > 7 || i === v.hover || near.has(i) || v.scale > 1.6) {
      ctx.font = `${i === v.hover ? 600 : 500} ${(12 * fz) / v.scale}px ${font}`;
      ctx.fillStyle = i === v.hover ? ink : muted;
      ctx.textAlign = "center";
      ctx.fillText(n.name, n.x, n.y + n.r + 12 / v.scale);
    }
  });
  ctx.globalAlpha = 1;
}

/**
 * Map, the fourth side of Center Base's switch (`?map=1`): the 90 biggest topics as a network. Drag to move,
 * scroll to zoom, hover to light up a topic's neighbours, click to open the topic. Big topics sit in a side panel.
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
    const v: View = { tx: 0, ty: 0, scale: 1, hover: -1, w: 0, h: 0 };
    let frame = 0,
      raf = 0,
      stopped = false;
    const redraw = () => draw(ctx, graph, v, kinds);
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      v.w = r.width;
      v.h = r.height;
      redraw();
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(cv);
    const loop = () => {
      if (stopped || frame >= FRAMES) return;
      layoutStep(graph, Math.max(0.05, 1 - frame / FRAMES));
      frame++;
      redraw();
      raf = requestAnimationFrame(loop);
    };
    loop();

    const toWorld = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left - v.w / 2 - v.tx) / v.scale, y: (e.clientY - r.top - v.h / 2 - v.ty) / v.scale };
    };
    const hit = (e: PointerEvent) => {
      const p = toWorld(e);
      let best = -1,
        bestD = Infinity;
      graph.nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < n.r + 6 / v.scale && d < bestD) {
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
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        v.tx = drag.tx + dx;
        v.ty = drag.ty + dy;
        redraw();
        return;
      }
      const h = hit(e);
      if (h !== v.hover) {
        v.hover = h;
        cv.style.cursor = h >= 0 ? "pointer" : "grab";
        redraw();
      }
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
      const f = Math.exp(-e.deltaY * 0.0015);
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left - v.w / 2,
        my = e.clientY - r.top - v.h / 2;
      v.tx = mx - (mx - v.tx) * f;
      v.ty = my - (my - v.ty) * f;
      v.scale = Math.min(6, Math.max(0.2, v.scale * f));
      redraw();
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
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
