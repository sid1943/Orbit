/** "Tuesday, November 17", as the top bar shows it. */
export const longDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
