import { createBrowserRouter, type RouteObject } from "react-router";
import { Layout } from "./components/layout.js";
import { NearMe } from "./pages/near-me.js";
import { EverythingRedirect, KindPage } from "./pages/kind.js";
import { NotFound } from "./pages/not-found.js";
import { Planned } from "./pages/planned.js";
import { Search } from "./pages/search.js";
import { Settings } from "./pages/settings.js";
import { Today } from "./pages/today.js";

/** Every page, in one list: the router uses it now, and Settings → About will show it as the app map. */
export const PAGES = [
  {
    path: "/",
    title: "Today",
    what: "Kind tiles; Today or All cards (every card with filters); Near you, Coming up, In season, In progress, To-do, Closest to finished, Pick one, Recently changed, Topics",
    element: <Today />,
  },
  {
    path: "/all",
    title: "All cards",
    what: "Old Everything address: opens Today's All cards view with its filters",
    element: <EverythingRedirect />,
  },
  { path: "/kind/:kind", title: "Kind", what: "One kind's cards, with the All cards filters", element: <KindPage /> },
  { path: "/search", title: "Search", what: "Ranked search results", element: <Search /> },
  // A card opens over the page behind it (Layout draws it), so the route has no page of its own.
  { path: "/item/:id", title: "Card", what: "One card, opened over the page you were on", element: null },
  {
    path: "/settings/:section?",
    title: "Settings",
    what: "Appearance, profile, location, lists, your data, guide, about",
    element: <Settings />,
  },
  {
    path: "/review",
    title: "Review links",
    what: "Link guesses waiting for an answer",
    element: <Planned title="Review links" step={5} />,
  },
  {
    path: "/near",
    title: "Near me",
    what: "Places on your lists by distance: 5, 25, 100, 500 mi or Any; Show done; category chips; city groups",
    element: <NearMe />,
  },
  { path: "/map", title: "Map", what: "Topics as a network", element: <Planned title="Map" step={7} /> },
  {
    path: "/topic/:name",
    title: "Topic",
    what: "Everything sharing one topic",
    element: <Planned title="Topic" step={7} />,
  },
] as const;

/** Panels and dialogs that open over a page, for the app map (Settings → About). */
export const PANELS = [
  { title: "Card", opens: "any item", what: "Useful links, notes, checklists, comments; details on the side" },
  { title: "New item", opens: "N or New", what: "Title with #topics, kind, status" },
  { title: "Search palette", opens: "the search bar, Ctrl/Cmd + K", what: "Jump to any card by name" },
  { title: "Fix links", opens: "a card or Review", what: "Current links, alternatives, paste a link" },
  {
    title: "Location",
    opens: "the location in the greeting",
    what: "Use my location, type a city, paste a Maps link, pick a city",
  },
] as const;

/** The pages Layout draws (a card's address draws the page behind it, with the card on top). */
const pageRoutes: RouteObject[] = [
  ...PAGES.map(({ path, element }) => ({ path, element })),
  { path: "*", element: <NotFound /> },
];

const routes: RouteObject[] = [{ path: "*", element: <Layout pages={pageRoutes} /> }];

export const router = createBrowserRouter(routes);
