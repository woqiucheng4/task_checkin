import { accountShell, command } from "./session-runtime.js";
import type {
  GroupRoleView,
  GroupWorkspaceView,
} from "../../src/application/presentation-models.js";

const KEY = "task_checkin_teacher_group_v1";
let selected = "";
export async function teacherWorkspaceOrganization() {
  const shell = await accountShell(true);
  return shell.organizations.find((organization) => organization.type === "TEACHER_WORKSPACE");
}
export async function teacherGroups(): Promise<readonly GroupRoleView[]> {
  const [shell, workspace] = await Promise.all([accountShell(true), teacherWorkspaceOrganization()]);
  if (!workspace) return [];
  return shell.groups.filter((group) => group.organizationId === workspace.id);
}
export async function selectedTeacherGroup(): Promise<GroupRoleView> {
  const groups = await teacherGroups();
  const persisted = wx.getStorageSync(KEY);
  const group = groups.find((item) => item.id === (selected || persisted)) || groups[0];
  if (!group) {
    selected = "";
    throw new Error("请先激活教师工作空间并创建学习小组");
  }
  selected = group.id;
  return group;
}
export async function selectTeacherGroup(id: string): Promise<void> {
  const groups = await teacherGroups();
  if (!groups.some((group) => group.id === id)) throw new Error("该分组不存在或授权已撤销");
  selected = id;
  wx.setStorageSync(KEY, id);
}
export async function teacherWorkspace(): Promise<GroupWorkspaceView> {
  const group = await selectedTeacherGroup();
  return command("GET_GROUP_WORKSPACE", { groupId: group.id });
}
