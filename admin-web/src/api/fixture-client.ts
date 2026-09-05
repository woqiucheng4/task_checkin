import type { AdminApiClient, AdminRequest, AdminResult } from "./types";

const fixtures: Readonly<Record<string, unknown>> = {
  GET_INSTITUTION_DASHBOARD: {
    metrics: { activeMembers: 386, groups: 18, pendingReviews: 42, publishedTasks: 27 },
    organization: { id: "org-1", name: "春芽小学", type: "SCHOOL" },
  },
  GET_PLATFORM_DASHBOARD: {
    metrics: {
      activeFamilies: 12840,
      activeOrganizations: 246,
      activeSupportGrants: 3,
      contentProviders: 18,
      pendingExports: 7,
    },
  },
  GET_PROVIDER_DASHBOARD: {
    provider: { id: "provider-1", name: "知新教育内容中心" },
    templates: [
      { category: "LANGUAGE", id: "template-1", status: "ACTIVE", title: "每日朗读 10 分钟" },
    ],
  },
};

export class FixtureAdminApiClient implements AdminApiClient {
  async execute<T>(request: AdminRequest): Promise<AdminResult<T>> {
    const data = fixtures[request.action];
    if (data === undefined) {
      return {
        error: { code: "FIXTURE_NOT_FOUND", message: "本地预览暂未配置这项数据" },
        ok: false,
      };
    }
    return { data: structuredClone(data) as T, ok: true };
  }
}

export const fixtureAdminApi = new FixtureAdminApiClient();
