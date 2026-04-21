// Schema-driven admin — 不随站点改动，所有差异由 schema.json + data 驱动
const root = document.getElementById("admin-root");

let schema = null;
let data = null;
let siteInfo = { siteId: "" };
let dirty = false;

/* ---------- utils ---------- */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function toast(msg, isErr) {
  let el = document.querySelector(".status");
  if (!el) { el = document.createElement("div"); el.className = "status"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle("err", !!isErr);
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function setDirty(v = true) {
  dirty = v;
  const btn = document.querySelector("[data-save]");
  if (btn) btn.textContent = v ? "保存修改 •" : "已保存";
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: "same-origin",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || r.statusText);
  }
  return r.json();
}

// path 是数组，如 ["projects", 2, "title"]
function getByPath(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}
function setByPath(obj, path, value) {
  if (!path.length) return;
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i], nk = path[i + 1];
    if (cur[k] == null || typeof cur[k] !== "object") {
      cur[k] = typeof nk === "number" ? [] : {};
    }
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}
function ensurePath(obj, path, fallback) {
  let cur = obj;
  for (let i = 0; i < path.length; i++) {
    const k = path[i];
    const last = i === path.length - 1;
    if (last) {
      if (cur[k] == null) cur[k] = fallback;
      return cur[k];
    }
    if (cur[k] == null) cur[k] = typeof path[i + 1] === "number" ? [] : {};
    cur = cur[k];
  }
  return cur;
}

/* ---------- Video helpers ---------- */

// 把用户粘贴的各种东西统一转成 iframe src
// 支持：1) 完整 iframe 代码 2) player URL 3) bilibili BVxxx 4) YouTube URL/ID
export function resolveVideoSrc(input) {
  if (!input) return "";
  const s = String(input).trim();

  // iframe 代码 → 抽 src
  const ifMatch = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (ifMatch) return ifMatch[1];

  // YouTube watch
  const yt = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  // bilibili BV 号（裸 ID 或 URL）
  const bv = s.match(/BV[A-Za-z0-9]{10}/);
  if (bv) {
    // 如果 s 里已经有 aid / cid 就用完整 URL，否则只给 bvid（会播默认 p1）
    if (/aid=\d+/.test(s) && /cid=\d+/.test(s)) {
      const aid = s.match(/aid=(\d+)/)[1];
      const cid = s.match(/cid=(\d+)/)[1];
      return `https://player.bilibili.com/player.html?isOutside=true&aid=${aid}&bvid=${bv[0]}&cid=${cid}&p=1`;
    }
    return `https://player.bilibili.com/player.html?isOutside=true&bvid=${bv[0]}&high_quality=1&autoplay=0`;
  }

  // 已经是 URL
  if (/^https?:\/\//.test(s) || s.startsWith("//")) return s;

  return "";
}

/* ---------- Login ---------- */

async function checkAuth() {
  try {
    const j = await fetch("/api/me").then(r => r.json());
    siteInfo = { siteId: j.siteId || "" };
    return !!j.authed;
  } catch { return false; }
}

function renderLogin(errMsg = "") {
  root.innerHTML = `
    <div class="login">
      <form class="login__box" id="login-form">
        <h1>后台登录</h1>
        <input type="password" name="password" placeholder="密码" autofocus required />
        <button type="submit" class="btn btn--primary">登录</button>
        <div class="login__err">${esc(errMsg)}</div>
      </form>
    </div>`;
  document.getElementById("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const pw = e.target.password.value;
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password: pw }) });
      boot();
    } catch {
      renderLogin("密码错误");
    }
  });
}

/* ---------- Boot ---------- */

async function boot() {
  if (!(await checkAuth())) return renderLogin();
  const [s, d] = await Promise.all([
    fetch("/api/schema", { cache: "no-store" }).then(r => r.json()),
    fetch("/api/data", { cache: "no-store" }).then(r => r.json()),
  ]);
  schema = s;
  data = d || {};
  renderAdmin();
}

/* ---------- Main layout ---------- */

