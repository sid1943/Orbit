import { ApiError } from "../api/client.js";
import { useHealth, useItemSummaries } from "../api/queries.js";

/** Explains, in place, why nothing is showing: no API running, or a token it refuses. Silent when all is well. */
export function ApiStatus() {
  const health = useHealth();
  const items = useItemSummaries();
  const err = health.error ?? items.error;
  if (!err) return null;
  const status = err instanceof ApiError ? err.status : -1;
  return (
    <div className="api-status" role="alert">
      {status === 0 ? (
        <>
          Orbit's API isn't running. Start it with <code>npm run dev -w @orbit/api</code>.
        </>
      ) : status === 401 ? (
        <>
          The API refused the token. Set <code>VITE_API_TOKEN</code> in <code>apps/web/.env.local</code> to the{" "}
          <code>API_TOKEN</code> in <code>apps/api/.dev.vars</code>, then restart the web app.
        </>
      ) : (
        <>Something went wrong talking to the API: {err.message}</>
      )}
    </div>
  );
}
