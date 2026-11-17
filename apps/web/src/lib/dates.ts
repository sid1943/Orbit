/** "Tuesday, November 17", as the top bar shows it. */
export const longDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** "Sat, Dec 5", with the year when it isn't this year. */
export const shortDate = (d: Date, now = new Date()) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
  (d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : "");
