import { describe, expect, it } from "vitest";
import { tmdbCollection, tmdbFind, tmdbMovie, usReleases, watchOnFrom, type Fetch } from "../src/index.js";

// Made-up answers in TMDB's shape.
const NOW = Date.parse("2026-11-17T12:00:00Z");
const answering =
  (routes: Record<string, unknown>): Fetch =>
  async (url, init) => {
    expect(init?.headers?.Authorization).toBe("Bearer tok");
    const hit = Object.entries(routes).find(([part]) => url.includes(part));
    return { ok: !!hit, status: hit ? 200 : 404, json: async () => hit?.[1] };
  };

describe("usReleases and watchOnFrom", () => {
  it("takes the first US date of each kind", () => {
    expect(
      usReleases([
        { iso_3166_1: "GB", release_dates: [{ type: 3, release_date: "2026-01-01T00:00:00.000Z" }] },
        {
          iso_3166_1: "US",
          release_dates: [
            { type: 1, release_date: "2026-09-01T00:00:00.000Z" },
            { type: 3, release_date: "2026-10-10T00:00:00.000Z" },
            { type: 3, release_date: "2027-03-01T00:00:00.000Z" },
            { type: 4, release_date: "2026-12-01T00:00:00.000Z" },
          ],
        },
      ]),
    ).toEqual({ theatrical: "2026-10-10", digital: "2026-12-01" });
  });

  it("lists US streaming, rent, buy and free offers by name", () => {
    expect(
      watchOnFrom({
        US: {
          link: "https://tmdb.example/watch",
          flatrate: [{ provider_name: "Stream Co" }],
          rent: [{ provider_name: "Rent Co" }, { provider_name: "Rent Co" }],
          ads: [{ provider_name: "Free Co" }],
        },
      }),
    ).toEqual({
      country: "US",
      stream: ["Stream Co"],
      rent: ["Rent Co"],
      buy: [],
      free: ["Free Co"],
      link: "https://tmdb.example/watch",
    });
    expect(watchOnFrom({ GB: { flatrate: [] } })).toBeUndefined();
  });
});

describe("tmdbFind, tmdbMovie, tmdbCollection", () => {
  const fetch = answering({
    "/find/tt0000001": { movie_results: [{ id: 11 }], tv_results: [] },
    "/movie/11?": {
      status: "Released",
      poster_path: "/p.jpg",
      belongs_to_collection: { id: 5 },
      release_dates: {
        results: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2026-11-01T00:00:00.000Z" }] }],
      },
      "watch/providers": { results: {} },
    },
    "/collection/5": {
      id: 5,
      name: "Harbor Collection",
      parts: [
        { id: 13, title: "Harbor Lights 3" },
        { id: 11, title: "Harbor Lights 2", release_date: "2026-11-01" },
        { id: 10, title: "Harbor Lights", release_date: "2020-05-01" },
      ],
    },
  });

  it("finds a movie by IMDb id", async () => {
    expect(await tmdbFind(fetch, "tok", "tt0000001")).toEqual({ movie: 11 });
  });

  it("reads releases, in theatres, and the collection id", async () => {
    const m = await tmdbMovie(fetch, "tok", 11, NOW);
    expect(m?.live).toMatchObject({ source: "tmdb", releaseDate: "2026-11-01", inTheatres: true });
    expect(m?.collectionId).toBe(5);
    expect(m?.posterUrl).toBe("https://image.tmdb.org/t/p/w342/p.jpg");
    expect(await tmdbMovie(fetch, "tok", 99, NOW)).toBeNull();
  });

  it("lists a collection's parts by release, announced ones last", async () => {
    expect((await tmdbCollection(fetch, "tok", 5))?.parts.map((p) => p.title)).toEqual([
      "Harbor Lights",
      "Harbor Lights 2",
      "Harbor Lights 3",
    ]);
  });
});
