import { queryOptions } from "@tanstack/react-query";
import { getTrip, getTripSuggestions, getTrips } from "./trips.api";

export const tripsQueryOptions = () => queryOptions({ queryKey: ["trips"], queryFn: getTrips });
export const tripQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["trips", id], queryFn: () => getTrip(id) });
export const tripSuggestionsQueryOptions = (id: string, query: { page: number; origin: string }) =>
  queryOptions({
    queryKey: ["trips", id, "suggestions", query],
    queryFn: () => getTripSuggestions(id, query),
  });
