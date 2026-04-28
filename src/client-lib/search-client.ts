import useSWR from "swr";
import { apiClient } from "./api-client";
import type { SearchResults } from "@/server-lib/search";

export interface SearchResponse {
  query: string;
  results: SearchResults;
}

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((r) => r.data);

/**
 * Hook for the command palette. Pass the trimmed query — empty/short
 * inputs return data=undefined without firing a request, mirroring the
 * server's short-query short-circuit.
 *
 * `dedupingInterval: 300` plus the palette's 200ms debounce means a typist
 * holding down a key only hits the endpoint after they pause.
 */
export function useSearch(query: string) {
  const trimmed = query.trim();
  const key = trimmed.length >= 2 ? `/search?q=${encodeURIComponent(trimmed)}` : null;

  return useSWR<SearchResponse, Error>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300,
    keepPreviousData: true,
  });
}
