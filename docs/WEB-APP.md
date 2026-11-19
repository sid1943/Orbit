# Web app plan (`apps/web`)

The web app replaces the first Orbit (a single page) and must match it before the switch.
This file lists every page, panel and setting it needs, and the choices already made.

## Stack

| Choice                                       | Why                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Vite + React + TypeScript                    | Fast builds; the same component ideas carry to the phone app (Expo) later |
| React Router                                 | One route per page, so Back and links work                                |
| TanStack Query                               | Caches API data, refetches in the background, works offline for reading   |
| Plain CSS with design tokens (CSS variables) | Themes, fonts and text size are just variables; no CSS framework to fight |
| `@orbit/core`                                | Search rule, link building, types: never re-implemented in the app        |
| Cloudflare Pages (free)                      | Hosts the built app next to the API                                       |
| vite-plugin-pwa                              | Installable on the phone home screen, reads offline                       |

Auth: still to decide. The app can send the API token (fine for one person), or Cloudflare Access
can put a sign-in (Google, email code) in front of both the app and the API (free for up to 50 users).

## Layout

- **Left rail**: the Orbit brand (goes home), views (Center Base), and Settings.
  Kinds are not listed in the rail; they are tiles on the home page.
- **Top bar, on every page**: greeting ("Good evening, Sid", from the profile name), date, location,
  and the New button. The page title sits in a strip under the search bar.
- **Back** always returns to Today (home). It is an absolute "home" button, not browser history.
- **Search bar** under the greeting opens the search palette in place, on top of the bar.

## Pages

| Page           | Route                | What's on it                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Center Base    | `/`                  | Greeting, date, location with "Use my location"; search; big kind tiles (each opens its kind page); a switch: Today / Coming up / In season / All cards / Near me / Map (/ Review). Today: To-do (add, tick off, grouped by quest) with In progress, Closest to finished and Recently changed inside it; Pick one today |
| Coming up      | `/?soon=1`           | Every open card with a next date (from "Preferable Time"), soonest first                                                                                                                                                                                                                                                |
| In season      | `/?season=1`         | Every open card that is good to do this month and has no exact day (those are Coming up), so the two never cross                                                                                                                                                                                                        |
| All cards      | `/?all=1`            | The "All cards" side of Today's switch: every card, with Filters (status, kind, topic, distance, when, archived, group, sort) in the address. `/all` redirects here                                                                                                                                                     |
| Kind page      | `/kind/:kind`        | One kind's cards, with the same Filters (no kind or group choice)                                                                                                                                                                                                                                                       |
| Search results | `/search?q=`         | Ranked, title matches first, using `matcher()` from core                                                                                                                                                                                                                                                                |
| Map            | `/?map=1`            | The fourth side of Center Base's switch: the 90 biggest topics as a network (drag, zoom; hover bounces a topic and opens a lens that spreads the names around it, click gathers its related topics, click again opens it), Big topics in a side panel, the Topics cloud under the map. `/map` redirects here            |
| Near me        | `/?near=1`           | The third side of Today's switch: places by distance, 5, 25, 100, 500 mi or Any; show done; category chips; exact places, then city groups. `/near` redirects here                                                                                                                                                      |
| Review links   | `/?review=1`         | A side of Center Base's switch, shown only while link guesses wait (`confidence: "review"`, unanswered): the list; answering (Correct, Wrong, Delete) comes with W5. `/review` redirects here                                                                                                                           |
| Topic          | `/topic/:name`       | Everything sharing one topic: kind chips, status bar, connected topics, item list                                                                                                                                                                                                                                       |
| Settings       | `/settings/:section` | Mac-style: categories on the left, settings on the right (see below)                                                                                                                                                                                                                                                    |
| App map        | `/settings/about`    | Index of every page and panel, generated from the route list                                                                                                                                                                                                                                                            |

### Where pages get their data

Every list page works from one cached list, `useSync()` (`GET /api/sync`): Today (and All cards), kind pages,
search, Topic and Map. Near you and Near me use `usePlaces()` (`GET /api/places`): every card and
checklist row linked to a place, sorted with `placesByDistance()` and joined to the sync list by `itemId`. Refreshes fetch only what changed. The card panel
uses `useFullItem(id)` (`GET /api/items/:id/full`): the card, every linked thing on its checklists, TV status,
covers and review answers, with no limit on list size. Review links and Fix links use
`GET /api/entities?confidence=review&pending=1` and `useReview()`. After editing a card, put it into the list
with `upsertSyncItem()` from core rather than refetching everything. The card panel is drawn by `Layout` over the
last page that wasn't a card (`components/card-overlay.tsx`): the router has one `*` route, and `Layout` renders the
pages itself with `useRoutes(pages, pageBehind)`. The card panel saves through `useEditCard(id)`,
which sends whole fields (the whole checklist list, say) worked out with the edit rules in `packages/core/src/card.ts`,
shows the change at once in the card and the lists, and goes back if saving fails.

