import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let local = {};
try {
  local = JSON.parse(await readFile(join(root, ".task-checkin.local.json"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const envId = process.env.CLOUDBASE_ENV_ID || local.envId || "";
const appId = process.env.CHECKIN_APP_ID || local.appId || "";
const resourceAppId = process.env.CLOUDBASE_RESOURCE_APP_ID || local.resourceAppId || "";
const mode = local.mode || (resourceAppId ? "shared" : "direct");
const configured = /^[a-zA-Z0-9-]+$/.test(envId) && /^wx[0-9a-f]{16}$/.test(appId);
if (mode !== "direct" && mode !== "shared") throw new Error("mode must be direct or shared");
if (mode === "shared" && !/^wx[0-9a-f]{16}$/.test(resourceAppId))
  throw new Error("共享环境必须配置资源方 AppID");
if (!configured && process.argv.includes("--require-config"))
  throw new Error("请在 .task-checkin.local.json 配置 envId/appId 后再部署");

const fnName = "taskCheckinCoreApi";
const out = join(root, "dist/deploy", fnName);
await mkdir(out, { recursive: true });
// Keep a self-contained CommonJS handler: cloud runtimes do not receive ../../src.
await build({
  entryPoints: [join(root, "cloudfunctions/coreApi/index.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["wx-server-sdk"],
  outfile: join(out, "index.js"),
});
const pkg = JSON.parse(await readFile(join(root, "cloudfunctions/coreApi/package.json"), "utf8"));
await writeFile(
  join(out, "package.json"),
  `${JSON.stringify({ ...pkg, type: "commonjs", main: "index.js" }, null, 2)}\n`,
);
await cp(join(root, "cloudfunctions/coreApi/package-lock.json"), join(out, "package-lock.json"));
await writeFile(
  join(out, "config.json"),
  `${JSON.stringify({ permissions: { openapi: [] } }, null, 2)}\n`,
);

async function walk(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}
const miniRoot = join(root, "miniprogram");
const miniOut = join(root, "dist/miniprogram");
await rm(miniOut, { recursive: true, force: true });
const miniFiles = await walk(miniRoot);
// Compile each Mini Program module to CommonJS with wx-compatible syntax.
await build({
  entryPoints: miniFiles.filter((p) => p.endsWith(".ts") && !p.endsWith(".d.ts")),
  outbase: miniRoot,
  outdir: miniOut,
  platform: "neutral",
  format: "cjs",
  target: "es2019",
});
// The theme is shared with the web UI outside miniprogramRoot. Inline its pure-data dependency.
await build({
  entryPoints: [join(miniRoot, "theme/tokens.ts")],
  bundle: true,
  outfile: join(miniOut, "theme/tokens.js"),
  platform: "neutral",
  format: "cjs",
  target: "es2019",
});
for (const path of miniFiles.filter(
  (p) => !p.endsWith(".ts") && !(p.includes("/assets/orchard/") && p.endsWith(".png")),
)) {
  const target = join(miniOut, path.slice(miniRoot.length + 1));
  await mkdir(dirname(target), { recursive: true });
  await cp(path, target);
}
await writeFile(
  join(miniOut, "config/env.js"),
  `exports.CLOUD_ENV_ID = ${JSON.stringify(envId)};\n` +
    `exports.CLOUD_RESOURCE_APP_ID = ${JSON.stringify(resourceAppId)};\n` +
    `exports.CLOUD_MODE = ${JSON.stringify(mode)};\n` +
    `exports.TASK_CHECKIN_CLOUD_FUNCTION = ${JSON.stringify(fnName)};\n` +
    `exports.assertConfiguredEnvironment = function(id) { if (!id) throw new Error('请配置云开发环境'); return id; };\n`,
);
const { COLLECTIONS, CLOUDBASE_INDEXES } = await import(
  "../dist/src/infrastructure/collections.js"
);
const manifest = {
  schemaVersion: 1,
  application: "task_checkin",
  functionName: fnName,
  functionSha256: createHash("sha256")
    .update(await readFile(join(out, "index.js")))
    .digest("hex"),
  envId,
  appId,
  mode,
  resourceAppId,
  configured,
  runtimeEnvironmentRequirements: {
    optional: [
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_BASE_URL",
      "AI_TASK_DRAFT_ENABLED",
      "AI_TASK_DRAFT_GLOBAL_DAILY_LIMIT",
      "AI_TASK_DRAFT_ACCOUNT_DAILY_LIMIT",
    ],
    requiredSecrets: ["TEACHER_ACTIVATION_PEPPER"],
    requiredForPrivateAiImageReads: ["TASK_CHECKIN_CLOUD_FILE_AUTHORITIES"],
  },
  functionEnvironment: { ALLOWED_CALLER_APPIDS: appId },
  storagePrefix: "task-checkin/",
  collections: Object.values(COLLECTIONS),
  indexes: CLOUDBASE_INDEXES.map((index) => ({
    ...index,
    collection: COLLECTIONS[index.collection],
  })),
  collectionRules: { read: false, write: false },
};
await writeFile(join(root, "dist/deploy/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Built ${fnName}, ${manifest.collections.length} isolated collections; cloud configured: ${configured}`,
);
