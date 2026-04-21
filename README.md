# Portfolio Template

Cloudflare Pages + Functions + KV + R2 的**多站点可派生**作品集模板。后台 schema 驱动：每个站字段可不一样，admin 代码不变。

---

## 一、一次性基础建设（账号级别）

**域名**：把 `yourname.com` 的 Name Servers 从 Vercel 换到 Cloudflare（Vercel Dashboard → Domains → Nameservers）。一次性，以后所有子域名在 Cloudflare 一处管理。

**共享 R2 bucket**：在 Cloudflare 账号里建一个 bucket（`wrangler.toml` 默认叫 `portfolios-img`），所有站共用。通过上传时自动加 `{SITE_ID}/` 前缀隔离。
```bash
npx wrangler r2 bucket create portfolios-img
```

**GitHub**：本机配好 `gh` CLI（`brew install gh && gh auth login`），脚本会用它建仓库。

---

## 二、开一个新站

```bash
cd ~/Desktop/web/portfolio-template
./scripts/spawn-site.sh liyuancun "李垣村"
```

脚本会：
1. 复制模板到 `~/Desktop/web/liyuancun/`
2. 替换 `wrangler.toml` 里的 `SITE_ID`
3. 初始化 git

然后**按脚本输出的 6 步清单**手动完成：
- `gh repo create` 推代码
- `wrangler kv namespace create DATA` 建 KV，把 id 填回 `wrangler.toml`
- `wrangler pages project create` 建 Pages 项目
- `wrangler pages deploy` 首次部署
- Dashboard 绑 KV/R2 bindings + 密钥（`ADMIN_PASSWORD`、`SESSION_SECRET`）
- Custom domains 绑 `liyuancun.yourname.com`

之后每次代码改动推 git，Cloudflare 自动 build。

---

## 三、让 AI 生成新站的内容

这是模板的核心用法——每次新建一个作品集，你**只需要给 AI**：

1. 一张/几张前端设计参考（图、站点 URL 或文字描述）
2. 站点要放的内容结构（有哪些 section、每个 section 有哪些字段）
3. 站点名 + site-id

AI 要做的 4 件事：

| 文件 | 作用 |
|------|------|
| `public/schema.json` | 改 `site.title` / `site.siteId`，重写 `sections` 描述字段结构 |
| `data.initial.json` | 按 schema 结构填上初始文案和图片占位 |
| `public/assets/css/styles.css` | 按设计参考完全重写 |
| `public/assets/js/app.js` | 按 schema + 设计重写渲染逻辑 |

**不动**：所有 `functions/**`、`public/admin.html`、`public/assets/js/admin.js`、`public/assets/css/admin.css`、`wrangler.toml`（只有 `spawn-site.sh` 碰它）

---

## 四、Schema 格式规范

顶层：
```json
{
  "site": { "title": "站点标题", "siteId": "kebab-case-id" },
  "sections": [ /* 顶层章节，必须是 group 或 list */ ]
}
```

**Section（顶层章节）**，`type` 只能是 `group` 或 `list`：
```json
{ "id": "about", "label": "关于", "type": "group", "fields": [...] }
{ "id": "projects", "label": "项目", "type": "list",
  "itemLabel": "项目", "itemTitle": "title", "fields": [...] }
```

**字段类型（叶子）**：

| type       | 数据形态                           | 用途 |
|------------|-------------------------------------|------|
| `text`     | `""`                                | 单行 |
| `textarea` | `""`                                | 多行 |
| `richtext` | `"<p>...</p>"`                      | HTML 片段 |
| `number`   | `0`                                 | 数字 |
| `url`      | `""`                                | 链接 |
| `select`   | `""`                                | 下拉，需 `options: [...]` |
| `image`    | `{key, url, name}` 或 `null`        | 单图 |
| `gallery`  | `[{key, url, caption}]`             | 图集 |
| `video`    | `""`                                | 粘贴 iframe / BV号 / YouTube URL |

**组合字段**：
- `group` + `fields`：嵌套对象
- `list` + `fields`（可选 `itemLabel` / `itemTitle`）：数组，admin 支持拖动排序

