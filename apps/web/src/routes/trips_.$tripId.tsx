import { createFileRoute } from "@tanstack/react-router";
import { TripDetailPage } from "@/features/trips/components/trip-detail-page";

export const Route = createFileRoute("/trips_/$tripId")({
  head: () => ({ meta: [{ title: "Detalhe da viagem · OpenMonetis" }] }),
  component: TripDetailRoute,
});

function TripDetailRoute() {
  const { tripId } = Route.useParams();
  return <TripDetailPage tripId={tripId} />;
}