function renderAdmin() {
  const title = (schema.site && schema.site.title) || "Untitled";
  root.innerHTML = `
    <div class="topbar">
      <h1>${esc(title)} · 后台 <span class="sid">[${esc(siteInfo.siteId)}]</span></h1>
      <div class="topbar__actions">
        <a href="/" target="_blank" class="btn">查看网站 ↗</a>
        <button class="btn btn--primary" data-save>已保存</button>
        <button class="btn" data-logout>退出</button>
      </div>
    </div>
    <div class="main" id="sections"></div>`;

  root.querySelector("[data-save]").addEventListener("click", save);
  root.querySelector("[data-logout]").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    renderLogin();
  });

  const container = document.getElementById("sections");
  const sections = Array.isArray(schema.sections) ? schema.sections : [];
  for (const sec of sections) {
    container.appendChild(renderSection(sec));
  }
  setDirty(false);
}

function renderSection(sec) {
  const el = document.createElement("div");
  el.className = "section";
  el.innerHTML = `
    <div class="section__head">
      <strong>${esc(sec.label || sec.id)}</strong>
      <span class="meta">${esc(sec.type)} · ${esc(sec.id)}</span>
    </div>
    <div class="section__body"></div>`;
  const body = el.querySelector(".section__body");
  const path = [sec.id];

  if (sec.type === "group") {
    ensurePath(data, path, {});
    renderGroupFields(body, sec.fields || [], path);
  } else if (sec.type === "list") {
    ensurePath(data, path, []);
    renderList(body, sec, path);
  } else {
    body.textContent = `(不支持的顶层类型: ${sec.type})`;
  }
  return el;
}

/* ---------- Group ---------- */

function renderGroupFields(container, fields, basePath) {
  for (const f of fields) {
    container.appendChild(renderField(f, [...basePath, f.id]));
  }
}

/* ---------- Field dispatcher ---------- */

function renderField(field, path) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `<label class="field__label">${esc(field.label || field.id)}</label>`;
  const body = document.createElement("div");
  wrap.appendChild(body);

  const t = field.type;
  if (t === "text" || t === "url")    renderInput(body, field, path, "text");
  else if (t === "number")            renderInput(body, field, path, "number");
  else if (t === "textarea")          renderTextarea(body, field, path);
  else if (t === "richtext")          renderTextarea(body, field, path, true);
  else if (t === "select")            renderSelect(body, field, path);
  else if (t === "image")             renderImage(body, field, path);
  else if (t === "gallery")           renderGallery(body, field, path);
  else if (t === "video")             renderVideo(body, field, path);
  else if (t === "group") {
    // 嵌套 group
    ensurePath(data, path, {});
    renderGroupFields(body, field.fields || [], path);
  }
  else if (t === "list") {
    ensurePath(data, path, []);
    renderList(body, field, path);
  }
  else {
    body.textContent = `(未知字段类型: ${t})`;
  }

  if (field.help) {
    const h = document.createElement("div");
    h.className = "field__help";
    h.textContent = field.help;
    wrap.appendChild(h);
  }
  return wrap;
}

/* ---------- Leaf fields ---------- */

function renderInput(container, field, path, type) {
  const val = getByPath(data, path) ?? "";
  const input = document.createElement("input");
  input.type = type;
  input.value = val;
  if (field.placeholder) input.placeholder = field.placeholder;
  input.addEventListener("input", e => {
    const v = type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value;
    setByPath(data, path, v);
    setDirty();
  });
  container.appendChild(input);
}

function renderTextarea(container, field, path, rich = false) {
  const val = getByPath(data, path) ?? "";
  const ta = document.createElement("textarea");
  ta.value = val;
  if (field.rows) ta.rows = field.rows;
  if (field.placeholder) ta.placeholder = field.placeholder;
  ta.addEventListener("input", e => {
    setByPath(data, path, e.target.value);
    setDirty();
  });
  container.appendChild(ta);
  if (rich) {
    const hint = document.createElement("div");
    hint.className = "field__help";
    hint.textContent = "支持 HTML 片段：<p> <br> <strong> <em> <a>";
    container.appendChild(hint);
  }
}

