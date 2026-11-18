/** How Sid's lists are kept: the useful parts of the old Trello notes, as shown in Settings → Guide. */
export const GUIDE: readonly { title: string; lines: readonly string[] }[] = [
  {
    title: "Names",
    lines: [
      "Movies: Title (Year), e.g. Die Hard with a Vengeance (1995)",
      "TV shows: Title (Start year – End year), or Title (Start year – ) while it is still running",
      "Books: Book name - By Author",
      "City lists: City : Reddit Edition when the source is a Reddit thread, otherwise just the city name",
    ],
  },
  {
    title: "Movies, TV shows and books",
    lines: [
      "Each one links to its standard source: IMDb for movies and TV, Goodreads for books",
      "Notes hold a one-line synopsis",
      "TV shows move To watch → Running → Finished; seasons are a checklist",
      "Books are kept as Want to read, Recommendations, or Read by genre, author or series",
    ],
  },
  {
    title: "City lists",
    lines: [
      "One card per city or source, with the source link in its notes",
      "Checklists in this order: Outdoors & Views · Museums & Landmarks · Food · Neighborhoods & Hangouts · Sports",
      'Items are short and doable ("Hike to the summit"), most recommended first',
      "When you move away from a city, archive its list",
    ],
  },
  {
    title: "To do and done",
    lines: [
      "Things not done yet stay To do; mark them Done when they happen",
      'Big reference lists ("100 trips…", "500 Greatest Video Games") keep their source link in the notes',
      "Restaurant chains: one list per chain or per city",
      "Recipes are grouped as Food, Snacks or Dessert by region",
    ],
  },
  {
    title: "Always",
    lines: [
      "Never store passwords, ID numbers or account numbers in Orbit",
      "Archive rather than delete when something stops being relevant",
    ],
  },
];
