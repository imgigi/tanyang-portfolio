// GET: 返回 schema（KV > 仓库 schema.json > 空）
// PUT: 登录后可写，方便 AI 改 schema 直接推
import { json, readKV, writeKV, requireAuth, KEY_SCHEMA } from "../_shared.js";

const EMPTY_SCHEMA = {
  site: { title: "Untitled", siteId: "default" },
  sections: [],
};

async function loadRepoSchema(env) {
  // 读仓库里 public/schema.json 作为 fallback（首次部署时 KV 为空）
  try {
    const url = new URL("/schema.json", "https://example.com");
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const r = await env.ASSETS.fetch(url.toString());
      if (r.ok) return await r.json();
    }
  } catch {}
  return null;
}

export async function onRequestGet({ env }) {
  let s = await readKV(env, KEY_SCHEMA, null);
  if (!s) s = await loadRepoSchema(env);
  if (!s) s = EMPTY_SCHEMA;
  return json(s);
}

export async function onRequestPut({ request, env }) {
  if (!(await requireAuth(request, env))) return json({ error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, { status: 400 }); }
  if (!body || !Array.isArray(body.sections)) {
    return json({ error: "invalid schema" }, { status: 400 });
  }
  await writeKV(env, KEY_SCHEMA, body);
  return json({ ok: true });
}
