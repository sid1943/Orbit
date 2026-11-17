import { createContext, useContext } from "react";

/** Opens the Location panel, with an optional note at the top (why it opened, e.g. location was blocked). */
export type OpenLocation = (note?: string) => void;

export const LocationPanelContext = createContext<OpenLocation>(() => {});

/** The Location panel opens from the greeting, Near you, Near me and Settings; `Layout` draws it. */
export const useOpenLocation = (): OpenLocation => useContext(LocationPanelContext);
