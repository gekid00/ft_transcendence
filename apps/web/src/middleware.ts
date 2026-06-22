import { defineMiddleware } from "astro:middleware";

/**
 * Global middleware — runs once per request before any page render.
 *
 * Single responsibility: opt out of every layer of caching across all
 * browsers.
 *
 * The whole app is auth-aware (TopNav variant + per-page auth gates), so the
 * browser must always re-fetch on back/forward navigation. Without these
 * headers, bfcache restores rendered pages from memory and our SSR gates
 * never fire — a user who logged in could browser-back to / and see the
 * anonymous nav (Login / Sign up buttons) because that snapshot was
 * cached when they were anon.
 *
 * The header set:
 *   - Cache-Control: no-store, no-cache, must-revalidate, max-age=0
 *     no-store: don't write to any cache at all (this is what disables bfcache).
 *     no-cache: must revalidate before using any stored copy.
 *     must-revalidate: don't serve stale on network failure.
 *     max-age=0: belt-and-braces for proxies that ignore Cache-Control.
 *   - Pragma: no-cache — HTTP/1.0 fallback for old proxies.
 *   - Expires: 0 — also old-proxy fallback (date in the past).
 *
 * The redundancy is intentional. Different browsers have historically
 * honored different subsets (esp. Safari/WebKit's bfcache eviction).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
});
