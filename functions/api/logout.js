import { json, cookieHeader, shouldSecure } from "../_shared.js";

export async function onRequestPost({ request }) {
  const cookie = cookieHeader("session", "", { maxAge: 0, secure: shouldSecure(request) });
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
