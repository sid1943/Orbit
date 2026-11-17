import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import { ApiStatus } from "./api-status.js";
import { Rail } from "./rail.js";
import { SearchBar } from "./search-bar.js";
import { TopBar } from "./top-bar.js";
import { useAppearance } from "./use-appearance.js";

/** Rail on the left; greeting, search and the page on the right. On phones the rail slides in from the menu button. */
export function Layout() {
  const { pathname } = useLocation();
  useAppearance();
  // The rail remembers the page it was opened on, so moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const railOpen = openOn === pathname;

  return (
    <div className="app">
      <Rail open={railOpen} />
      {railOpen && <div className="rail-scrim" onClick={() => setOpenOn(null)} aria-hidden="true" />}
      <main className="main">
        <TopBar isHome={pathname === "/"} onMenu={() => setOpenOn(pathname)} />
        <SearchBar />
        <ApiStatus />
        <div className="scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
