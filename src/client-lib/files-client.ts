import useSWR, { mutate } from "swr";
import { apiClient } from "./api-client";
import type { ProjectFile } from "@/shared/models/files";

interface ListResponse {
  files: ProjectFile[];
  usage: { totalBytes: number };
}

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((r) => r.data);

export function useProjectFiles(projectId: string | null | undefined) {
  return useSWR<ListResponse, Error>(
    projectId ? `/projects/${projectId}/files` : null,
    fetcher,
    { refreshInterval: 60_000 },
  );
}

/**
 * Upload via XHR so we can report progress. Returns the server's ProjectFile
 * record on success, throws with a parsed error on failure.
 */
export function uploadProjectFile(
  projectId: string,
  file: File,
  opts?: { taskId?: string; onProgress?: (pct: number) => void; signal?: AbortSignal },
): Promise<ProjectFile> {
  return new Promise<ProjectFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projects/${projectId}/files`);

    if (xhr.upload && opts?.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as ProjectFile;
          await mutate(`/projects/${projectId}/files`);
          resolve(data);
        } catch {
          reject(new Error("Malformed server response"));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const j = JSON.parse(xhr.responseText) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    if (opts?.signal) {
      opts.signal.addEventListener("abort", () => xhr.abort());
    }

    const form = new FormData();
    form.append("file", file);
    if (opts?.taskId) form.append("taskId", opts.taskId);
    xhr.send(form);
  });
}

export async function deleteProjectFile(projectId: string, fileId: string) {
  await apiClient.delete(`/files/${fileId}`);
  await mutate(`/projects/${projectId}/files`);
}