Kinds come from `useKinds()` (`GET /api/kinds`): the standard kinds, then Sid's own, each with hue, order and
card count, shown even with no cards. Pass that list to `countByKind()`, `kindFromSlug()` and `kindHue()` from
core. `useAddKind()` adds one and updates the list at once; it refuses an empty or taken name before sending.
Client calls `updateKind`, `reorderKinds` and `deleteKind` are there for renaming, recolouring, reordering and
deleting (a Settings section later).

Today's sections are worked out in `apps/web/src/lib/today-sections.ts` with the rules in `packages/core/src/today.ts`
(the same as Orbit today). Near me through `apps/web/src/lib/near-me.ts` (`nearMe()`). The Location panel (`components/location-dialog.tsx`) is drawn by `Layout`; open it anywhere with `useOpenLocation()` from `lib/location-panel.ts`. Typed input is read with `readLocationInput()` from core `location.ts`. Coming up and In season read the card's "Preferable Time" detail.

## Panels and dialogs

| Panel          | Opens from                                                | What's in it                                                                                                                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card           | any item (`/item/:id` over the current page)              | Centered card, two columns. Header: kind, title, status, Archive and Delete. Main: Useful links (standard link first, then the card's links and attachments, all with readable names), Notes, Checklists (search, add, edit, move, delete rows), Comments. Side: topics, due date, details (props), when. On phones it fills the screen in one column. |
| New item       | N key or New                                              | Title with #topics, kind, status                                                                                                                                                                                                                                                                                                                       |
| Search palette | the search bar, Ctrl/Cmd + K                              | Jump to any card by name; "Search everything for …" at the bottom                                                                                                                                                                                                                                                                                      |
| Fix links      | "Fix links" on a card or review                           | Current links with Delete, alternatives, paste a link, "no link needed", reset                                                                                                                                                                                                                                                                         |
| Location       | the location in the greeting, Near you, Near me, Settings | Use my location, type a city, paste a Maps link or coordinates, pick a city, Clear; remembered once set                                                                                                                                                                                                                                                |

## Settings sections

| Section    | Settings                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Appearance | Theme (match device, light, dark); text size (Small 1, Medium 1.15, Large 1.3, Extra large 1.45); heading font; detail lines; text font |
| Profile    | Name used in the greeting                                                                                                               |
| Location   | Home location                                                                                                                           |
| Lists      | Show archived                                                                                                                           |
| Your data  | Download everything (backup)                                                                                                            |
| Guide      | How lists are kept                                                                                                                      |
| About      | Version and the app map                                                                                                                 |

Text fonts offered: IBM Plex Sans, System default, Inter, Atkinson Hyperlegible, Lexend, Source Sans 3,
Roboto, Open Sans, Lato, Work Sans, DM Sans, Manrope, Plus Jakarta Sans, Figtree, Outfit, Nunito Sans,
Literata, Source Serif 4. Heading fonts: Bricolage Grotesque, Same as text, Space Grotesk, Fraunces, Sora.
Fonts load from Google Fonts only when chosen. Settings are saved through `PUT /api/prefs/:key`.

## Design rules

- Kind tiles are always square, the same size, wrapping onto more rows; new kinds get the same tile.
- Text is generous: every size is `calc(N px * var(--fz))`, so the text-size setting scales everything.
- Links never show raw addresses; `readableLink()` names them.
- No "saved" messages; saving is silent, and errors are shown.
- Each kind has its own hue (To-do 8, Experience 200, Place 28, Movie 265, Show 300, Book 150, Game 330,
  Podcast 180, Recipe 45, Learning 225, Thing 90, Money 120, Note 210).
- Covers and TV status (new in the app): a cover on the card and in lists; for shows, "Season 3 out" or
  "Next episode Fri", from `/api/live`.
- Works at phone width with no sideways scrolling.

## Build order

1. Scaffold `apps/web` (Vite, React, Router, Query), connect to the API, the layout (rail, top bar).
2. Today (with All cards), kind pages and search.
3. The card panel, then New item.
4. Settings (appearance first) and the app map.
5. Review links and Fix links.
6. Near me and Location.
7. Map (topic network).
8. Covers, TV status, PWA, deploy to Cloudflare Pages.
