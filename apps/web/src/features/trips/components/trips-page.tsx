import type { CreateTripInput } from "@openmonetis/validators/trips";
import { useQuery } from "@tanstack/react-query";
import { Plane, Plus } from "lucide-react";
import { useState } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Navbar } from "@/components/navigation/navbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateTripMutation } from "../trips.mutations";
import { tripsQueryOptions } from "../trips.queries";
import { TripCard } from "./trip-card";
import { TripDialog } from "./trip-dialog";

export function TripsPage() {
  const [open, setOpen] = useState(false);
  const query = useQuery(tripsQueryOptions());
  const create = useCreateTripMutation();
  const trips = query.data ?? [];

  async function save(input: CreateTripInput) {
    await create.mutateAsync(input);
    setOpen(false);
  }

  const newTripButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus aria-hidden="true" />
      Nova viagem
    </Button>
  );

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        <section className="app-page project-container min-w-0">
          <PageHeader
            actions={newTripButton}
            description="Quanto cada viagem custou, somando cartões e contas, mesmo quando a fatura cai no mês seguinte."
            eyebrow="Organização"
            icon={<Plane className="size-5" aria-hidden="true" />}
            title="Viagens"
          />
          {query.isLoading ? (
            <div
              aria-label="Carregando viagens"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              role="status"
            >
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : null}
          {query.isError ? (
            <p role="alert" className="text-destructive text-sm">
              Não foi possível carregar as viagens.{" "}
              <Button variant="link" onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            </p>
          ) : null}
          {query.data ? (
            trips.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {trips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            ) : (
              <Card className="place-items-center gap-3 p-6 text-center" role="status">
                <CardHeader className="place-items-center p-0">
                  <CardTitle>Nenhuma viagem ainda</CardTitle>
                  <CardDescription>
                    Crie uma viagem para juntar os gastos dela em um só lugar.
                  </CardDescription>
                </CardHeader>
                {newTripButton}
              </Card>
            )
          ) : null}
        </section>
      </main>
      <TripDialog open={open} onOpenChange={setOpen} trips={trips} onSubmit={save} />
    </ProtectedRoute>
  );
}
