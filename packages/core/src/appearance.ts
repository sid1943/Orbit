/**
 * Appearance settings: theme, text size, fonts and the style of detail lines.
 * The same choices as Orbit today, so its `UI` object carries over unchanged (see `appearanceFromUi`).
 */

export type Theme = "system" | "light" | "dark";
export type DetailStyle = "mono" | "text";

export interface AppearancePref {
  theme: Theme;
  /** Text-size multiplier; one of `TEXT_SIZES`. */
  size: number;
  /** Text font id; one of `TEXT_FONTS`. */
  font: string;
  /** Heading font id; one of `HEADING_FONTS`. */
  heads: string;
  /** Small grey detail lines: typewriter style or the text font. */
  detail: DetailStyle;
}

export interface FontChoice {
  id: string;
  name: string;
  /** One line on what the font is like. */
  note: string;
  /** CSS font-family list, or null for "same as text". */
  family: string | null;
  /** Google Fonts `family=` value, or null when the font is built in or already loaded. */
  google: string | null;
}

export const THEMES: readonly { id: Theme; name: string }[] = [
  { id: "system", name: "Match device" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

export const TEXT_SIZES: readonly { name: string; value: number }[] = [
  { name: "Small", value: 1 },
  { name: "Medium", value: 1.15 },
  { name: "Large", value: 1.3 },
  { name: "Extra large", value: 1.45 },
];

export const DETAIL_STYLES: readonly { id: DetailStyle; name: string }[] = [
  { id: "mono", name: "Typewriter style" },
  { id: "text", name: "Same font as text" },
];

const font = (id: string, name: string, note: string, family: string | null, google: string | null): FontChoice => ({
  id,
  name,
  note,
  family,
  google,
});

export const TEXT_FONTS: readonly FontChoice[] = [
  font("plex", "IBM Plex Sans", "Technical, crisp numbers (the original)", '"IBM Plex Sans"', null),
  font(
    "system",
    "System default",
    "Your device's own font: San Francisco on Apple, Segoe on Windows",
    'system-ui, -apple-system, "Segoe UI", Roboto',
    null,
  ),
  font("inter", "Inter", "Neutral and very clear on screens", '"Inter"', "Inter:wght@400;500;600;700"),
  font(
    "atkinson",
    "Atkinson Hyperlegible",
    "Designed for the easiest possible reading",
    '"Atkinson Hyperlegible"',
    "Atkinson+Hyperlegible:wght@400;700",
  ),
  font("lexend", "Lexend", "Wide letters, made to reduce reading strain", '"Lexend"', "Lexend:wght@400;500;600;700"),
  font(
    "source",
    "Source Sans 3",
    "Slightly narrow, fits more per line",
    '"Source Sans 3"',
    "Source+Sans+3:wght@400;500;600;700",
  ),
  font("roboto", "Roboto", "Android's familiar font", '"Roboto"', "Roboto:wght@400;500;700"),
  font(
    "opensans",
    "Open Sans",
    "Open and friendly, very common on the web",
    '"Open Sans"',
    "Open+Sans:wght@400;500;600;700",
  ),
  font("lato", "Lato", "Warm and balanced", '"Lato"', "Lato:wght@400;700"),
  font("worksans", "Work Sans", "Plain and sturdy", '"Work Sans"', "Work+Sans:wght@400;500;600;700"),
  font("dmsans", "DM Sans", "Compact geometric", '"DM Sans"', "DM+Sans:wght@400;500;600;700"),
  font("manrope", "Manrope", "Modern, slightly technical", '"Manrope"', "Manrope:wght@400;500;600;700"),
  font(
    "jakarta",
    "Plus Jakarta Sans",
    "Sleek and contemporary",
    '"Plus Jakarta Sans"',
    "Plus+Jakarta+Sans:wght@400;500;600;700",
  ),
  font("figtree", "Figtree", "Modern and friendly", '"Figtree"', "Figtree:wght@400;500;600;700"),
  font("outfit", "Outfit", "Round and airy", '"Outfit"', "Outfit:wght@400;500;600;700"),
  font("nunito", "Nunito Sans", "Soft and rounded", '"Nunito Sans"', "Nunito+Sans:wght@400;600;700"),
  font(
    "literata",
    "Literata",
    "Serif made for long reading, like a book",
    '"Literata"',
    "Literata:opsz,wght@7..72,400;7..72,600",
  ),
  font(
    "sourceserif",
    "Source Serif 4",
    "Classic serif, calm and elegant",
    '"Source Serif 4"',
    "Source+Serif+4:opsz,wght@8..60,400;8..60,600",
  ),
];

export const HEADING_FONTS: readonly FontChoice[] = [
  font("display", "Bricolage", "The original", '"Bricolage Grotesque"', null),
  font("text", "Same as text", "Headings in the text font", null, null),
  font("space", "Space Grotesk", "Geometric, a little quirky", '"Space Grotesk"', "Space+Grotesk:wght@500;700"),
  font(
    "fraunces",
    "Fraunces (serif)",
    "Soft serif with character",
    '"Fraunces"',
    "Fraunces:opsz,wght@9..144,600;9..144,700",
  ),
  font("sora", "Sora", "Wide and clean", '"Sora"', "Sora:wght@500;700"),
];

export const DEFAULT_APPEARANCE: AppearancePref = {
  theme: "system",
  size: 1.15,
  font: "plex",
  heads: "display",
  detail: "mono",
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/**
 * Reads an appearance value, keeping each valid field and using the default for the rest.
 * Accepts Orbit today's theme name "auto" as "system".
 */
export function parseAppearance(raw: unknown): AppearancePref {
  if (!isRecord(raw)) return { ...DEFAULT_APPEARANCE };
  const d = DEFAULT_APPEARANCE;
  return {
    theme:
      raw.theme === "auto"
        ? "system"
        : oneOf(
            raw.theme,
            THEMES.map((t) => t.id),
            d.theme,
          ),
    size: oneOf(
      raw.size,
      TEXT_SIZES.map((s) => s.value),
      d.size,
    ),
    font: oneOf(
      raw.font,
      TEXT_FONTS.map((f) => f.id),
      d.font,
    ),
    heads: oneOf(
      raw.heads,
      HEADING_FONTS.map((f) => f.id),
      d.heads,
    ),
    detail: oneOf(
      raw.detail,
      DETAIL_STYLES.map((s) => s.id),
      d.detail,
    ),
  };
}

export const textFont = (id: string): FontChoice => TEXT_FONTS.find((f) => f.id === id) ?? TEXT_FONTS[0]!;
export const headingFont = (id: string): FontChoice => HEADING_FONTS.find((f) => f.id === id) ?? HEADING_FONTS[0]!;

const FALLBACK_SANS = "ui-sans-serif, system-ui, sans-serif";
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

/** The CSS variables an appearance sets: `--fz`, `--body`, `--display`, `--mono`. */
export function appearanceVars(a: AppearancePref): Record<"--fz" | "--body" | "--display" | "--mono", string> {
  const body = `${textFont(a.font).family}, ${FALLBACK_SANS}`;
  const head = headingFont(a.heads).family;
  return {
    "--fz": String(a.size),
    "--body": body,
    "--display": head ? `${head}, ${FALLBACK_SANS}` : body,
    "--mono": a.detail === "mono" ? MONO : body,
  };
}

/** Google Fonts stylesheet address for one font, or null when nothing has to load. */
export function fontStylesheet(f: FontChoice): string | null {
  return f.google ? `https://fonts.googleapis.com/css2?family=${f.google}&display=swap` : null;
}
