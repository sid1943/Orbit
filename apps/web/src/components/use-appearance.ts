import { useEffect } from "react";
import { usePrefs } from "../api/queries.js";
import { applyAppearance, rememberAppearance } from "../lib/appearance.js";

/** Keeps the page's theme, fonts and text size in step with the `appearance` setting. */
export function useAppearance(): void {
  const appearance = usePrefs().data?.appearance;
  useEffect(() => {
    if (!appearance) return;
    applyAppearance(appearance);
    rememberAppearance(globalThis.localStorage, appearance);
  }, [appearance]);
}
