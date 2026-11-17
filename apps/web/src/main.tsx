import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { createApiClient } from "./api/client.js";
import { ApiContext, createQueryClient } from "./api/queries.js";
import { applyAppearance, rememberedAppearance } from "./lib/appearance.js";
import { apiConfig } from "./lib/config.js";
import { router } from "./routes.js";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/pages.css";
import "./styles/settings.css";
import "./styles/card.css";

// Theme, fonts and size from last time, before the first paint; the saved setting takes over once it loads.
applyAppearance(rememberedAppearance(globalThis.localStorage));

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <ApiContext.Provider value={createApiClient(apiConfig())}>
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApiContext.Provider>
  </StrictMode>,
);
