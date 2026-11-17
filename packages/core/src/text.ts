/** Text helpers shared by the app, the API and the enricher. */

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words of a search query. A trailing space means the last word must match whole. */
export function queryWords(q: string): { words: string[]; lastIsWhole: boolean } {
  return { words: q.trim().toLowerCase().split(/\s+/).filter(Boolean), lastIsWhole: /\s$/.test(q) };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Orbit's search rule: a phrase anywhere at a word start, or every word at a word start.
 * "ace" finds "Ace Combat", not "Poker Face".
 */
export function matcher(q: string): (text: string) => boolean {
  const { words, lastIsWhole } = queryWords(q);
  if (!words.length) return () => true;
  const B = "(^|[^\\p{L}\\p{N}])",
    E = "(?=$|[^\\p{L}\\p{N}])";
  const phrase = new RegExp(B + words.map(esc).join("[^\\p{L}\\p{N}]+") + (lastIsWhole ? E : ""), "u");
  const each = words.map((w, i) => new RegExp(B + esc(w) + (i < words.length - 1 || lastIsWhole ? E : ""), "u"));
  return (text: string) => {
    const t = text.toLowerCase();
    return phrase.test(t) || each.every((r) => r.test(t));
  };
}

const deslug = (x: string): string => {
  try {
    x = decodeURIComponent(x);
  } catch {
    /* keep as is */
  }
  x = x
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/^\d+[-.]/, "")
    .replace(/[-_+.]+/g, " ")
    .trim();
  return x.replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase());
};

/** A readable name for any web address (so lists never show raw URLs). */
export function readableLink(url: string, given?: string): { label: string; host: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { label: given || url, host: "" };
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (given && given !== url && !/^https?:\/\//i.test(given)) return { label: given, host };
  const p = u.pathname.split("/").filter(Boolean);
  const pick = (): string => {
    if (/imdb\.com$/.test(host)) return p[0] === "title" ? "IMDb page" : "IMDb";
    if (/goodreads\.com$/.test(host))
      return p[1] === "show" && p[2] ? "Goodreads: " + deslug(p[2].replace(/^\d+[.-]/, "")) : "Goodreads";
    if (/wikipedia\.org$/.test(host)) return "Wikipedia: " + deslug(p[1] ?? "");
    if (/reddit\.com$/.test(host)) return "Reddit" + (p[1] ? " r/" + p[1] : "") + (p[4] ? ": " + deslug(p[4]) : "");
    if (/youtube\.com$|youtu\.be$/.test(host)) return "YouTube video";
    if (/icloud\.com$/.test(host)) return p[0] === "sharedalbum" ? "iCloud shared album" : "iCloud";
    if (/drive\.google\.com$|docs\.google\.com$/.test(host)) return "Google Drive file";
    if (/steampowered\.com$/.test(host)) return "Steam" + (p[2] ? ": " + deslug(p[2]) : "");
    if (host === "github.com") return "GitHub" + (p[0] ? ": " + p.slice(0, 2).join("/") : "");
    if (/openlibrary\.org$/.test(host)) return "Open Library";
    const last = deslug(p[p.length - 1] ?? "");
    return last.length > 2 && last.length < 80 ? last : host;
  };
  return { label: pick(), host };
}
