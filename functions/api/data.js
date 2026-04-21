// 读写站点内容数据（KV key = "data"）
// 完全松散，schema 是约定，这里不强校验结构，避免 schema 变更时卡死
import { json, readKV, writeKV, requireAuth, KEY_DATA } from "../_shared.js";

async function loadRepoData(env) {
  try {
    const url = new URL("/data.initial.json", "https://example.com");
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const r = await env.ASSETS.fetch(url.toString());
      if (r.ok) return await r.json();
    }
  } catch {}
  return null;
}

export async function onRequestGet({ env }) {
  let data = await readKV(env, KEY_DATA, null);
  if (!data) data = await loadRepoData(env);
  if (!data) data = {};
  return json(data);
}

export async function onRequestPut({ request, env }) {
  if (!(await requireAuth(request, env))) return json({ error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, { status: 400 }); }
  if (!body || typeof body !== "object") {
    return json({ error: "invalid data" }, { status: 400 });
  }
  await writeKV(env, KEY_DATA, body);
  return json({ ok: true });
}
