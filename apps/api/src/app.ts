import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./env.js";
import { requireToken } from "./middleware/auth.js";
import { connections } from "./routes/connections.js";
import { enrich } from "./routes/enrich.js";
import { entities } from "./routes/entities.js";
import { items } from "./routes/items.js";
import { kinds } from "./routes/kinds.js";
import { live } from "./routes/live.js";
import { places } from "./routes/places.js";
import { prefs } from "./routes/prefs.js";
import { reviews } from "./routes/reviews.js";
import { sync } from "./routes/sync.js";

export const VERSION = "0.1.0";

export const app = new Hono<AppEnv>().basePath("/api");

app.use(
  "*",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, app: "orbit", version: VERSION }));

app.use("*", requireToken);
app.route("/sync", sync);
app.route("/items", items);
app.route("/places", places);
app.route("/kinds", kinds);
app.route("/entities", entities);
app.route("/live", live);
app.route("/reviews", reviews);
app.route("/prefs", prefs);
app.route("/enrich", enrich);
app.route("/connections", connections);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "server error" }, 500);
});
