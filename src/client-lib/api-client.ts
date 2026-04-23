import axios from "axios";
import useSWR, { mutate } from "swr";
import type { Task, TaskInput, UserPrefs } from "@/shared/models/pulse";

export const apiClient = axios.create({ baseURL: "/api" });

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((res) => res.data);

export function useTasks() {
  return useSWR<Task[], Error>("/tasks", fetcher, { refreshInterval: 30000 });
}

export function useArchivedTasks() {
  return useSWR<Task[], Error>("/tasks?status=archived", fetcher, { refreshInterval: 60000 });
}

async function invalidateTaskLists() {
  await Promise.all([
    mutate("/tasks"),
    mutate("/tasks?status=active"),
    mutate("/tasks?status=archived"),
  ]);
}

export function usePrefs() {
  return useSWR<UserPrefs, Error>("/prefs", fetcher);
}

export async function createTask(input: TaskInput) {
  const res = await apiClient.post<Task>("/tasks", input);
  await mutate("/tasks");
  return res.data;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  await apiClient.patch(`/tasks/${id}`, patch);
  await invalidateTaskLists();
}

export function useTaskFiles(taskId: string | null | undefined) {
  return useSWR<import("@/shared/models/files").ProjectFile[], Error>(
    taskId ? `/tasks/${taskId}/files` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );
}

export async function deleteTask(id: string) {
  await apiClient.delete(`/tasks/${id}`);
  await mutate("/tasks");
}

/**
 * Mark a task complete via the unified view — the DB trigger sets
 * status='completed' and completed_at=NOW().
 */
export async function completeTask(id: string) {
  await apiClient.post(`/tasks/${id}/complete`);
  await invalidateTaskLists();
}

/**
 * Clear completion (undo). The trigger nulls completed_at.
 */
export async function undoCompleteTask(id: string) {
  await apiClient.delete(`/tasks/${id}/complete`);
  await invalidateTaskLists();
}

export async function addSubtask(taskId: string, title: string) {
  await apiClient.post(`/tasks/${taskId}/subtasks`, { title });
  await mutate("/tasks");
}

export async function updateSubtask(id: string, patch: { done?: boolean; title?: string }) {
  await apiClient.patch(`/subtasks/${id}`, patch);
  await mutate("/tasks");
}

export async function deleteSubtask(id: string) {
  await apiClient.delete(`/subtasks/${id}`);
  await mutate("/tasks");
}

export async function regenerateSessions(taskId: string, opts?: { workBlock?: number; breakBlock?: number }) {
  await apiClient.post(`/tasks/${taskId}/sessions`, opts ?? {});
  await mutate("/tasks");
}

/**
 * Create an ad-hoc completed focus session (used when no pre-generated session exists).
 * The server adds durationMinutes to the task's completed_minutes.
 */
export async function createSession(
  taskId: string,
  data: { startedAt: string; durationMinutes: number; completed: true },
) {
  await apiClient.post(`/tasks/${taskId}/sessions`, data);
  await mutate("/tasks");
}

export async function completeSession(id: string, taskId: string, minutes: number) {
  await apiClient.patch(`/sessions/${id}`, { completed: true, taskId, addCompletedMinutes: minutes });
  await mutate("/tasks");
}

export async function updatePrefs(
  patch: Partial<Pick<UserPrefs, "mode" | "aggressiveAlerts" | "notificationsEnabled">>,
) {
  await apiClient.patch("/prefs", patch);
  await mutate("/prefs");
}
