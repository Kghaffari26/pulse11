import useSWR, { mutate } from "swr";
import { apiClient } from "./api-client";
import type {
  CalendarEvent,
  CategoryInput,
  CategoryPatch,
  EventCategory,
  EventInput,
  EventPatch,
} from "@/shared/models/calendar";

const fetcher = <T>(url: string) => apiClient.get<T>(url).then((r) => r.data);

function eventsKey(from: string, to: string) {
  return `/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

export function useEvents(from: string | null | undefined, to: string | null | undefined) {
  return useSWR<CalendarEvent[], Error>(
    from && to ? eventsKey(from, to) : null,
    fetcher,
    { refreshInterval: 30_000 },
  );
}

export function useEventCategories() {
  return useSWR<EventCategory[], Error>("/event-categories", fetcher, {
    refreshInterval: 60_000,
  });
}

/**
 * Invalidate every cached /events window — any view currently subscribed
 * re-fetches and picks up the change.
 */
async function invalidateAllEventWindows() {
  await mutate(
    (key) => typeof key === "string" && key.startsWith("/events?"),
    undefined,
    { revalidate: true },
  );
}

export async function createEvent(input: EventInput) {
  // Optimistic: no single cache to patch (range-keyed), so just trigger revalidate.
  const res = await apiClient.post<CalendarEvent>("/events", input);
  await invalidateAllEventWindows();
  return res.data;
}

export async function updateEvent(id: string, patch: EventPatch) {
  await apiClient.patch(`/events/${id}`, patch);
  await invalidateAllEventWindows();
}

export async function deleteEvent(id: string) {
  await apiClient.delete(`/events/${id}`);
  await invalidateAllEventWindows();
}

export async function createCategory(input: CategoryInput) {
  const res = await apiClient.post<EventCategory>("/event-categories", input);
  await mutate("/event-categories");
  return res.data;
}

export async function updateCategory(id: string, patch: CategoryPatch) {
  await apiClient.patch(`/event-categories/${id}`, patch);
  await mutate("/event-categories");
  // Events don't change but their rendered color does; revalidate windows.
  await invalidateAllEventWindows();
}

export async function deleteCategory(id: string, reassignTo?: string | null) {
  const query = reassignTo === undefined ? "" : `?reassignTo=${encodeURIComponent(reassignTo ?? "")}`;
  await apiClient.delete(`/event-categories/${id}${query}`);
  await mutate("/event-categories");
  await invalidateAllEventWindows();
}
