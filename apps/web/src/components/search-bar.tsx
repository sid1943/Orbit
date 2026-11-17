import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useItemSummaries } from "../api/queries.js";
import { isTyping } from "../lib/keys.js";
import { quickMatches } from "../lib/search.js";
import { KindChip } from "./kind-chip.js";

/**
 * Search under the greeting. `/` or Ctrl/Cmd+K focuses it. Typing opens the palette right on the bar:
 * cards whose title matches (arrows to move, Enter to open) and, last, "Search everything for …".
 */
export function SearchBar() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const [q, setQ] = useState(pathname === "/search" ? (params.get("q") ?? "") : "");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const items = useItemSummaries();

  const hits = useMemo(
    () =>
      open && items.data
        ? quickMatches(
            items.data.filter((i) => !i.archived),
            q,
          )
        : [],
    [open, items.data, q],
  );
  const showPalette = open && q.trim() !== "";
  const options = hits.length + 1; // the last option searches everything

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k === "k" && (e.metaKey || e.ctrlKey)) || (k === "/" && !isTyping(document.activeElement))) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    input.current?.blur();
  };
  const searchAll = () => {
    if (!q.trim()) return;
    close();
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  const openCard = (id: string) => {
    close();
    setQ("");
    navigate(`/item/${encodeURIComponent(id)}`);
  };
  const choose = (i: number) => {
    const hit = hits[i];
    if (hit) openCard(hit.id);
    else searchAll();
  };

  return (
    <div className="search-wrap">
      <form
        className={`search${showPalette ? " open" : ""}`}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (showPalette) choose(sel);
          else searchAll();
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" strokeWidth="2" aria-hidden="true">
          <circle cx="7" cy="7" r="5" />
          <path d="m11 11 3.5 3.5" />
        </svg>
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            else if (showPalette && e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => (s + 1) % options);
            } else if (showPalette && e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => (s - 1 + options) % options);
            }
          }}
          placeholder="Search everything"
          autoComplete="off"
          aria-label="Search everything"
          role="combobox"
          aria-expanded={showPalette}
          aria-controls="search-palette"
          aria-activedescendant={showPalette ? `pal-${sel}` : undefined}
        />
        {!q && <kbd>/</kbd>}
        {showPalette && (
          <div className="palette" id="search-palette" role="listbox" aria-label="Matching cards">
            {hits.map((h, i) => (
              <button
                key={h.id}
                id={`pal-${i}`}
                type="button"
                role="option"
                aria-selected={sel === i}
                className={sel === i ? "on" : undefined}
                onMouseEnter={() => setSel(i)}
                onClick={() => choose(i)}
              >
                <span className="tt">{h.title}</span>
                <KindChip kind={h.kind} />
              </button>
            ))}
            <button
              id={`pal-${hits.length}`}
              type="button"
              role="option"
              aria-selected={sel === hits.length}
              className={`all${sel === hits.length ? " on" : ""}`}
              onMouseEnter={() => setSel(hits.length)}
              onClick={searchAll}
            >
              Search everything for “{q.trim()}” <span className="k">Enter</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
