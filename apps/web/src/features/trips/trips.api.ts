import type {
  CreateTripInput,
  TripDetailOutput,
  TripListItemOutput,
  TripOutput,
  TripSuggestionsPageOutput,
  UpdateTripInput,
} from "@openmonetis/validators/trips";
import { requestApi } from "@/lib/api-client";

export const getTrips = () => requestApi<TripListItemOutput[]>("/trips");
export const getTrip = (id: string) => requestApi<TripDetailOutput>(`/trips/${id}`);
export const createTrip = (input: CreateTripInput) =>
  requestApi<TripOutput>("/trips", { method: "POST", body: JSON.stringify(input) });
export const updateTrip = ({ id, input }: { id: string; input: UpdateTripInput }) =>
  requestApi<TripOutput>(`/trips/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteTrip = (id: string) =>
  requestApi<{ id: string }>(`/trips/${id}`, { method: "DELETE" });
export const getTripSuggestions = (id: string, query: { page: number; origin: string }) =>
  requestApi<TripSuggestionsPageOutput>(
    `/trips/${id}/suggestions?${new URLSearchParams({ page: String(query.page), origin: query.origin })}`,
  );
export const linkTripTransactions = ({ id, ids }: { id: string; ids: string[] }) =>
  requestApi<{ ids: string[] }>(`/trips/${id}/links`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
export const unlinkTripTransactions = ({ id, ids }: { id: string; ids: string[] }) =>
  requestApi<{ ids: string[] }>(`/trips/${id}/links/remove`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
