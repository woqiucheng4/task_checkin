import { describe, expect, it } from "vitest";

import { IdentityService } from "../../src/application/identity-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { AccessPolicy } from "../../src/domain/policy.js";
import { createHarness } from "../helpers/harness.js";

const platformActor: ActorContext = {
  accountId: "platform-operator",
  mode: "PLATFORM",
};

describe("identity service", () => {
  it("allows one account to be a guardian and organization admin without mixing memberships", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    const account = await identity.createAccount({
      openId: "wx-1",
      requestId: "account-request-1",
    });
    const actor: ActorContext = { accountId: account.id, mode: "ACCOUNT" };

    const family = await identity.createFamily(actor, {
      name: "晨光家",
      requestId: "family-request-1",
    });
    const organization = await identity.createOrganization(platformActor, {
      adminAccountId: account.id,
      name: "青禾学校",
      requestId: "organization-request-1",
      type: "SCHOOL",
    });

    expect(
      await harness.repository.query("familyMembers", {
        accountId: account.id,
        familyId: family.id,
      }),
    ).toHaveLength(1);
    expect(
      await harness.repository.query("organizationMembers", {
        accountId: account.id,
        organizationId: organization.id,
      }),
    ).toMatchObject([{ organizationRole: "ORGANIZATION_ADMIN" }]);
  });

  it("creates multiple children with separate guardian links", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    const account = await identity.createAccount({
      openId: "wx-2",
      requestId: "account-request-2",
    });
    const actor: ActorContext = { accountId: account.id, mode: "ACCOUNT" };
    const family = await identity.createFamily(actor, {
      name: "星星家",
      requestId: "family-request-2",
    });

    const first = await identity.addChild(actor, {
      familyId: family.id,
      nickname: "果果",
      requestId: "child-request-1",
    });
    const second = await identity.addChild(actor, {
      familyId: family.id,
      nickname: "乐乐",
      requestId: "child-request-2",
    });

    expect(first.id).not.toBe(second.id);
    expect(
      await harness.repository.query("guardianLinks", {
        accountId: account.id,
        familyId: family.id,
      }),
    ).toHaveLength(2);
  });

  it("creates groups only under the administrator organization", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    const admin = await identity.createAccount({ openId: "wx-admin", requestId: "account-admin" });
    const actor: ActorContext = { accountId: admin.id, mode: "ACCOUNT" };
    const organization = await identity.createOrganization(platformActor, {
      adminAccountId: admin.id,
      name: "青禾学校",
      requestId: "organization-admin",
      type: "SCHOOL",
    });

    const group = await identity.createGroup(actor, {
      name: "三年级一班",
      organizationId: organization.id,
      requestId: "group-request-1",
      type: "SCHOOL_CLASS",
    });

    expect(group.organizationId).toBe(organization.id);
    expect(group.coGrowingEnabled).toBe(false);
  });

  it("binds a teacher to one group and creates an organization staff membership", async () => {
    const harness = createHarness();
    const identity = new IdentityService(harness);
    const admin = await identity.createAccount({
      openId: "wx-admin-2",
      requestId: "account-admin-2",
    });
    const teacher = await identity.createAccount({
      openId: "wx-teacher-2",
      requestId: "account-teacher-2",
    });
    const adminActor: ActorContext = { accountId: admin.id, mode: "ACCOUNT" };
    const organization = await identity.createOrganization(platformActor, {
      adminAccountId: admin.id,
      name: "青禾学校",
      requestId: "organization-role",
      type: "SCHOOL",
    });
    const group = await identity.createGroup(adminActor, {
      name: "四年级一班",
      organizationId: organization.id,
      requestId: "group-role",
      type: "SCHOOL_CLASS",
    });

    const binding = await identity.bindGroupRole(adminActor, {
      accountId: teacher.id,
      groupId: group.id,
      requestId: "binding-role",
      role: "TEACHER",
    });

    expect(binding).toMatchObject({
      accountId: teacher.id,
      groupId: group.id,
      organizationId: organization.id,
      role: "TEACHER",
    });
    expect(
      await harness.repository.query("organizationMembers", {
        accountId: teacher.id,
        organizationId: organization.id,
      }),
    ).toMatchObject([{ organizationRole: "STAFF" }]);
    await expect(
      new AccessPolicy(harness.repository).requireGroupRole(
        { accountId: teacher.id, mode: "ACCOUNT" },
        group.id,
      ),
    ).resolves.toMatchObject({ role: "TEACHER" });
  });
});
