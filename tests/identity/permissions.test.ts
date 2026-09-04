import { describe, expect, it } from "vitest";

import { IdentityService } from "../../src/application/identity-service.js";
import { AccessPolicy } from "../../src/domain/policy.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarness } from "../helpers/harness.js";

const platformActor: ActorContext = {
  accountId: "platform-operator",
  mode: "PLATFORM",
};

async function seededMembership() {
  const harness = createHarness();
  const identity = new IdentityService(harness);
  const guardianAccount = await identity.createAccount({
    openId: "wx-guardian",
    requestId: "account-guardian",
  });
  const teacherAccount = await identity.createAccount({
    openId: "wx-teacher",
    requestId: "account-teacher",
  });
  const otherTeacherAccount = await identity.createAccount({
    openId: "wx-other-teacher",
    requestId: "account-other-teacher",
  });
  const guardian: ActorContext = { accountId: guardianAccount.id, mode: "ACCOUNT" };
  const teacher: ActorContext = { accountId: teacherAccount.id, mode: "ACCOUNT" };
  const otherTeacher: ActorContext = { accountId: otherTeacherAccount.id, mode: "ACCOUNT" };
  const family = await identity.createFamily(guardian, {
    name: "晨光家",
    requestId: "family-guardian",
  });
  const child = await identity.addChild(guardian, {
    familyId: family.id,
    nickname: "果果",
    requestId: "child-guardian",
  });
  const organization = await identity.createOrganization(platformActor, {
    adminAccountId: teacher.accountId,
    name: "青禾学校",
    requestId: "organization-teacher",
    type: "SCHOOL",
  });
  const otherOrganization = await identity.createOrganization(platformActor, {
    adminAccountId: otherTeacher.accountId,
    name: "远山学校",
    requestId: "organization-other",
    type: "SCHOOL",
  });
  const group = await identity.createGroup(teacher, {
    name: "三年级一班",
    organizationId: organization.id,
    requestId: "group-teacher",
    type: "SCHOOL_CLASS",
  });
  const membership = {
    id: "child-group-1",
    childId: child.id,
    createdAt: harness.clock.now(),
    disclosure: { avatar: false, displayName: true, grade: false },
    groupId: group.id,
    organizationId: organization.id,
    organizationMemberId: "member-child-1",
    status: "ACTIVE" as const,
    updatedAt: harness.clock.now(),
  };
  await harness.repository.transaction(async (tx) => {
    await tx.insert("organizationMembers", {
      id: "organization-child-1",
      childId: child.id,
      createdAt: harness.clock.now(),
      displayName: "小果",
      memberType: "CHILD",
      organizationId: organization.id,
      organizationMemberId: membership.organizationMemberId,
      status: "ACTIVE",
      updatedAt: harness.clock.now(),
    });
    await tx.insert("childGroupMemberships", membership);
  });

  return {
    child,
    guardian,
    harness,
    identity,
    membership,
    organization,
    otherOrganization,
    otherTeacher,
    teacher,
  };
}

describe("access policy", () => {
  it("prevents a teacher from reading a family child by global child id", async () => {
    const seed = await seededMembership();
    const policy = new AccessPolicy(seed.harness.repository);

    await expect(policy.requireGuardian(seed.teacher, seed.child.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns an organization child projection without the global child id", async () => {
    const seed = await seededMembership();

    const projection = await seed.identity.getOrganizationChild(
      seed.teacher,
      seed.membership.organizationMemberId,
    );

    expect(projection).toEqual({
      displayName: "小果",
      grade: undefined,
      organizationMemberId: seed.membership.organizationMemberId,
    });
    expect(projection).not.toHaveProperty("childId");
  });

  it("rejects an organization member id from another organization", async () => {
    const seed = await seededMembership();

    await expect(
      seed.identity.getOrganizationChild(seed.otherTeacher, seed.membership.organizationMemberId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a guardian to access only their linked children", async () => {
    const seed = await seededMembership();
    const outsiderAccount = await seed.identity.createAccount({
      openId: "wx-outsider",
      requestId: "account-outsider",
    });
    const outsider: ActorContext = { accountId: outsiderAccount.id, mode: "ACCOUNT" };
    const policy = new AccessPolicy(seed.harness.repository);

    await expect(policy.requireGuardian(seed.guardian, seed.child.id)).resolves.toMatchObject({
      childId: seed.child.id,
    });
    await expect(policy.requireGuardian(outsider, seed.child.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("evaluates child visibility inside the requested tenant scope", async () => {
    const seed = await seededMembership();
    const policy = new AccessPolicy(seed.harness.repository);
    const guardianLink = await policy.requireGuardian(seed.guardian, seed.child.id);

    await expect(
      policy.canReadChildScope(seed.guardian, seed.child.id, {
        familyId: guardianLink.familyId,
        kind: "FAMILY",
      }),
    ).resolves.toBe(true);
    await expect(
      policy.canReadChildScope(seed.teacher, seed.child.id, {
        kind: "ORGANIZATION",
        organizationId: seed.organization.id,
      }),
    ).resolves.toBe(true);
    await expect(
      policy.canReadChildScope(seed.otherTeacher, seed.child.id, {
        kind: "ORGANIZATION",
        organizationId: seed.otherOrganization.id,
      }),
    ).resolves.toBe(false);
  });
});
