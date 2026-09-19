import { describe, expect, it } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { AccessPolicy } from "../../src/domain/policy.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";
import { FakeOcrProvider, FakeVerifiedMediaStorage } from "../helpers/media-fakes.js";

async function setup() {
  const seed = await createSubmittedTaskScenario("ORGANIZATION", "CONFIRM", 2);
  const secondChild = seed.children[1];
  const secondAssignment = seed.assignments.find((item) => item.childId === secondChild?.id);
  if (!secondChild || !secondAssignment) throw new Error("sibling fixture missing");
  const api = createCoreApi({
    ...seed.harness,
    mediaStorage: new FakeVerifiedMediaStorage(),
    taskDraftProvider: new FakeOcrProvider({
      confidence: 1,
      provider: "fake",
      providerVersion: "1",
    }),
  });
  const call = (action: string, payload: object, requestId = `parent-scope-${action}`) =>
    api.handle(
      { action, actor: { mode: "ACCOUNT" }, payload, requestId: requestId.replaceAll("_", "-") },
      { openId: "wx-scenario-guardian" },
    );
  return { ...seed, api, call, secondChild, secondAssignment };
}

describe("account identity with explicit child scope", () => {
  it("lets a guardian select either child for views and submit only the selected assignment", async () => {
    const seed = await setup();
    for (const child of seed.children) {
      for (const [action, payload] of [
        ["GET_CHILD_TODAY", { date: "2026-09-05" }],
        ["GET_CHILD_GROUPS", {}],
        ["GET_CHILD_ORCHARD", {}],
        ["GET_PARENT_DASHBOARD", { date: "2026-09-05" }],
        ["GET_PARENT_TASK_CENTER", {}],
        ["GET_FAMILY_WISHES", {}],
      ] as const) {
        expect(await seed.call(action, { ...payload, childId: child.id })).toMatchObject({
          ok: true,
        });
      }
    }
    expect(
      await seed.call("SUBMIT_TASK", {
        childId: seed.secondChild.id,
        assignmentId: seed.secondAssignment.id,
        mediaAssetIds: [],
      }),
    ).toMatchObject({ ok: true, data: { submission: { childId: seed.secondChild.id } } });
  });

  it("rejects an actual other family's child across child reads and writes", async () => {
    const seed = await setup();
    const family = await seed.identity.createFamily(seed.teacher, {
      name: "老师的家庭",
      requestId: "scope-other-family",
    });
    const child = await seed.identity.addChild(seed.teacher, {
      familyId: family.id,
      nickname: "其他孩子",
      requestId: "scope-other-child",
    });
    for (const [action, payload] of [
      ["GET_CHILD_TODAY", { date: "2026-09-05" }],
      ["GET_CHILD_GROUPS", {}],
      ["GET_CHILD_ORCHARD", {}],
      ["GET_PARENT_DASHBOARD", { date: "2026-09-05" }],
      ["GET_PARENT_TASK_CENTER", {}],
      ["GET_FAMILY_WISHES", {}],
      ["START_TREE", { catalogId: "starter-apple" }],
      ["CREATE_WISH", { title: "不能代管" }],
      ["SUBMIT_TASK", { assignmentId: seed.secondAssignment.id, mediaAssetIds: [] }],
    ] as const) {
      expect(await seed.call(action, { ...payload, childId: child.id })).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    }
    expect(await seed.harness.repository.query("childTrees")).toHaveLength(0);
    expect(await seed.harness.repository.query("wishes")).toHaveLength(0);
  });

  it("uses canonical assignment ownership even when both children have the same guardian", async () => {
    const seed = await setup();
    for (const [action, payload] of [
      ["GET_ASSIGNMENT_DETAIL", {}],
      ["SUBMIT_TASK", { mediaAssetIds: [] }],
      ["SUPPLEMENT_SUBMISSION", { mediaAssetIds: [] }],
      ["ACCEPT_LATE_CHALLENGE", {}],
      ["MARK_TASK_EXCUSED", {}],
      [
        "CREATE_UPLOAD_INTENT",
        { purpose: "SUBMISSION_EVIDENCE", mimeType: "image/jpeg", byteSize: 4, retentionDays: 90 },
      ],
    ] as const) {
      expect(
        await seed.call(action, {
          ...payload,
          childId: seed.firstChild.id,
          assignmentId: seed.secondAssignment.id,
        }),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
    expect(
      await seed.harness.repository.read("taskAssignments", seed.secondAssignment.id),
    ).toMatchObject({ taskState: "PENDING", acceptedLateChallenge: false });
    expect(await seed.harness.repository.query("mediaAssets")).toHaveLength(0);
  });

  it("rejects cross-child tree and wish mutations before replaying a cached receipt", async () => {
    const seed = await setup();
    const scope = { childId: seed.firstChild.id };
    await seed.call("START_TREE", { ...scope, catalogId: "starter-apple" });
    await seed.call("CREATE_WISH", { ...scope, title: "孩子 A 的愿望" });
    const tree = (await seed.harness.repository.query("childTrees"))[0]!;
    const wish = (await seed.harness.repository.query("wishes"))[0]!;
    const update = { childId: seed.firstChild.id, wishId: wish.id, title: "更新愿望" };
    expect(await seed.call("UPDATE_WISH", update)).toMatchObject({ ok: true });
    expect(
      await seed.call("UPDATE_WISH", { ...update, childId: seed.secondChild.id }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(
      await seed.call(
        "UPDATE_WISH",
        { ...update, childId: seed.secondChild.id },
        "scope-sibling-wish",
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await seed.call("RENAME_TREE", {
        childId: seed.secondChild.id,
        treeId: tree.id,
        name: "不能串改",
      }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    await seed.harness.repository.transaction(async (tx) => {
      const links = await tx.query("guardianLinks", { childId: seed.firstChild.id });
      for (const link of links) await tx.update("guardianLinks", link.id, { status: "WITHDRAWN" });
    });
    expect(await seed.call("UPDATE_WISH", update)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await seed.call("START_TREE", { ...scope, catalogId: "starter-apple" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("retains teacher resource access without allowing it to bypass an explicit guardian target", async () => {
    const seed = await setup();
    const command = {
      action: "GET_ASSIGNMENT_DETAIL",
      payload: { assignmentId: seed.assignment.id },
    };
    const auth = { openId: "wx-scenario-teacher" };
    expect(await seed.api.handle(command, auth)).toMatchObject({ ok: true });
    expect(
      await seed.api.handle(
        { ...command, payload: { ...command.payload, childId: seed.firstChild.id } },
        auth,
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("binds verified evidence upload, attachment and reads to the selected assignment child", async () => {
    const seed = await setup();
    const childId = seed.firstChild.id;
    expect(
      await seed.call("CREATE_UPLOAD_INTENT", {
        childId,
        assignmentId: seed.assignment.id,
        purpose: "SUBMISSION_EVIDENCE",
        mimeType: "image/jpeg",
        byteSize: 4,
        retentionDays: 90,
      }),
    ).toMatchObject({ ok: true });
    const asset = (await seed.harness.repository.query("mediaAssets"))[0]!;
    const submission = (
      await seed.harness.repository.query("submissions", { assignmentId: seed.assignment.id })
    )[0]!;
    expect(
      await seed.call("UPLOAD_MEDIA_CONTENT", {
        childId,
        assetId: asset.id,
        base64: Buffer.from([255, 216, 255, 0]).toString("base64"),
      }),
    ).toMatchObject({ ok: true });
    expect(
      await seed.call("ATTACH_SUBMISSION_EVIDENCE", {
        childId,
        assetId: asset.id,
        submissionId: submission.id,
      }),
    ).toMatchObject({ ok: true });
    expect(await seed.call("READ_MEDIA_ASSET", { childId, assetId: asset.id })).toMatchObject({
      ok: true,
      data: { id: asset.id },
    });
    expect(
      await seed.call("READ_MEDIA_ASSET", { childId: seed.secondChild.id, assetId: asset.id }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await seed.call("READ_MEDIA_ASSET", { assetId: asset.id })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(
      await seed.call("ATTACH_SUBMISSION_EVIDENCE", {
        childId: seed.secondChild.id,
        assetId: asset.id,
        submissionId: submission.id,
      }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("requires a selected child and rejects legacy CHILD requests explicitly", async () => {
    const seed = await setup();
    expect(
      await seed.call("SUBMIT_TASK", { assignmentId: seed.secondAssignment.id, mediaAssetIds: [] }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await seed.call("GET_CHILD_TODAY", { date: "2026-09-05" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_COMMAND" },
    });
    for (const action of ["GET_CHILD_TODAY", "GET_ASSIGNMENT_DETAIL", "SUBMIT_TASK"]) {
      expect(
        await seed.api.handle(
          {
            action,
            actor: { mode: "CHILD", childId: seed.firstChild.id },
            payload: {
              childId: seed.firstChild.id,
              assignmentId: seed.assignment.id,
              date: "2026-09-05",
              mediaAssetIds: [],
            },
            requestId: `legacy-child-${action.replaceAll("_", "-")}`,
          },
          { openId: "wx-scenario-guardian" },
        ),
      ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
    }
  });

  it.each(["account", "child"] as const)(
    "requires an active %s for direct child service authorization",
    async (kind) => {
      const seed = await setup();
      await seed.harness.repository.transaction(async (tx) => {
        if (kind === "account")
          await tx.update("accounts", seed.guardian.accountId, { status: "INACTIVE" });
        else await tx.update("children", seed.firstChild.id, { status: "INACTIVE" });
      });
      await expect(
        new AccessPolicy(seed.harness.repository).requireChildScope(
          seed.guardian,
          seed.firstChild.id,
        ),
      ).rejects.toMatchObject({ code: kind === "account" ? "UNAUTHORIZED" : "FORBIDDEN" });
    },
  );
});
