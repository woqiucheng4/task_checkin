import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { COLLECTIONS } from "../dist/src/infrastructure/collections.js";
import {
  validateSnapshot,
  collectFileIds,
  ownFilePath,
  copyApplicationFiles,
} from "./migration-lib.mjs";

const [sourceEnv, targetEnv, snapshotPath, mapPath] = process.argv.slice(2);
if (!sourceEnv || !targetEnv || !snapshotPath || !mapPath || sourceEnv === targetEnv)
  throw new Error(
    "用法: node scripts/migrate-files.mjs SOURCE_ENV TARGET_ENV snapshot.json file-map.json [--apply]",
  );
const snapshot = JSON.parse(await readFile(resolve(snapshotPath), "utf8"));
validateSnapshot(snapshot, Object.values(COLLECTIONS));
if (sourceEnv !== snapshot.sourceEnv) throw new Error("源环境与迁移包不一致");
const files = [...collectFileIds(snapshot.collections)];
for (const fileId of files) ownFilePath(fileId, sourceEnv);
const mapFile = resolve(mapPath);
try {
  await access(mapFile);
  throw new Error("文件映射已存在，请指定新的输出文件，禁止覆盖");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!process.argv.includes("--apply")) {
  console.log(`预检通过：仅复制 ${files.length} 个本项目文件；未联网或写入。确认后添加 --apply。`);
} else {
  const secretId = process.env.TENCENTCLOUD_SECRETID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
  if (!secretId || !secretKey)
    throw new Error("需要同时访问源、目标环境的临时管理凭据，禁止把凭据写入项目");
  const require = createRequire(new URL("../cloudfunctions/coreApi/package.json", import.meta.url));
  const cloudbase = require("@cloudbase/node-sdk");
  const credentials = {
    secretId,
    secretKey,
    ...(process.env.TENCENTCLOUD_SESSIONTOKEN
      ? { sessionToken: process.env.TENCENTCLOUD_SESSIONTOKEN }
      : {}),
  };
  const mapping = await copyApplicationFiles(
    snapshot,
    cloudbase.init({ ...credentials, env: sourceEnv }),
    cloudbase.init({ ...credentials, env: targetEnv }),
    targetEnv,
  );
  await mkdir(dirname(mapFile), { recursive: true, mode: 0o700 });
  await writeFile(mapFile, JSON.stringify(mapping, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`已复制并逐字节校验 ${files.length} 个文件，映射已保存；源文件全部保留。`);
}
