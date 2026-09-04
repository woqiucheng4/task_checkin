import {
  createCoreApi,
  type CoreAction,
  type CoreActorSelection,
} from "../../src/application/core-api.js";
import type { Account, Child, Family, Group, Organization } from "../../src/domain/model.js";
import type { CommandResult } from "../../src/shared/result.js";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";

export class AcceptanceScenario {
  readonly harness: TestHarness;
  readonly storage = new FakeMediaStorage();
  readonly ocr = new FakeOcrProvider({
    confidence: 0.94,
    provider: "acceptance-ocr",
    providerVersion: "1.0",
    title: "识别出的数学练习",
  });
  readonly api;
  private requestSequence = 0;

  constructor() {
    this.harness = createHarness();
    this.api = createCoreApi({
      ...this.harness,
      mediaStorage: this.storage,
      ocrProvider: this.ocr,
    });
  }

  async call<T>(
    openId: string,
    action: CoreAction,
    payload: Readonly<Record<string, unknown>> = {},
    options: {
      readonly actor?: CoreActorSelection;
      readonly platform?: boolean;
      readonly requestId?: string;
    } = {},
  ): Promise<T> {
    const result = await this.result(openId, action, payload, options);
    if (!result.ok) {
      throw new Error(`${action} failed: ${result.error.code} ${result.error.message}`);
    }
    return result.data as T;
  }

  async result(
    openId: string,
    action: CoreAction,
    payload: Readonly<Record<string, unknown>> = {},
    options: {
      readonly actor?: CoreActorSelection;
      readonly platform?: boolean;
      readonly requestId?: string;
    } = {},
  ): Promise<CommandResult<unknown>> {
    this.requestSequence += 1;
    return this.api.handle(
      {
        action,
        ...(options.actor === undefined ? {} : { actor: options.actor }),
        payload,
        requestId: options.requestId ?? `acceptance-request-${this.requestSequence}`,
      },
      {
        openId,
        ...(options.platform === true ? { isPlatformOperator: true } : {}),
      },
    );
  }

  async bootstrap(openId: string): Promise<Account> {
    return this.call<Account>(openId, "BOOTSTRAP_ACCOUNT");
  }

  async createFamilyWithChild(openId = "wx-acceptance-guardian"): Promise<{
    account: Account;
    child: Child;
    family: Family;
    openId: string;
  }> {
    const account = await this.bootstrap(openId);
    const family = await this.call<Family>(openId, "CREATE_FAMILY", { name: "晨光家" });
    const child = await this.call<Child>(openId, "ADD_CHILD", {
      familyId: family.id,
      grade: 3,
      nickname: "小满",
    });
    return { account, child, family, openId };
  }

  async createInstitution(
    teacherOpenId = "wx-acceptance-teacher",
    platformOpenId = "wx-acceptance-platform",
  ): Promise<{
    group: Group;
    organization: Organization;
    platformAccount: Account;
    platformOpenId: string;
    teacherAccount: Account;
    teacherOpenId: string;
  }> {
    const teacherAccount = await this.bootstrap(teacherOpenId);
    const platformAccount = await this.bootstrap(platformOpenId);
    const actor = { mode: "PLATFORM" as const };
    const organization = await this.call<Organization>(
      platformOpenId,
      "CREATE_ORGANIZATION",
      { adminAccountId: teacherAccount.id, name: "青禾学校", type: "SCHOOL" },
      { actor, platform: true },
    );
    const group = await this.call<Group>(teacherOpenId, "CREATE_GROUP", {
      name: "三年级一班",
      organizationId: organization.id,
      type: "SCHOOL_CLASS",
    });
    return {
      group,
      organization,
      platformAccount,
      platformOpenId,
      teacherAccount,
      teacherOpenId,
    };
  }
}

export const ORDINARY_TASK = {
  allowLateSubmission: true,
  category: "MATHEMATICS",
  description: "完成当天练习",
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 20,
  importance: "REQUIRED",
  occurrenceDate: "2026-09-05",
  requiresAcademicReview: false,
  schedule: { date: "2026-09-05", kind: "ONCE" },
  startsAt: "2026-09-05T09:00:00.000Z",
  submissionMode: "CONFIRM",
  title: "数学练习",
} as const;