function renderSelect(container, field, path) {
  const val = getByPath(data, path) ?? "";
  const sel = document.createElement("select");
  const opts = Array.isArray(field.options) ? field.options : [];
  sel.innerHTML = `<option value="">--</option>` +
    opts.map(o => `<option value="${esc(o.value ?? o)}" ${String(val) === String(o.value ?? o) ? "selected" : ""}>${esc(o.label ?? o)}</option>`).join("");
  sel.addEventListener("change", e => {
    setByPath(data, path, e.target.value);
    setDirty();
  });
  container.appendChild(sel);
}

/* ---------- Image ---------- */

function renderImage(container, field, path) {
  const cur = getByPath(data, path);
  const box = document.createElement("div");
  box.className = "img-box";

  function draw() {
    const v = getByPath(data, path);
    box.innerHTML = "";
    if (v && v.url) {
      const prev = document.createElement("div");
      prev.className = "img-box__preview";
      prev.innerHTML = `<img src="${esc(v.url)}" alt=""><button class="rm" title="移除">×</button>`;
      prev.querySelector(".rm").addEventListener("click", () => {
        if (v.key) deleteR2(v.key).catch(() => {});
        setByPath(data, path, null);
        setDirty();
        draw();
      });
      box.appendChild(prev);
    }
    const actions = document.createElement("div");
    actions.className = "img-box__actions";
    actions.innerHTML = `<input type="file" accept="image/*" /><button class="btn btn--sm" data-up>上传</button>`;
    const fileInput = actions.querySelector("input");
    actions.querySelector("[data-up]").addEventListener("click", async () => {
      if (!fileInput.files.length) return toast("先选图", true);
      try {
        const [up] = await uploadFiles([fileInput.files[0]]);
        const old = getByPath(data, path);
        if (old && old.key) deleteR2(old.key).catch(() => {});
        setByPath(data, path, { key: up.key, url: up.url, name: up.name });
        setDirty();
        draw();
        toast("已上传");
      } catch (e) { toast("上传失败: " + e.message, true); }
    });
    box.appendChild(actions);
  }
  draw();
  container.appendChild(box);
}

/* ---------- Gallery ---------- */

