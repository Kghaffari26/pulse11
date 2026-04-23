import useSWR, { mutate } from "swr";
import { apiClient } from "./api-client";
import type { Project, ProjectInput, ProjectPatch } from "@/shared/models/projects";

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((r) => r.data);

function invalidateProjects() {
  return Promise.all([mutate("/projects"), mutate("/projects?archived=1")]);
}

export function useProjects(opts?: { includeArchived?: boolean }) {
  const key = opts?.includeArchived ? "/projects?archived=1" : "/projects";
  return useSWR<Project[], Error>(key, fetcher, { refreshInterval: 30000 });
}

export function useProject(id: string | null | undefined) {
  return useSWR<Project | undefined, Error>(
    id ? `/projects/${id}` : null,
    async () => {
      const all = await apiClient.get<Project[]>("/projects?archived=1").then((r) => r.data);
      return all.find((p) => p.id === id);
    },
    { refreshInterval: 30000 },
  );
}

export async function createProject(input: ProjectInput) {
  const res = await apiClient.post<Project>("/projects", input);
  await invalidateProjects();
  return res.data;
}

export async function updateProject(id: string, patch: ProjectPatch) {
  await apiClient.patch(`/projects/${id}`, patch);
  await invalidateProjects();
}

export async function deleteProject(id: string) {
  await apiClient.delete(`/projects/${id}`);
  await invalidateProjects();
}
