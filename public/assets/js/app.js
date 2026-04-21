// 太阳的阳 — 摄影作品集
// 路由：#/ (overview) / #/project/:idx / #/about
const app = document.getElementById("app");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

const SVG_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;
const SVG_PREV  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><polyline points="14 5 7 12 14 19"/></svg>`;
const SVG_NEXT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><polyline points="10 5 17 12 10 19"/></svg>`;

let SCHEMA = null;
let DATA = null;

async function boot() {
  const [s, d] = await Promise.all([
    fetch("/api/schema", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
    fetch("/api/data",   { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
  ]);
  SCHEMA = s || {};
  DATA = d || {};
  document.title = (DATA.header && DATA.header.siteName) || "太阳的阳";
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}

/* ---------- Route ---------- */

function currentRoute() {
  const raw = (location.hash || "").replace(/^#\/?/, "");
  if (!raw) return { name: "overview" };
  if (raw === "about") return { name: "about" };
  const m = raw.match(/^project\/(\d+)$/);
  if (m) return { name: "project", idx: Number(m[1]) };
  return { name: "overview" };
}

function projects() {
  return Array.isArray(DATA.projects) ? DATA.projects : [];
}

function renderRoute() {
  const r = currentRoute();
  const sidebar = renderSidebar(r);
  let main = "";
  if (r.name === "overview") main = viewOverview();
  else if (r.name === "project") main = viewProject(r.idx);
  else if (r.name === "about") main = viewAbout();

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">${sidebar}</aside>
      <section class="content">${main}</section>
    </div>
    ${renderFooter()}
  `;

  // 入场动画 stagger
  const items = app.querySelectorAll(".gallery__item, .about__block");
  items.forEach((el, i) => {
    el.style.animationDelay = `${Math.min(i, 20) * 40}ms`;
  });

  initLightboxTargets();
  window.scrollTo(0, 0);
}

/* ---------- Sidebar ---------- */

function renderSidebar(r) {
  const brand = (DATA.header && DATA.header.siteName) || "太阳的阳";
  const projList = projects();
  const isProj = r.name === "project";

  const projLinks = projList.map((p, i) => {
    const cls = "nav__sub" + (isProj && r.idx === i ? " is-active" : "");
    const name = p && p.name ? p.name : `项目 ${i + 1}`;
    return `<a class="${cls}" href="#/project/${i}">
      <span class="nav__mark">—</span><span class="nav__text">${esc(name)}</span>
    </a>`;
  }).join("");

  const navItem = (href, label, active) => `
    <a class="nav__item${active ? " is-active" : ""}" href="${href}">
      <span class="nav__mark">—</span><span class="nav__text">${esc(label)}</span>
    </a>
  `;

  return `
    <a class="brand" href="#/">${esc(brand)}</a>
    <nav class="nav">
      ${navItem("#/", "精选作品", r.name === "overview")}
      <div class="nav__group">
        <div class="nav__group-label">项目</div>
        <div class="nav__sublist">${projLinks || `<span class="nav__empty">（暂无项目）</span>`}</div>
      </div>
      ${navItem("#/about", "关于我", r.name === "about")}
    </nav>
  `;
}

/* ---------- Footer ---------- */

function renderFooter() {
  const txt = (DATA.header && DATA.header.copyright) || "";
  if (!txt) return "";
  return `<footer class="site-footer">${esc(txt)}</footer>`;
}

/* ---------- Gallery (masonry by CSS columns) ---------- */

function galleryHtml(items, columns) {
  const c = Math.max(1, Math.min(4, Number(columns) || 3));
  if (!items || !items.length) {
    return `<div class="empty">暂无作品，请到 <a href="/admin">/admin</a> 添加</div>`;
  }
  const cells = items.map((it, i) => {
    const url = (it && it.url) || "";
    if (!url) return "";
    return `
      <figure class="gallery__item" data-idx="${i}">
        <img src="${esc(url)}" alt="${esc(it.caption || "")}" loading="lazy" />
      </figure>
    `;
  }).join("");
  return `<div class="gallery gallery--c${c}">${cells}</div>`;
}

/* ---------- Views ---------- */

function viewOverview() {
  const o = DATA.overview || {};
  return `
    <div class="page page--gallery">
      ${galleryHtml(o.items || [], o.columns || "3")}
    </div>
  `;
}

function viewProject(idx) {
  const list = projects();
  const p = list[idx];
  if (!p) {
    return `<div class="page"><div class="empty">项目不存在</div></div>`;
  }
  return `
    <div class="page page--gallery">
      <h1 class="page__title">${esc(p.name || `项目 ${idx + 1}`)}</h1>
      ${galleryHtml(p.items || [], p.columns || "3")}
    </div>
  `;
}

function viewAbout() {
  const a = DATA.about || {};
  const img = a.image && a.image.url ? a.image.url : "";
  const bio = a.bio || "";
  const contact = a.contact || "";
  const clients = a.clients || "";
  const footer = a.footer || "";

  const bioHtml = bio
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `
    <div class="page page--about">
      ${img ? `<div class="about__photo about__block"><img src="${esc(img)}" alt=""></div>` : ""}
      <div class="about__text">
        ${bioHtml ? `<div class="about__bio about__block">${bioHtml}</div>` : ""}
        ${contact ? `<div class="about__contact about__block">${contact}</div>` : ""}
        ${clients ? `<div class="about__clients about__block">${clients}</div>` : ""}
        ${footer ? `<div class="about__footer about__block">${esc(footer)}</div>` : ""}
      </div>
    </div>
  `;
}

/* ---------- Lightbox ---------- */

function currentItems() {
  const r = currentRoute();
  if (r.name === "overview") return (DATA.overview && DATA.overview.items) || [];
  if (r.name === "project") {
    const p = projects()[r.idx];
    return (p && p.items) || [];
  }
  return [];
}

function initLightboxTargets() {
  app.querySelectorAll(".gallery__item").forEach(el => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.idx);
      openLightbox(currentItems(), i);
    });
  });
}

let activeLightbox = null;

function openLightbox(items, startIdx) {
  closeLightbox();
  items = (items || []).filter(x => x && x.url);
  if (!items.length) return;

  const el = document.createElement("div");
  el.className = "lightbox";
  el.innerHTML = `
    <button class="lightbox__close" aria-label="close">${SVG_CLOSE}</button>
    <div class="lightbox__main">
      <button class="lightbox__nav lightbox__nav--prev" aria-label="prev">${SVG_PREV}</button>
      <img class="lightbox__img" src="${esc(items[startIdx].url)}" alt="">
      <button class="lightbox__nav lightbox__nav--next" aria-label="next">${SVG_NEXT}</button>
    </div>
    <div class="lightbox__footer">
      <div class="lightbox__count"></div>
    </div>
  `;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";

  let idx = Math.max(0, Math.min(startIdx, items.length - 1));
  const imgEl = el.querySelector(".lightbox__img");
  const countEl = el.querySelector(".lightbox__count");
  const prevBtn = el.querySelector(".lightbox__nav--prev");
  const nextBtn = el.querySelector(".lightbox__nav--next");

  const show = i => {
    idx = (i + items.length) % items.length;
    imgEl.classList.add("is-fading");
    setTimeout(() => {
      imgEl.src = items[idx].url;
      imgEl.classList.remove("is-fading");
    }, 120);
    countEl.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : "";
    const single = items.length <= 1;
    prevBtn.toggleAttribute("disabled", single);
    nextBtn.toggleAttribute("disabled", single);
  };

  countEl.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : "";
  const single = items.length <= 1;
  prevBtn.toggleAttribute("disabled", single);
  nextBtn.toggleAttribute("disabled", single);

  prevBtn.addEventListener("click", e => { e.stopPropagation(); show(idx - 1); });
  nextBtn.addEventListener("click", e => { e.stopPropagation(); show(idx + 1); });
  el.querySelector(".lightbox__close").addEventListener("click", closeLightbox);
  el.addEventListener("click", e => {
    if (e.target === el || e.target.classList.contains("lightbox__main")) closeLightbox();
  });

  const onKey = e => {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight") show(idx + 1);
    else if (e.key === "ArrowLeft") show(idx - 1);
  };
  window.addEventListener("keydown", onKey);

  activeLightbox = { el, onKey };
}

function closeLightbox() {
  if (!activeLightbox) return;
  const { el, onKey } = activeLightbox;
  window.removeEventListener("keydown", onKey);
  el.remove();
  document.body.style.overflow = "";
  activeLightbox = null;
}

boot();
