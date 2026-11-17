const TOKEN_KEY = "orbit.token";

/**
 * Where the API is and how to sign in to it. For now the token comes from `VITE_API_TOKEN`
 * (local development) or one saved in this browser; the sign-in method for the hosted app is still open.
 */
export function apiConfig(): { baseUrl: string; token: string } {
  let saved = "";
  try {
    saved = localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    // Storage can be unavailable (private mode); fall back to the env token.
  }
  return {
    baseUrl: import.meta.env.VITE_API_URL ?? "",
    token: saved || (import.meta.env.VITE_API_TOKEN ?? ""),
  };
}
