// 共享工具：cookie 签名 / 校验 / KV 读写 / schema 读写
// schema 存在 KV 里（key = "schema"），data 存在 KV 里（key = "data"）
// 为什么不把 schema 放仓库：admin 要能动态拉最新 schema，方便 AI 改完直接推上去

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(sig);
}

export async function createSession(secret, days = 7) {
  const payload = { exp: Date.now() + days * 86400 * 1000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function verifySession(secret, token) {
  if (!token || !token.includes(".")) return false;
  const [body, sig] = token.split(".");
  const expected = await hmac(secret, body);
  if (sig !== expected) return false;
  try {
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    if (typeof payload.exp !== "number") return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function getCookie(request, name) {
  const h = request.headers.get("Cookie") || "";
  const parts = h.split(/;\s*/);
  for (const p of parts) {
    const [k, ...v] = p.split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function cookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  // Secure 默认根据请求协议推断；本地 http://localhost 跳过以便浏览器保留 cookie
  const secure = opts.secure !== false && opts.secure !== "auto-no";
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function shouldSecure(request) {
  try {
    const u = new URL(request.url);
    if (u.protocol === "https:") return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return "auto-no";
    return true;
  } catch { return true; }
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}

export const KEY_SCHEMA = "schema";
export const KEY_DATA = "data";

export async function readKV(env, key, fallback) {
  if (!env.DATA) return fallback;
  const raw = await env.DATA.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export async function writeKV(env, key, value) {
  if (!env.DATA) throw new Error("KV binding DATA missing");
  await env.DATA.put(key, JSON.stringify(value));
}

export async function requireAuth(request, env) {
  const token = getCookie(request, "session");
  const ok = await verifySession(env.SESSION_SECRET || "dev-secret", token);
  return ok;
}

export function siteId(env) {
  return env.SITE_ID || "default";
}
