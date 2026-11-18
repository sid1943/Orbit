import { describe, expect, it } from "vitest";
import { igdbGames, igdbLive, tokenUsable, twitchToken, type Fetch } from "../src/index.js";

// Made-up answers in IGDB's and Twitch's shape.
const NOW = Date.parse("2026-11-17T12:00:00Z");

describe("twitchToken and tokenUsable", () => {
  it("gets an app token and reuses it until a day before it ends", async () => {
    const fetch: Fetch = async (url, init) => {
      expect(init?.method).toBe("POST");
      expect(url).toContain("grant_type=client_credentials");
      return { ok: true, status: 200, json: async () => ({ access_token: "abc", expires_in: 5_000_000 }) };
    };
    const t = await twitchToken(fetch, "id", "secret", NOW);
    expect(t).toEqual({ token: "abc", expiresAt: NOW + 5_000_000_000 });
    expect(tokenUsable(t, NOW)).toBe(true);
    expect(tokenUsable(t, t.expiresAt - 3_600_000)).toBe(false);
    expect(tokenUsable(null, NOW)).toBe(false);
  });
});

describe("igdbLive and igdbGames", () => {
  it("reads development status, platforms and each platform's release", () => {
    expect(
      igdbLive(
        {
          slug: "harbor-lights",
          first_release_date: Date.parse("2027-03-01") / 1000,
          game_status: { status: "Early Access" },
          platforms: [{ name: "PC" }, { name: "Switch" }],
          release_dates: [
            { date: Date.parse("2027-03-01") / 1000, platform: { name: "Switch" } },
            { date: Date.parse("2026-06-01") / 1000, platform: { name: "PC" }, status: { name: "Early Access" } },
          ],
        },
        NOW,
      ),
    ).toEqual({
      source: "igdb",
      devStatus: "Early Access",
      releaseDate: "2027-03-01",
      platforms: ["PC", "Switch"],
      platformReleases: [
        { platform: "PC", date: "2026-06-01", status: "Early Access" },
        { platform: "Switch", date: "2027-03-01" },
      ],
      checkedAt: NOW,
    });
    expect(igdbLive({ first_release_date: Date.parse("2001-01-01") / 1000 }, NOW).devStatus).toBe("Released");
    expect(igdbLive({}, NOW).devStatus).toBe("In development");
  });

  it("asks once for many slugs with the app's headers", async () => {
    let body = "";
    const fetch: Fetch = async (_url, init) => {
      body = init?.body ?? "";
      expect(init?.headers).toMatchObject({ "Client-ID": "id", Authorization: "Bearer tok" });
      return { ok: true, status: 200, json: async () => [{ slug: "a-game" }] };
    };
    const r = await igdbGames(fetch, "id", "tok", ["a-game", "b-game", "bad slug"], NOW);
    expect(body).toContain('where slug = ("a-game","b-game")');
    expect([...r.keys()]).toEqual(["a-game"]);
  });
});
