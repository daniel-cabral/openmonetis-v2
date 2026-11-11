import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTrip,
  deleteTrip,
  linkTripTransactions,
  unlinkTripTransactions,
  updateTrip,
} from "./trips.api";

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

export function useLinkTripTransactionsMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: linkTripTransactions,
    onSuccess: () => refreshTripQueries(client),
  });
}

export function useUnlinkTripTransactionsMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: unlinkTripTransactions,
    onSuccess: () => refreshTripQueries(client),
  });
}
