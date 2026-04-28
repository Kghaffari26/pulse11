import { useCallback, useState } from "react";
import useSWR, { mutate } from "swr";
import { apiClient } from "./api-client";
import type { ChatMessage } from "@/shared/models/chat";

interface ChatPageResponse {
  messages: ChatMessage[];
}

interface ChatPostResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  remainingFreeTier?: number;
}

interface ChatErrorBody {
  error: string;
  type?: "quota_exhausted" | "provider_error";
}

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((r) => r.data);

const cacheKey = (projectId: string) => `/projects/${projectId}/chat`;

export function useProjectChatHistory(projectId: string | null | undefined) {
  return useSWR<ChatPageResponse, Error>(
    projectId ? cacheKey(projectId) : null,
    fetcher,
    { refreshInterval: 0 }, // chat is push-driven via sendMessage; no polling
  );
}

export interface PendingTurn {
  userText: string;
}

export interface SendError {
  message: string;
  /** True iff the failure was a 429 quota_exhausted. */
  quotaExhausted: boolean;
}

export function useProjectChat(projectId: string) {
  const { data, isLoading, error: loadError } = useProjectChatHistory(projectId);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [sendError, setSendError] = useState<SendError | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setPending({ userText: trimmed });
      setSendError(null);
      try {
        const res = await apiClient.post<ChatPostResponse>(
          `/projects/${projectId}/chat`,
          { message: trimmed },
        );
        // Append both new messages to the cache without re-fetching.
        await mutate<ChatPageResponse>(
          cacheKey(projectId),
          (curr) => ({
            messages: [
              ...(curr?.messages ?? []),
              res.data.userMessage,
              res.data.assistantMessage,
            ],
          }),
          { revalidate: false },
        );
      } catch (err) {
        const body = (err as { response?: { data?: ChatErrorBody; status?: number } })?.response;
        const status = body?.status;
        const errorBody = body?.data;
        setSendError({
          message: errorBody?.error ?? (err as Error).message ?? "Failed to send message",
          quotaExhausted: status === 429 || errorBody?.type === "quota_exhausted",
        });
      } finally {
        setPending(null);
      }
    },
    [projectId],
  );

  const retry = useCallback(async () => {
    if (!sendError && !pending) return;
    const text = pending?.userText;
    setSendError(null);
    if (text) await sendMessage(text);
  }, [pending, sendError, sendMessage]);

  const clearChat = useCallback(async () => {
    await apiClient.delete(`/projects/${projectId}/chat`);
    await mutate<ChatPageResponse>(cacheKey(projectId), { messages: [] }, { revalidate: false });
    setPending(null);
    setSendError(null);
  }, [projectId]);

  return {
    messages: data?.messages ?? [],
    isLoading,
    loadError,
    pending,
    sendError,
    sendMessage,
    retry,
    clearChat,
  };
}