**可选属性**：`placeholder`、`help`、`rows`（textarea）、`caption: false`（gallery 不要 caption 字段）

---

## 五、数据读取

前端 JS 里：
```js
const schema = await fetch("/api/schema").then(r => r.json());
const data = await fetch("/api/data").then(r => r.json());

// 按 schema 的 section id 访问 data
data.about.name         // group 章节
data.projects[0].title  // list 章节
data.projects[0].cover.url  // 图片
data.projects[0].video  // 视频原始输入，前端用 resolveVideoSrc() 转 embed
```

`resolveVideoSrc()` 的实现在 `public/assets/js/app.js` 顶部，AI 生成新前台时保留/复用。

---

## 六、本地开发

```bash
cp .dev.vars.example .dev.vars   # 填密码和密钥
npm install
npm run dev                       # → http://localhost:8788
```

本地 KV/R2 会用 `.wrangler/state/`，与生产隔离。

---

## 七、写数据到生产 KV

准备好 `data.initial.json` 后：
```bash
npm run seed                       # 写 data 到生产 KV
node scripts/seed-data.mjs --schema  # 同时把 schema.json 也写进去
```

（默认 admin 读 schema 的顺序：KV > `/schema.json` 静态 fallback。所以即便不 seed schema，部署后也会走静态 fallback，无差别。）

---

## 八、目录结构

```
portfolio-template/
├── wrangler.toml                    # SITE_ID / KV id 占位
├── package.json
├── .dev.vars.example
├── scripts/
│   ├── spawn-site.sh                # 一键派生新站
│   └── seed-data.mjs                # 灌初始数据到 KV
├── functions/
│   ├── _shared.js                   # cookie 签名 / KV 读写
│   └── api/
│       ├── login.js / logout.js / me.js
│       ├── schema.js                # GET/PUT schema
│       ├── data.js                  # GET/PUT data
│       ├── upload.js                # 上传图片 → R2（带 siteId 前缀）
│       └── image/[[path]].js        # R2 读取代理（多段路径）
└── public/
    ├── admin.html                   # ★ 通用 admin 入口
    ├── index.html                   # ★ 前台入口（AI 改）
    ├── schema.json                  # ★ schema（AI 改）
    └── assets/
        ├── js/
        │   ├── admin.js             # ★ 通用 admin（不动）
        │   └── app.js               # ★ 前台（AI 改）
        └── css/
            ├── admin.css            # 通用 admin 样式（不动）
            └── styles.css           # ★ 前台样式（AI 改）
```

---

## 九、常见坑

| 症状 | 解决 |
|------|------|
| 上传图片 500 | Dashboard R2 binding 没绑 IMAGES |
| 登录转圈 | `ADMIN_PASSWORD` / `SESSION_SECRET` 没设或没 Retry deployment |
| 图片 404 | R2 bucket 里 key 没有 `siteId/` 前缀，检查 `SITE_ID` 环境变量是否和 `wrangler.toml` 的 `[vars] SITE_ID` 一致 |
| 视频预览空白 | `resolveVideoSrc()` 没识别输入，admin 底部会显示"解析失败"，换种格式（完整 iframe / BV号） |
| B 站 iframe 在国外播不了 | 正常，B 站嵌入对部分地区有限制 |

---

## 十、给 AI 的指令模板

**新建站时**，把这段发给 AI（配上设计参考图）：

> 请基于 `portfolio-template/` 为我生成一个新站点，参考模板 README 第三、四节。
>
> - site-id: `xxxxx`
> - 站点标题: `XXXX`
> - 内容结构: [列出每个 section 有哪些字段]
> - 前端设计参考: [贴图或描述]
>
> 请输出这 4 个文件的完整内容：
> 1. `public/schema.json`
> 2. `data.initial.json`
> 3. `public/assets/css/styles.css`
> 4. `public/assets/js/app.js`
>
> 然后我跑 `./scripts/spawn-site.sh xxxxx` 派生出目录，把 4 个文件替换进去。
