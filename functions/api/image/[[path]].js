// R2 读取代理，支持多段路径（如 /api/image/site-id/123-abc.jpg）
// 通过 Pages Functions 代理，避免 bucket 开 public
import { json, requireAuth } from "../../_shared.js";

function buildKey(params) {
  if (!params || params.path == null) return "";
  return Array.isArray(params.path) ? params.path.join("/") : String(params.path);
}

export async function onRequestGet({ params, env, request }) {
  if (!env.IMAGES) return new Response("no r2", { status: 500 });
  const key = buildKey(params);
  if (!key) return new Response("bad key", { status: 400 });

  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  // If-None-Match 支持，省重传
  const inm = request.headers.get("If-None-Match");
  if (inm && inm === obj.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
}

export async function onRequestDelete({ params, env, request }) {
  if (!(await requireAuth(request, env))) return json({ error: "unauthorized" }, { status: 401 });
  if (!env.IMAGES) return json({ error: "no r2" }, { status: 500 });
  const key = buildKey(params);
  if (!key) return json({ error: "bad key" }, { status: 400 });
  await env.IMAGES.delete(key);
  return json({ ok: true });
}