function renderGallery(container, field, path) {
  ensurePath(data, path, []);
  const box = document.createElement("div");
  box.className = "img-box";

  function draw() {
    const arr = getByPath(data, path) || [];
    box.innerHTML = `<div class="gallery-grid"></div>`;
    const grid = box.querySelector(".gallery-grid");
    arr.forEach((it, idx) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="img-box__preview" draggable="true" data-idx="${idx}">
          <img src="${esc(it.url || "")}" alt="">
          <button class="rm" title="移除">×</button>
        </div>
        ${field.caption === false ? "" : `<input class="img-caption" value="${esc(it.caption || "")}" placeholder="caption">`}`;
      const prev = wrap.querySelector(".img-box__preview");
      prev.querySelector(".rm").addEventListener("click", () => {
        if (it.key) deleteR2(it.key).catch(() => {});
        arr.splice(idx, 1);
        setDirty();
        draw();
      });
      if (field.caption !== false) {
        wrap.querySelector(".img-caption").addEventListener("input", e => {
          it.caption = e.target.value;
          setDirty();
        });
      }
      grid.appendChild(wrap);
    });
    wireDnd(grid, ".img-box__preview", (from, to) => {
      const a = arr.splice(from, 1)[0];
      arr.splice(to, 0, a);
      setDirty();
      draw();
    });

    const actions = document.createElement("div");
    actions.className = "img-box__actions";
    const showPaste = field.caption !== false;
    actions.innerHTML = `<input type="file" multiple accept="image/*" /><button class="btn btn--sm btn--primary" data-up>批量上传</button>${showPaste ? `<button class="btn btn--sm" data-paste-titles>粘贴多行标题</button>` : ""}`;
    const fi = actions.querySelector("input");
    actions.querySelector("[data-up]").addEventListener("click", async () => {
      if (!fi.files.length) return toast("先选图", true);
      try {
        const ups = await uploadFiles(fi.files);
        for (const u of ups) arr.push({ key: u.key, url: u.url, name: u.name, caption: "" });
        setDirty();
        draw();
        toast(`已上传 ${ups.length} 张`);
      } catch (e) { toast("上传失败: " + e.message, true); }
    });
    if (showPaste) {
      actions.querySelector("[data-paste-titles]").addEventListener("click", () => {
        if (!arr.length) return toast("请先上传图片", true);
        openPasteTitlesDialog(arr, draw);
      });
    }
    box.appendChild(actions);
  }
  draw();
  container.appendChild(box);
}

/* ---------- Paste Titles Dialog ---------- */

function openPasteTitlesDialog(arr, onDone) {
  const dlg = document.createElement("div");
  dlg.className = "paste-dlg";
  dlg.innerHTML = `
    <div class="paste-dlg__box">
      <div class="paste-dlg__head">
        <strong>粘贴多行标题</strong>
        <span class="paste-dlg__hint">一行 = 一张图的标题，按顺序对应当前 ${arr.length} 张图。空行 = 保持空标题。</span>
      </div>
      <textarea rows="12" placeholder="标题 1&#10;标题 2&#10;标题 3 …"></textarea>
      <div class="paste-dlg__actions">
        <label class="paste-dlg__opt"><input type="checkbox" data-only-empty> 只填充空标题</label>
        <button class="btn" data-cancel>取消</button>
        <button class="btn btn--primary" data-apply>应用</button>
      </div>
    </div>`;
  const ta = dlg.querySelector("textarea");
  const prefill = arr.map(x => x.caption || "").join("\n");
  ta.value = prefill;
  setTimeout(() => ta.focus(), 30);

  const close = () => dlg.remove();
  dlg.querySelector("[data-cancel]").addEventListener("click", close);
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
  dlg.querySelector("[data-apply]").addEventListener("click", () => {
    const onlyEmpty = dlg.querySelector("[data-only-empty]").checked;
    const lines = ta.value.split("\n");
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const line = (lines[i] ?? "").trim();
      if (onlyEmpty && (arr[i].caption || "").trim()) continue;
      if (arr[i].caption !== line) {
        arr[i].caption = line;
        n++;
      }
    }
    if (n > 0) setDirty();
    close();
    onDone();
    toast(`已更新 ${n} 个标题`);
  });
  document.body.appendChild(dlg);
}

/* ---------- Video ---------- */

function renderVideo(container, field, path) {
  const box = document.createElement("div");
  box.className = "video-field";
  const cur = getByPath(data, path) || "";
  const ta = document.createElement("textarea");
  ta.value = cur;
  ta.placeholder = "粘贴 B站 iframe / BV号 / YouTube URL 都可以";
  const preview = document.createElement("div");
  preview.className = "video-preview";

  function drawPreview() {
    const v = getByPath(data, path) || "";
    const src = resolveVideoSrc(v);
    if (src) {
      preview.innerHTML = `<iframe src="${esc(src)}" allowfullscreen scrolling="no" frameborder="0"></iframe>`;
    } else {
      preview.innerHTML = `<div class="video-preview__empty">（未填写 / 解析失败）</div>`;
    }
  }
  ta.addEventListener("input", e => {
    setByPath(data, path, e.target.value);
    setDirty();
    drawPreview();
  });
  box.appendChild(ta);
  box.appendChild(preview);
  drawPreview();
  container.appendChild(box);
}

/* ---------- List ---------- */

function renderList(container, field, path) {
  const arr = ensurePath(data, path, []);
  const wrap = document.createElement("div");
  wrap.className = "list-wrap";
  wrap.innerHTML = `<div class="list-items"></div>
    <div class="list-add"><button class="btn btn--sm">+ 新增 ${esc(field.itemLabel || "项")}</button></div>`;
  const items = wrap.querySelector(".list-items");

  wrap.querySelector(".list-add button").addEventListener("click", () => {
    arr.push(makeEmptyItem(field.fields || []));
    setDirty();
    draw();
  });

  function titleOf(item, idx) {
    // 优先用 schema.itemTitle（字段 id），没有就挑第一个 text 字段，最后用 #idx
    if (field.itemTitle && item && item[field.itemTitle]) return item[field.itemTitle];
    const firstText = (field.fields || []).find(f => ["text","textarea"].includes(f.type));
    if (firstText && item && item[firstText.id]) return item[firstText.id];
    return `${field.itemLabel || "项"} #${idx + 1}`;
  }

  function draw() {
    items.innerHTML = "";
    arr.forEach((item, idx) => {
      const itEl = document.createElement("div");
      itEl.className = "list-item collapsed";
      itEl.dataset.idx = idx;
      itEl.draggable = true;
      itEl.innerHTML = `
        <div class="list-item__head">
          <span class="handle">⋮⋮</span>
          <span class="title">${esc(titleOf(item, idx))}</span>
          <button class="btn btn--sm" data-toggle>展开</button>
          <button class="btn btn--sm btn--danger" data-del>删</button>
        </div>
        <div class="list-item__body"></div>`;
      const body = itEl.querySelector(".list-item__body");
      renderGroupFields(body, field.fields || [], [...path, idx]);

      itEl.querySelector("[data-toggle]").addEventListener("click", e => {
        const collapsed = itEl.classList.toggle("collapsed");
        e.target.textContent = collapsed ? "展开" : "收起";
      });
      itEl.querySelector("[data-del]").addEventListener("click", () => {
        if (!confirm(`删除此项？`)) return;
        // 清理图片 R2
        collectImageKeys(item).forEach(k => deleteR2(k).catch(() => {}));
        arr.splice(idx, 1);
        setDirty();
        draw();
      });
      items.appendChild(itEl);
    });

    wireDnd(items, ".list-item", (from, to) => {
      const a = arr.splice(from, 1)[0];
      arr.splice(to, 0, a);
      setDirty();
      draw();
    });
  }
  draw();
  container.appendChild(wrap);
}

function makeEmptyItem(fields) {
  const o = {};
  for (const f of fields) {
    if (f.type === "list" || f.type === "gallery") o[f.id] = [];
    else if (f.type === "group") o[f.id] = makeEmptyItem(f.fields || []);
    else if (f.type === "image") o[f.id] = null;
    else if (f.type === "number") o[f.id] = 0;
    else o[f.id] = "";
  }
  return o;
}

function collectImageKeys(obj, out = []) {
  if (!obj || typeof obj !== "object") return out;
  if (obj.key && obj.url && typeof obj.key === "string") out.push(obj.key);
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) v.forEach(x => collectImageKeys(x, out));
    else if (v && typeof v === "object") collectImageKeys(v, out);
  }
  return out;
}

