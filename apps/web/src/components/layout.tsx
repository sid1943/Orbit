import { useCallback, useEffect, useRef, useState } from "react";
import { matchPath, useLocation, useNavigate, useRoutes, type Location, type RouteObject } from "react-router";
import { CardOverlay } from "./card-overlay.js";
import { isTyping } from "../lib/keys.js";
import { LocationPanelContext } from "../lib/location-panel.js";
import { ApiStatus } from "./api-status.js";
import { LocationDialog } from "./location-dialog.js";
import { NewItemDialog } from "./new-item-dialog.js";
import { Rail } from "./rail.js";
import { SearchBar } from "./search-bar.js";
import { TopBar } from "./top-bar.js";
import { useAppearance } from "./use-appearance.js";

/** What sits behind a card opened straight from its address (a bookmark, a reload): Today. */
const HOME: Location = { pathname: "/", search: "", hash: "", state: null, key: "home" };

/**
 * Rail on the left; greeting, search and the page on the right. On phones the rail slides in from the menu button.
 * A card (`/item/:id`) opens on top of the page you were on, as in Orbit today: the address changes, the page stays.
 */
export function Layout({ pages }: { pages: RouteObject[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const card = matchPath("/item/:id", location.pathname);
  // The last page that wasn't a card. Updated while rendering, so the page behind never flickers.
  const [behind, setBehind] = useState<Location>(() => (card ? HOME : location));
  if (!card && behind !== location) setBehind(location);
  const shown = card ? behind : location;
  const page = useRoutes(pages, shown);
  const { pathname } = shown;
  useAppearance();
  // A new page starts at the top; a card opening over it, or a filter changing in the address, doesn't move it.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);
  // The rail remembers the page it was opened on, so moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const railOpen = openOn === pathname;
  const [adding, setAdding] = useState(false);
  // The Location panel, opened from the greeting, Near you, Near me or Settings (with a note when there is one).
  const [locating, setLocating] = useState<{ note?: string } | null>(null);
  const openLocation = useCallback((note?: string) => setLocating({ note }), []);

  // N opens New item from anywhere, unless you're typing in a box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(document.activeElement)) {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <LocationPanelContext value={openLocation}>
      <div className="app">
        <Rail open={railOpen} inert={!!card} />
        {railOpen && <div className="rail-scrim" onClick={() => setOpenOn(null)} aria-hidden="true" />}
        <main className="main" inert={!!card}>
          <TopBar isHome={pathname === "/"} onMenu={() => setOpenOn(pathname)} onNew={() => setAdding(true)} />
          <SearchBar />
          <ApiStatus />
          <div className="scroll" ref={scroller}>
            {page}
          </div>
        </main>
        {card?.params.id && (
          <CardOverlay
            id={card.params.id}
            onClose={() => void navigate({ pathname: behind.pathname, search: behind.search, hash: behind.hash })}
          />
        )}
        {adding && <NewItemDialog onClose={() => setAdding(false)} />}
        {locating && <LocationDialog note={locating.note} onClose={() => setLocating(null)} />}
      </div>
    </LocationPanelContext>
  );
}
