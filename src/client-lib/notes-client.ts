import useSWR, { mutate } from "swr";
import { apiClient } from "./api-client";
import type { Note, NoteCreateInput, NotePatch } from "@/shared/models/notes";

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((r) => r.data);

export function useProjectNotes(projectId: string | null | undefined) {
  return useSWR<Note[], Error>(
    projectId ? `/projects/${projectId}/notes` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );
}

export async function createNote(projectId: string, input: NoteCreateInput) {
  const res = await apiClient.post<Note>(`/projects/${projectId}/notes`, input);
  await mutate(`/projects/${projectId}/notes`);
  return res.data;
}

export async function updateNote(projectId: string, noteId: string, patch: NotePatch) {
  await apiClient.patch(`/notes/${noteId}`, patch);
  await mutate(`/projects/${projectId}/notes`);
}

export async function deleteNote(projectId: string, noteId: string) {
  await apiClient.delete(`/notes/${noteId}`);
  await mutate(`/projects/${projectId}/notes`);
}