/* ---------- Upload / Delete ---------- */

async function uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await fetch("/api/upload", { method: "POST", body: fd, credentials: "same-origin" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "upload failed");
  const j = await r.json();
  return j.files || [];
}

async function deleteR2(key) {
  try {
    await fetch(`/api/image/${key}`, { method: "DELETE", credentials: "same-origin" });
  } catch {}
}

/* ---------- Generic DnD ---------- */

function wireDnd(container, selector, onMove) {
  let from = null;
  container.querySelectorAll(selector).forEach(el => {
    el.addEventListener("dragstart", e => {
      from = Number(el.dataset.idx);
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      container.querySelectorAll(selector).forEach(x => x.classList.remove("drop-above","drop-below","drop-before"));
    });
    el.addEventListener("dragover", e => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const horizontal = rect.width > rect.height;
      if (horizontal && container.classList.contains("list-items")) {
        // 垂直列表
        const below = e.clientY > rect.top + rect.height / 2;
        el.classList.toggle("drop-below", below);
        el.classList.toggle("drop-above", !below);
      } else {
        el.classList.add("drop-before");
      }
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-above","drop-below","drop-before"));
    el.addEventListener("drop", e => {
      e.preventDefault();
      e.stopPropagation();
      const to = Number(el.dataset.idx);
      if (from == null || from === to) return;
      let insertAt = to;
      const rect = el.getBoundingClientRect();
      if (container.classList.contains("list-items")) {
        const below = e.clientY > rect.top + rect.height / 2;
        insertAt = to + (below ? 1 : 0);
      }
      if (from < insertAt) insertAt--;
      onMove(from, insertAt);
      from = null;
    });
  });
}

/* ---------- Save ---------- */

async function save() {
  try {
    await api("/api/data", { method: "PUT", body: JSON.stringify(data) });
    setDirty(false);
    toast("已保存");
  } catch (e) {
    toast("保存失败: " + e.message, true);
  }
}

window.addEventListener("beforeunload", e => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});

boot();
