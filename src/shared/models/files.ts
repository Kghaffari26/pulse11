export interface ProjectFile {
  id: string;
  projectId: string;
  taskId: string | null;
  userEmail: string;
  filename: string;
  blobUrl: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedAt: string;
}

export const FILE_SIZE_MAX = 20 * 1024 * 1024; // 20 MB per file
export const USER_QUOTA_MAX = 500 * 1024 * 1024; // 500 MB per user

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Returns a human-readable error if the file size is invalid or over cap,
 * otherwise null. Size === 0 is rejected because an empty file is almost
 * always a user mistake.
 */
export function validateFileSize(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Empty or invalid file";
  if (bytes > FILE_SIZE_MAX) return `File exceeds ${formatBytes(FILE_SIZE_MAX)} per-file cap`;
  return null;
}

export function willExceedQuota(currentTotalBytes: number, incomingBytes: number): boolean {
  return currentTotalBytes + incomingBytes > USER_QUOTA_MAX;
}

export function quotaError(currentTotalBytes: number): string {
  return `Upload would exceed ${formatBytes(USER_QUOTA_MAX)} user quota (current ${formatBytes(currentTotalBytes)})`;
}
