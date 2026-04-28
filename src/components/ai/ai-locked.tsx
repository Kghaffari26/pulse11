"use client";

import Link from "next/link";
import useSWR from "swr";
import { KeyRound, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/client-lib/api-client";

type AiStatus =
  | { tier: "byok"; locked: false; remaining: null; limit: null }
  | { tier: "free"; locked: boolean; remaining: number; limit: number };

const fetcher = (url: string) => apiClient.get<AiStatus>(url).then((r) => r.data);

export function useAiStatus() {
  return useSWR<AiStatus, Error>("/ai/status", fetcher, { refreshInterval: 60_000 });
}

interface Props {
  children: React.ReactNode;
  /** Custom lock UI; defaults to a compact inline CTA. */
  fallback?: React.ReactNode;
}

/**
 * Wraps an AI-backed trigger. Renders `children` when the caller has
 * remaining quota (free tier with >0 left, or BYOK). When the free tier
 * is exhausted, renders the fallback CTA pointing at /settings?tab=api-key.
 *
 * This primitive is the single source of truth for "AI disabled" surfaces
 * so Wave 4B features can drop it in without recomputing state.
 */
export function AILocked({ children, fallback }: Props) {
  const { data, isLoading } = useAiStatus();

  // Render children optimistically while loading so the UI doesn't flicker;
  // the server enforces the cap regardless.
  if (isLoading || !data || !data.locked) return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/30 p-3 text-xs">
      <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">
        Monthly AI limit reached. Add your own Gemini key for unlimited access.
      </span>
      <Button asChild size="sm" variant="outline">
        <Link href="/settings?tab=api-key">
          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          Add API key
        </Link>
      </Button>
    </div>
  );
}
