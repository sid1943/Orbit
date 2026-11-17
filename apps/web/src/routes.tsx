import { createBrowserRouter, type RouteObject } from "react-router";
import { Layout } from "./components/layout.js";
import { KindPage } from "./pages/kind.js";
import { NotFound } from "./pages/not-found.js";
import { Planned } from "./pages/planned.js";
import { Today } from "./pages/today.js";

/** Every page, in one list: the router uses it now, and Settings → About will show it as the app map. */
export const PAGES = [
  { path: "/", title: "Today", what: "Greeting, kind tiles and today's sections", element: <Today /> },
  {
    path: "/all",
    title: "Everything",
    what: "Every card, filtered by status",
    element: <Planned title="Everything" step={2} />,
  },
  { path: "/kind/:kind", title: "Kind", what: "The Everything list for one kind", element: <KindPage /> },
  { path: "/search", title: "Search", what: "Ranked search results", element: <Planned title="Search" step={2} /> },
  { path: "/item/:id", title: "Card", what: "One card, opened", element: <Planned title="Card" step={3} /> },
  {
    path: "/settings/:section?",
    title: "Settings",
    what: "Appearance, profile, location, lists, your data",
    element: <Planned title="Settings" step={4} />,
  },
  {
    path: "/review",
    title: "Review links",
    what: "Link guesses waiting for an answer",
    element: <Planned title="Review links" step={5} />,
  },
  { path: "/near", title: "Near me", what: "Places by distance", element: <Planned title="Near me" step={6} /> },
  { path: "/map", title: "Map", what: "Topics as a network", element: <Planned title="Map" step={7} /> },
  {
    path: "/topic/:name",
    title: "Topic",
    what: "Everything sharing one topic",
    element: <Planned title="Topic" step={7} />,
  },
] as const;

const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      ...PAGES.map(({ path, element }) => (path === "/" ? { index: true, element } : { path, element })),
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
