import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env.js";

/** Compares two secrets in constant time (hashing first so lengths don't leak). */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i]! ^ v[i]!;
  return diff === 0;
}

/** Requires `Authorization: Bearer <API_TOKEN>`. Refuses everything if no token is configured. */
export const requireToken: MiddlewareHandler<AppEnv> = async (c, next) => {
  const want = c.env.API_TOKEN;
  const got = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!want || !(await sameSecret(got, want))) return c.json({ error: "unauthorized" }, 401);
  await next();
};
