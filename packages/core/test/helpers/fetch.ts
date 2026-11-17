import type { Fetch } from "../../src/index.js";

/** A fetch that answers from canned JSON, chosen by a piece of the URL. */
export function cannedFetch(routes: [urlPart: string, body: unknown][]): Fetch {
  return async (url) => {
    const hit = routes.find(([part]) => url.includes(part));
    return { ok: !!hit, status: hit ? 200 : 404, json: async () => hit?.[1] };
  };
}

/** A fetch that fails the test if it is ever called. */
export const noFetch: Fetch = async (url) => {
  throw new Error(`Unexpected request: ${url}`);
};
