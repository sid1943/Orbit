import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

const isTyping = (el: Element | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable;

/** Search under the greeting. `/` or Ctrl/Cmd+K focuses it; Enter opens the results page. The palette comes in step 2. */
export function SearchBar() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k === "k" && (e.metaKey || e.ctrlKey)) || (k === "/" && !isTyping(document.activeElement))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="search-wrap">
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
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
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything"
          autoComplete="off"
          aria-label="Search everything"
        />
        <kbd>/</kbd>
      </form>
    </div>
  );
}
