import { createFileRoute } from "@tanstack/react-router";
import { TripsPage } from "@/features/trips/components/trips-page";

export const Route = createFileRoute("/trips")({
  head: () => ({ meta: [{ title: "Viagens · OpenMonetis" }] }),
  component: TripsPage,
});
