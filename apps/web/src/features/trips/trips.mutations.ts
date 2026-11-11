import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { createTrip, deleteTrip, updateTrip } from "./trips.api";

function refreshTripQueries(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["trips"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }),
  ]);
}

export function useCreateTripMutation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: createTrip, onSuccess: () => refreshTripQueries(client) });
}

export function useUpdateTripMutation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: updateTrip, onSuccess: () => refreshTripQueries(client) });
}

export function useDeleteTripMutation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: deleteTrip, onSuccess: () => refreshTripQueries(client) });
}
