/**
 * Gathers connections (series, sequels, based on, franchise) for every linked movie, show, book and
 * game in one go, instead of 50 per 10-minute cron run. Talks to the running API:
 *
 *   npm run connect -w @orbit/api
 *
 * Uses API_TOKEN from apps/api/.dev.vars and the API at http://localhost:8787 (set ORBIT_API to
 * change it). Stops when nothing is due. Safe to stop and run again: it carries on where it was.
 */
import { readFileSync } from "node:fs";

const api = process.env.ORBIT_API ?? "http://localhost:8787";
const token =
  process.env.API_TOKEN ??
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .match(/^API_TOKEN=(.*)$/m)?.[1]
    ?.trim();
if (!token) {
  console.error("No API_TOKEN: put it in apps/api/.dev.vars or the environment.");
  process.exit(1);
}

interface Progress {
  total: number;
  withQid: number;
  connected: number;
  noQid: number;
  due: number;
  relations: number;
  works: number;
  books: number;
  goodreads: number;
}
interface RunResult {
  mapped: number;
  goodreads: number;
  looked: number;
  connected: number;
  relations: number;
  works: number;
  failed: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One request to the API. When the API isn't answering (the Mac's updater restarts it after a merge),
 * waits and tries again for up to 5 minutes instead of stopping.
 */
async function call<T>(method: string, path: string): Promise<T> {
  for (let wait = 0; ; wait += 15) {
    try {
      const r = await fetch(`${api}/api/connections${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) return (await r.json()) as T;
      if (r.status < 500) throw new Error(`${method} ${path}: HTTP ${r.status}`);
    } catch (err) {
      if (!(err instanceof TypeError)) throw err; // fetch failed: the API is down or restarting
    }
    if (wait >= 300) throw new Error(`The API at ${api} hasn't answered for 5 minutes. Is Orbit running?`);
    console.log("The API isn't answering (restarting?); trying again in 15 seconds…");
    await sleep(15_000);
  }
}
const show = (p: Progress) =>
  `${p.connected}/${p.total} connected, ${p.withQid} with a Wikidata id, ${p.noQid} without, ` +
  `${p.relations} connections, ${p.works} things, ${p.goodreads}/${p.books} books with a Goodreads page`;

let failures = 0;
console.log(show(await call<Progress>("GET", "/progress")));
for (;;) {
  const r = await call<RunResult>("POST", "/run");
  if (r.failed) failures++;
  else failures = 0;
  if (failures >= 5) {
    console.error("Wikidata failed 5 times in a row; stopping. Run it again later to carry on.");
    process.exit(1);
  }
  const p = await call<Progress>("GET", "/progress");
  console.log(
    `+${r.mapped} ids, +${r.goodreads} Goodreads, +${r.connected} connected${r.failed ? `, ${r.failed} failed` : ""} · ${show(p)}`,
  );
  if (!r.looked && !r.connected && !r.failed) break;
  // Be gentle with Wikidata: a short pause, longer after a failure.
  await sleep(r.failed ? 30_000 : 2_000);
}
console.log("Done.");
