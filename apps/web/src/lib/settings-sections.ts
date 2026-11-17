/** Settings categories, in the order of the left column (like macOS System Settings). */
export const SETTINGS_SECTIONS = [
  { id: "appearance", name: "Appearance", icon: "Aa", sub: "Theme, text size, fonts" },
  { id: "profile", name: "Profile", icon: "☺", sub: "Your name" },
  { id: "location", name: "Location", icon: "⌖", sub: "Where you are" },
  { id: "lists", name: "Lists", icon: "☰", sub: "Archived items" },
  { id: "data", name: "Your data", icon: "⇩", sub: "Backup" },
  { id: "guide", name: "Guide", icon: "✎", sub: "How lists are kept" },
  { id: "about", name: "About", icon: "ⓘ", sub: "Version and app map" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** The section for a URL segment; anything unknown opens Appearance. */
export function settingsSection(id: string | undefined): SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === id) ? (id as SettingsSectionId) : "appearance";
}
