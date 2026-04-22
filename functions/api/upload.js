// 图片上传到 R2，key 带 {siteId}/ 前缀，实现共享 bucket 多站隔离
import { json, requireAuth, siteId } from "../_shared.js";

export async function onRequestPost({ request, env }) {
  if (!(await requireAuth(request, env))) return json({ error: "unauthorized" }, { status: 401 });
  if (!env.IMAGES) return json({ error: "R2 binding missing" }, { status: 500 });

  const form = await request.formData();
  const files = form.getAll("files");
  if (!files.length) return json({ error: "no files" }, { status: 400 });

  const sid = siteId(env);
  const base = (env.IMG_BASE_URL || "").replace(/\/+$/, "");

  // 按站配额拦截（MAX_IMAGES 未设则不限制）
  const max = Number(env.MAX_IMAGES || 0);
  if (max > 0) {
    let count = 0, cursor;
    do {
      const r = await env.IMAGES.list({ prefix: `${sid}/`, cursor });
      count += (r.objects || []).length;
      cursor = r.truncated ? r.cursor : null;
    } while (cursor);
    if (count + files.length > max) {
      return json({
        error: `已达配额 ${count}/${max}，本次想传 ${files.length} 张，超出 ${count + files.length - max} 张。请先删除旧图再上传`,
      }, { status: 413 });
    }
  }

  const out = [];
  for (const f of files) {
    if (!(f instanceof File)) continue;
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `${sid}/${Date.now()}-${rand}.${ext}`;
    await env.IMAGES.put(key, f.stream(), {
      httpMetadata: { contentType: f.type || "image/jpeg" },
    });
    const url = base ? `${base}/${key}` : `/api/image/${key}`;
    out.push({ key, url, name: f.name, size: f.size });
  }
  return json({ files: out });
}
