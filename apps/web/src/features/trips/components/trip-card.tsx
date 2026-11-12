import type { TripListItemOutput } from "@openmonetis/validators/trips";
import { Link } from "@tanstack/react-router";
import { MoneyValue } from "@/components/money-value";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLinkedCount, formatTripPeriod } from "../trips.presentation";

export function TripCard({ trip }: { trip: TripListItemOutput }) {
  return (
    <Link
      className="rounded-xl transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
      params={{ tripId: trip.id }}
      to="/trips/$tripId"
    >
      <Card className="h-full gap-5 p-6">
        <CardHeader className="p-0">
          <CardTitle className="truncate text-lg">{trip.name}</CardTitle>
          <CardDescription className="text-xs">{formatTripPeriod(trip)}</CardDescription>
        </CardHeader>
        <CardFooter className="mt-auto items-baseline justify-between gap-3 border-t p-0 pt-3">
          <span className="text-muted-foreground text-sm">
            {formatLinkedCount(trip.linkedCount)}
          </span>
          <MoneyValue amount={trip.netCost} className="font-medium" />
        </CardFooter>
      </Card>
    </Link>
  );
}
