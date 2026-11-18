import { describe, expect, it } from "vitest";
import { fixLink, isCheckable, linkAnswer, nextLinkState, pastedLinks, probeLink, type Fetch } from "../src/index.js";

const NOW = 1_000_000;

describe("pastedLinks", () => {
  it("takes web addresses from Useful links and attachments, once each", () => {
    expect(
      pastedLinks({
        links: [
          { label: "Menu", url: "https://cafe.example/menu" },
          { label: "Mail", url: "mailto:a@b.example" },
        ],
        attachments: [
          { label: "Menu again", url: "https://cafe.example/menu" },
          { label: "Photo", url: "http://photos.example/1" },
        ],
      }),
    ).toEqual(["https://cafe.example/menu", "http://photos.example/1"]);
  });

  it("skips things that aren't checkable addresses", () => {
    expect(isCheckable("not a url")).toBe(false);
    expect(isCheckable("http://localhost:5173/x")).toBe(false);
    expect(fixLink({ d: "fix", url: "https://x.example" })).toBe("https://x.example");
    expect(fixLink({ d: "fix", text: "Some place" })).toBeNull();
    expect(fixLink({ d: "yes" })).toBeNull();
  });
});

describe("linkAnswer and nextLinkState", () => {
  it("reads HTTP statuses", () => {
    expect(linkAnswer(200)).toBe("ok");
    expect(linkAnswer(301)).toBe("ok");
    expect(linkAnswer(404)).toBe("gone");
    expect(linkAnswer(503)).toBe("gone");
    expect(linkAnswer(null)).toBe("gone");
    expect(linkAnswer(403)).toBe("blocked");
    expect(linkAnswer(429)).toBe("blocked");
  });

  it("calls a link dead only after three gone answers, a week apart", () => {
    const one = nextLinkState({ misses: 0 }, "gone", NOW);
    expect(one).toEqual({ state: "unsure", misses: 1, nextCheck: NOW + 7 * 86_400_000 });
    expect(nextLinkState({ misses: 2 }, "gone", NOW)).toEqual({ state: "dead", misses: 3, nextCheck: null });
    expect(nextLinkState({ misses: 2 }, "ok", NOW)).toEqual({
      state: "ok",
      misses: 0,
      nextCheck: NOW + 90 * 86_400_000,
    });
    expect(nextLinkState({ misses: 1 }, "blocked", NOW).state).toBe("blocked");
  });
});

describe("probeLink", () => {
  const answering =
    (head: number | Error, get = 200): Fetch =>
    async (_url, init) => {
      if (init?.method === "HEAD" && head instanceof Error) throw head;
      const status = init?.method === "HEAD" ? (head as number) : get;
      return { ok: status < 400, status, json: async () => null };
    };

  it("asks with HEAD, and with GET when HEAD isn't taken", async () => {
    expect(await probeLink(answering(200), "https://a.example")).toBe(200);
    expect(await probeLink(answering(404), "https://a.example")).toBe(404);
    expect(await probeLink(answering(405, 200), "https://a.example")).toBe(200);
    expect(await probeLink(answering(403, 404), "https://a.example")).toBe(404);
  });

  it("returns null when the site doesn't answer", async () => {
    expect(await probeLink(answering(new Error("dns")), "https://gone.example")).toBeNull();
  });
});
