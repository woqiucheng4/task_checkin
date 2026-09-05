import { describe, expect, it } from "vitest";
import { PresentationService } from "../../src/application/presentation-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

describe("presentation privacy boundaries", () => {
  it("rejects parent projection access without an active guardian link", async () => {
    const seed = await createIdentityScenario(1);
    const presentation = new PresentationService(seed.harness);

    await expect(
      presentation.parentDashboard(seed.teacher, {
        childId: seed.firstChild.id,
        date: "2026-09-05",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("omits global child identifiers and family-private data from group workspace", async () => {
    const seed = await createIdentityScenario(1);
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: seed.teacher.accountId,
      groupId: seed.group.id,
      requestId: "presentation-privacy-teacher-role",
      role: "TEACHER",
    });
    const presentation = new PresentationService(seed.harness);

    const view = await presentation.groupWorkspace(seed.teacher, { groupId: seed.group.id });
    const serialized = JSON.stringify(view);

    expect(view.members).toEqual([
      expect.objectContaining({
        displayName: "孩子1",
        organizationMemberId: seed.memberships[0]?.organizationMemberId,
      }),
    ]);
    expect(serialized).not.toMatch(/childId|wish|guardian|familyId/i);
  });

  it("requires platform mode for aggregate platform projections", async () => {
    const seed = await createIdentityScenario(1);
    const presentation = new PresentationService(seed.harness);

    await expect(presentation.platformDashboard(seed.guardian)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
