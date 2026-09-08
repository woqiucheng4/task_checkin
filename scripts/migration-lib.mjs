import { createHash, randomUUID } from "node:crypto";

export function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function validateSnapshot(snapshot, collectionNames) {
  if (snapshot.application !== "task_checkin" || snapshot.schemaVersion !== 1)
    throw new Error("不是本项目的迁移包");
  if (digest(snapshot.collections) !== snapshot.sha256) throw new Error("迁移包校验和不匹配");
  const names = Object.keys(snapshot.collections).sort();
  if (JSON.stringify(names) !== JSON.stringify([...collectionNames].sort()))
    throw new Error("迁移包集合清单与本项目不一致");
  for (const name of names) {
    if (!name.startsWith("task_checkin_")) throw new Error("拒绝访问其他项目集合");
    const ids = new Set();
    if (!Array.isArray(snapshot.collections[name])) throw new Error("集合数据格式无效");
    for (const row of snapshot.collections[name]) {
      if (!row || typeof row._id !== "string" || ids.has(row._id))
        throw new Error("文档 ID 缺失或重复");
      ids.add(row._id);
    }
  }
}
export function collectFileIds(value, result = new Set()) {
  if (typeof value === "string" && value.startsWith("cloud://")) result.add(value);
  else if (Array.isArray(value))
    value.forEach((v) => {
      collectFileIds(v, result);
    });
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => {
      collectFileIds(v, result);
    });
  return result;
}
export function remapFileIds(value, mapping) {
  if (typeof value === "string" && value.startsWith("cloud://")) {
    if (!mapping[value]) throw new Error("文件尚未复制到目标环境，拒绝导入旧 fileID");
    return mapping[value];
  }
  if (Array.isArray(value)) return value.map((v) => remapFileIds(v, mapping));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapFileIds(v, mapping)]));
  return value;
}

export function ownFilePath(fileId, envId) {
  const match = /^cloud:\/\/([^/]+)\/(.+)$/.exec(fileId);
  if (
    !match ||
    !(match[1] === envId || match[1].startsWith(`${envId}.`)) ||
    !/^task-checkin\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(match[2]) ||
    match[2].split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("迁移文件不属于指定环境的 task-checkin 专属路径");
  }
  return match[2];
}

export async function copyApplicationFiles(snapshot, source, target, targetEnv) {
  if (snapshot.sourceEnv === targetEnv) throw new Error("源环境与目标环境不能相同");
  const fileIds = [...collectFileIds(snapshot.collections)];
  // Complete the namespace preflight before the first network read or write.
  for (const fileId of fileIds) ownFilePath(fileId, snapshot.sourceEnv);
  const runId = randomUUID();
  const mapping = {};
  const bytesHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  for (const fileId of fileIds) {
    const original = await source.downloadFile({ fileID: fileId });
    if (!Buffer.isBuffer(original.fileContent)) throw new Error("源文件下载失败，停止迁移");
    const uploaded = await target.uploadFile({
      cloudPath: `task-checkin/migrations/${runId}/${digest(fileId)}`,
      fileContent: original.fileContent,
    });
    ownFilePath(uploaded.fileID, targetEnv);
    const copied = await target.downloadFile({ fileID: uploaded.fileID });
    if (
      !Buffer.isBuffer(copied.fileContent) ||
      bytesHash(original.fileContent) !== bytesHash(copied.fileContent)
    )
      throw new Error("目标文件校验失败，禁止切换环境");
    mapping[fileId] = uploaded.fileID;
  }
  return mapping;
}
