import { describe, expect, it } from "vitest";
import { PresentationService } from "../../src/application/presentation-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("family settings projections", () => {
  it("returns actual family rewards and member roles without OpenID", async () => {
    const seed = await createIdentityScenario(2);
    const service = new PresentationService(seed.harness);
    const view = await service.familySettings(seed.guardian, seed.family.id);
    expect(view).toMatchObject({
      name: "晨光家",
      defaultRewards: { ordinary: 2, focus: 3, challenge: 1, revision: 1 },
      childCount: 2,
      members: [{ role: "FAMILY_ADMIN" }],
    });
    expect(JSON.stringify(view)).not.toContain("wx-scenario");
    await expect(service.familySettings(seed.teacher, seed.family.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("returns only the selected child's active group memberships", async () => {
    const seed = await createIdentityScenario(2);
    const service = new PresentationService(seed.harness);
    const view = await service.childGroups(seed.guardian, seed.firstChild.id);
    expect(view.memberships).toMatchObject([
      {
        groupId: seed.group.id,
        name: "三年级学习小组",
        organizationName: "青禾老师",
        status: "ACTIVE",
      },
    ]);
    expect(view.memberships).toHaveLength(1);
    await expect(service.childGroups(seed.teacher, seed.firstChild.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
