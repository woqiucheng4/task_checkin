import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { digest, validateSnapshot, collectFileIds, remapFileIds } from "./migration-lib.mjs";
import { COLLECTIONS } from "../dist/src/infrastructure/collections.js";

const require = createRequire(new URL("../cloudfunctions/coreApi/package.json", import.meta.url));
const cloudbase = require("@cloudbase/node-sdk");
const names = Object.values(COLLECTIONS);
const [action, envId, file] = process.argv.slice(2);
if (!["export", "verify", "import"].includes(action) || !envId || !file) {
  throw new Error(
    "用法: node scripts/migrate-data.mjs export|verify|import ENV_ID artifacts/private/snapshot.json；写入需 --apply；需先在目标环境建好专属集合/索引和禁止客户端直读写规则",
  );
}
const secretId = process.env.TENCENTCLOUD_SECRETID;
const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
if (!secretId || !secretKey)
  throw new Error(
    "需要临时腾讯云管理凭据环境变量 TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY；凭据不会写入迁移包",
  );
const app = cloudbase.init({
  env: envId,
  secretId,
  secretKey,
  ...(process.env.TENCENTCLOUD_SESSIONTOKEN
    ? { sessionToken: process.env.TENCENTCLOUD_SESSIONTOKEN }
    : {}),
});
const db = app.database();
const path = resolve(file);
async function rows(name) {
  if (!names.includes(name)) throw new Error("集合不属于本项目");
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const page = await db.collection(name).skip(offset).limit(100).get();
    result.push(...page.data);
    if (page.data.length < 100) break;
  }
  return result.sort((a, b) => a._id.localeCompare(b._id));
}
if (action === "export") {
  const collections = {};
  for (const name of names) collections[name] = await rows(name);
  const snapshot = {
    application: "task_checkin",
    schemaVersion: 1,
    sourceEnv: envId,
    exportedAt: new Date().toISOString(),
    collections,
    sha256: digest(collections),
    files: [...collectFileIds(collections)],
  };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(snapshot, null, 2), { flag: "wx", mode: 0o600 });
  console.log(
    `已导出 ${names.length} 个专属集合，${snapshot.files.length} 个文件引用；源数据保留。文件内容须单独复制。`,
  );
} else {
  const snapshot = JSON.parse(await readFile(path, "utf8"));
  validateSnapshot(snapshot, names);
  if (snapshot.sourceEnv === envId && action === "import")
    throw new Error("源环境与目标环境不能相同");
  let mapping = {};
  const mappingArg = process.argv.indexOf("--file-map");
  if (mappingArg >= 0) mapping = JSON.parse(await readFile(process.argv[mappingArg + 1], "utf8"));
  const desired =
    snapshot.sourceEnv === envId
      ? snapshot.collections
      : remapFileIds(snapshot.collections, mapping);
  if (action === "import") {
    // Preflight every collection before the first write. Never overwrite existing application data.
    for (const name of names) {
      const existing = await db.collection(name).limit(1).get();
      if (existing.data.length) throw new Error(`目标集合 ${name} 非空；拒绝覆盖，需另选空环境`);
    }
    if (!process.argv.includes("--apply")) {
      console.log("预检通过，未写入；添加 --apply 才导入。导入期间需暂停本产品写入。");
    } else {
      for (const name of names)
        for (const row of desired[name]) {
          const { _id, ...data } = row;
          await db.collection(name).doc(_id).create({ data });
        }
      console.log("导入完成；运行 verify 比较目标数据后再切换客户端环境。");
    }
  } else {
    for (const name of names) {
      const actual = await rows(name);
      // Compare canonical data independent of object property order.
      const canonical = (value) =>
        Array.isArray(value)
          ? value.map(canonical)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.keys(value)
                  .sort()
                  .map((k) => [k, canonical(value[k])]),
              )
            : value;
      if (digest(canonical(actual)) !== digest(canonical(desired[name])))
        throw new Error(`集合 ${name} 数据不一致`);
    }
    console.log("41 个集合的文档 ID、内容及文件引用全部一致。");
  }
}
