#!/usr/bin/env bash
# spawn-site.sh — 从模板派生一个新作品集站点
# Usage: ./scripts/spawn-site.sh <site-id> [<site-title>]
# e.g.   ./scripts/spawn-site.sh liyuancun "李垣村"

set -euo pipefail

SITE_ID="${1:-}"
SITE_TITLE="${2:-$SITE_ID}"

if [[ -z "$SITE_ID" ]]; then
  echo "Usage: $0 <site-id> [<site-title>]"
  exit 1
fi
if [[ ! "$SITE_ID" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "site-id 只能包含小写字母、数字、连字符，且以字母/数字开头"
  exit 1
fi

# 假定 scripts/ 与 template 同级
TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$(cd "$TEMPLATE_DIR/.." && pwd)/$SITE_ID"

if [[ -e "$TARGET_DIR" ]]; then
  echo "目标目录已存在：$TARGET_DIR"
  exit 1
fi

echo "→ 复制模板到 $TARGET_DIR"
mkdir -p "$TARGET_DIR"
# 用 rsync 跳过开发产物
rsync -a --exclude node_modules --exclude .wrangler --exclude .git --exclude .DS_Store \
  "$TEMPLATE_DIR/" "$TARGET_DIR/"

cd "$TARGET_DIR"

echo "→ 替换 wrangler.toml 里的 name 和 SITE_ID"
# macOS / Linux 兼容的 sed
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(sed -i)
else
  SED_INPLACE=(sed -i '')
fi
"${SED_INPLACE[@]}" "s/^name = \"portfolio-template\"/name = \"$SITE_ID\"/" wrangler.toml
"${SED_INPLACE[@]}" "s/^SITE_ID = \"default\"/SITE_ID = \"$SITE_ID\"/" wrangler.toml

echo "→ 改 schema.json 的 site.title / siteId"
# 用 node 做 JSON 安全修改
node -e "
const fs=require('fs');
const p='public/schema.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.site = j.site || {};
j.site.siteId = '$SITE_ID';
j.site.title = '$SITE_TITLE';
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
"

echo "→ 清理示例数据"
rm -f public/data.example.json

echo "→ 初始化 git"
git init -q
git add .
git commit -q -m "init: $SITE_ID from template"

cat <<EOF

✅ 本地派生完成：$TARGET_DIR

接下来的手动步骤（一次性）：

1) 建 GitHub 仓库 + 推代码
   cd "$TARGET_DIR"
   gh repo create $SITE_ID --public --source=. --remote=origin --push

2) 创建 KV namespace（记下输出的 id，第 5 步 Dashboard 绑定时选它）
   cd "$TARGET_DIR"
   npx wrangler kv namespace create DATA

3) 创建 Pages project
   npx wrangler pages project create $SITE_ID --production-branch main

4) 首次部署
   npx wrangler pages deploy public --project-name $SITE_ID

5) 去 Cloudflare Dashboard 绑定（Workers & Pages → $SITE_ID → Settings → Functions）
   - KV binding:   DATA  →  步骤 2 的 namespace
   - R2 binding:   IMAGES →  共享 bucket（如 portfolios-img）
   - Environment Variables（Encrypt）:
       ADMIN_PASSWORD = <你的密码>
       SESSION_SECRET = <随机 32 位以上字符串>
   - Retry deployment 让密钥生效

6) 绑自定义子域名
   Custom domains → Set up → 输入 $SITE_ID.yourname.com
   （域名已托管 Cloudflare 时自动完成 DNS）

参考：模板 README.md 的"新站部署清单"
EOF
