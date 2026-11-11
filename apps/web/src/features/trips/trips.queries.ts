import { queryOptions } from "@tanstack/react-query";
import { getTrip, getTrips } from "./trips.api";

export const tripsQueryOptions = () => queryOptions({ queryKey: ["trips"], queryFn: getTrips });
export const tripQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["trips", id], queryFn: () => getTrip(id) });
