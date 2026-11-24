// .env から public/js/env.js を生成するスクリプト
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");
const outPath = path.join(repoRoot, "public", "js", "env.js");

/** .env ファイルのパース */
export function parseEnvContent(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function main() {
  let fileEnv = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    fileEnv = parseEnvContent(content);
  }

  // 環境変数を優先し、未設定時は .env の値を使用
  const rawClientId =
    typeof process.env.GOOGLE_CLIENT_ID === "string"
      ? process.env.GOOGLE_CLIENT_ID
      : typeof fileEnv.GOOGLE_CLIENT_ID === "string"
        ? fileEnv.GOOGLE_CLIENT_ID
        : "";
  const clientId = rawClientId.trim();

  const output = [
    "// .env から自動生成される環境設定（手動編集不要）",
    `window.__EYEDROPS_ENV__ = ${JSON.stringify({ GOOGLE_CLIENT_ID: clientId }, null, 2)};`,
    "",
  ].join("\n");

  fs.writeFileSync(outPath, output, "utf8");
  console.log(`生成完了: ${path.relative(repoRoot, outPath)} (GOOGLE_CLIENT_ID=${clientId ? "設定済み" : "未設定"})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
