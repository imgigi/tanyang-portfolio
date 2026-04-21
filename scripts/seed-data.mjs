// seed-data.mjs — 把 data.initial.json 写入 KV（key = "data"）
// 同时可选把 schema.json 也写进去（key = "schema"）
// 用法：
//   node scripts/seed-data.mjs              # 灌 data.initial.json 到生产 KV
//   node scripts/seed-data.mjs --local      # 写到本地 wrangler 模拟 KV
//   node scripts/seed-data.mjs --schema     # 同时把 public/schema.json 也写进去

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const isLocal = args.has("--local");
const doSchema = args.has("--schema");

function readToml() {
  return fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
}

function getKvId() {
  // 优先：环境变量 KV_NAMESPACE_ID
  // 次之：wrangler.toml 里 [[kv_namespaces]] 块（如果脚本使用者手动加了）
  if (process.env.KV_NAMESPACE_ID) return process.env.KV_NAMESPACE_ID;
  const toml = readToml();
  const m = toml.match(/\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"DATA"[\s\S]*?id\s*=\s*"([a-f0-9]+)"/);
  if (m) return m[1];
  throw new Error(
    "找不到 KV namespace id。\n" +
    "用法：KV_NAMESPACE_ID=xxxxxxxxxxxx node scripts/seed-data.mjs\n" +
    "id 在 `wrangler kv namespace list` 里查（binding 是 DATA 的那个）"
  );
}

function writeKV(kvId, key, jsonStr) {
  const tmp = path.join(ROOT, `.kv-${key}.tmp.json`);
  fs.writeFileSync(tmp, jsonStr);
  try {
    const args = [
      "wrangler", "kv", "key", "put",
      "--namespace-id", kvId,
      isLocal ? "--local" : "--remote",
      key,
      `--path`, tmp,
    ];
    console.log("→", args.join(" "));
    execSync("npx " + args.join(" "), { stdio: "inherit", cwd: ROOT });
  } finally {
    fs.unlinkSync(tmp);
  }
}

const kvId = getKvId();

const dataPath = path.join(ROOT, "data.initial.json");
if (!fs.existsSync(dataPath)) {
  console.error("缺少 data.initial.json（可以先复制 public/data.example.json 过来再改）");
  process.exit(1);
}
const data = fs.readFileSync(dataPath, "utf8");
JSON.parse(data); // 校验合法

writeKV(kvId, "data", data);

if (doSchema) {
  const schemaPath = path.join(ROOT, "public/schema.json");
  const schema = fs.readFileSync(schemaPath, "utf8");
  JSON.parse(schema);
  writeKV(kvId, "schema", schema);
}

console.log("✓ 完成");
