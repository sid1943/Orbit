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

- **Left rail**: the Orbit brand (goes home), views (Today, Everything, Map, Near me, Review), and Settings.
  Kinds are not listed in the rail; they are tiles on the home page.
- **Top bar, on every page**: greeting ("Good evening, Sid", from the profile name), date, location,
  and the New button. The page title sits in a strip under the search bar.
- **Back** always returns to Today (home). It is an absolute "home" button, not browser history.
- **Search bar** under the greeting opens the search palette in place, on top of the bar.

## Pages

| Page           | Route                | What's on it                                                                                                                                                                                                                                                |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today (home)   | `/`                  | Greeting, date, location with "Use my location"; search; big kind tiles (each opens its kind page); Near you; Coming up; In season now; In progress; To-do (add, tick off, grouped by quest); Closest to finished; Pick one today; Recently changed; Topics |
| Everything     | `/all`               | Kind tiles; status filter (All, To do, Doing, Done, Dropped); group by flat, kind or status; rows with tags, progress, distance                                                                                                                             |
| Kind page      | `/kind/:kind`        | The Everything list for one kind                                                                                                                                                                                                                            |
| Search results | `/search?q=`         | Ranked, title matches first, using `matcher()` from core                                                                                                                                                                                                    |
| Map            | `/map`               | Topics drawn as a network (drag, zoom, click a topic), with Big topics in a side panel                                                                                                                                                                      |
| Near me        | `/near`              | Places by distance: 5, 25, 100, 500 mi or Any; show done; category chips; exact places, then city groups                                                                                                                                                    |
| Review links   | `/review`            | Link guesses waiting for an answer: category chips (hidden when 0), Correct, Wrong (asks what it is), Delete                                                                                                                                                |
| Topic          | `/topic/:name`       | Everything sharing one topic: kind chips, status bar, connected topics, item list                                                                                                                                                                           |
| Settings       | `/settings/:section` | Mac-style: categories on the left, settings on the right (see below)                                                                                                                                                                                        |
| App map        | `/settings/about`    | Index of every page and panel, generated from the route list                                                                                                                                                                                                |

### Where pages get their data

Every list page works from one cached list, `useSync()` (`GET /api/sync`): Today, Everything, kind pages,
search, Topic, Map and Near me (cards with coordinates). Refreshes fetch only what changed. The card panel
uses `useFullItem(id)` (`GET /api/items/:id/full`): the card, every linked thing on its checklists, TV status,
covers and review answers, with no limit on list size. Review links and Fix links use
`GET /api/entities?confidence=review&pending=1` and `useReview()`. After editing a card, put it into the list
with `upsertSyncItem()` from core rather than refetching everything.

Today's sections are worked out in `apps/web/src/lib/today-sections.ts` with the rules in `packages/core/src/today.ts`
(the same as Orbit today). Near you uses the coordinates of each card's own linked thing; places that only appear as
checklist rows come with Near me (build step 6). Coming up and In season read the card's "Preferable Time" detail.

## Panels and dialogs

| Panel          | Opens from                                   | What's in it                                                                                                                                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card           | any item (`/item/:id` over the current page) | Centered card, two columns. Header: kind, title, status, Archive and Delete. Main: Useful links (standard link first, then the card's links and attachments, all with readable names), Notes, Checklists (search, add, edit, move, delete rows), Comments. Side: topics, due date, details (props), when. On phones it fills the screen in one column. |
| New item       | N key or New                                 | Title with #topics, kind, status                                                                                                                                                                                                                                                                                                                       |
| Search palette | the search bar, Ctrl/Cmd + K                 | Jump to any card by name; "Search everything for …" at the bottom                                                                                                                                                                                                                                                                                      |
| Fix links      | "Fix links" on a card or review              | Current links with Delete, alternatives, paste a link, "no link needed", reset                                                                                                                                                                                                                                                                         |
| Location       | the location in the greeting                 | Use my location, type a city, paste a Maps link, pick a city; remembered once set                                                                                                                                                                                                                                                                      |

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
2. Today and Everything, with kind pages and search.
3. The card panel, then New item.
4. Settings (appearance first) and the app map.
5. Review links and Fix links.
6. Near me and Location.
7. Map (topic network).
8. Covers, TV status, PWA, deploy to Cloudflare Pages.
