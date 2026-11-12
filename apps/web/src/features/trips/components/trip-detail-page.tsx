import type { CreateTripInput } from "@openmonetis/validators/trips";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { EntityLoadError } from "@/components/entity-load-error";
import {
  FinancialSummaryAction,
  FinancialSummaryHeader,
} from "@/components/financial-summary-header";
import { MoneyValue } from "@/components/money-value";
import { Navbar } from "@/components/navigation/navbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteTripMutation, useUpdateTripMutation } from "../trips.mutations";
import { formatTripPeriod } from "../trips.presentation";
import { tripQueryOptions, tripsQueryOptions } from "../trips.queries";
import { TripBreakdownCard } from "./trip-breakdown-card";
import { TripDialog } from "./trip-dialog";
import { TripLinkedList } from "./trip-linked-list";
import { TripSuggestions } from "./trip-suggestions";

export function TripDetailPage({ tripId }: { tripId: string }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const query = useQuery(tripQueryOptions(tripId));
  const tripsQuery = useQuery(tripsQueryOptions());
  const update = useUpdateTripMutation();
  const remove = useDeleteTripMutation();
  const navigate = useNavigate();
  const detail = query.data;

  async function save(input: CreateTripInput) {
    await update.mutateAsync({ id: tripId, input });
    setEditing(false);
  }

  async function removeTrip() {
    try {
      await remove.mutateAsync(tripId);
      void navigate({ to: "/trips" });
    } catch {
      toast.error("Não foi possível excluir a viagem.");
    }
  }

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        {query.isLoading ? <TripDetailLoading /> : null}
        {query.isError ? (
          <EntityLoadError
            error={query.error}
            entity="a viagem"
            onRetry={() => void query.refetch()}
          >
            <TripDetailNotFound />
          </EntityLoadError>
        ) : null}
        {detail ? (
          <section className="app-page project-container min-w-0">
            <FinancialSummaryHeader
              actions={
                <>
                  <FinancialSummaryAction onClick={() => setEditing(true)} type="button">
                    Editar
                  </FinancialSummaryAction>
                  <FinancialSummaryAction onClick={() => setRemoving(true)} type="button">
                    Excluir
                  </FinancialSummaryAction>
                </>
              }
              eyebrow="Viagem"
              identity={null}
              metrics={[
                {
                  key: "expenses",
                  label: "Despesas",
                  icon: <ArrowUpRight aria-hidden="true" className="size-3.5" />,
                  value: <MoneyValue amount={detail.summary.expenses} />,
                },
                {
                  key: "reimbursements",
                  label: "Reembolsos",
                  icon: <ArrowDownLeft aria-hidden="true" className="size-3.5" />,
                  value: <MoneyValue amount={detail.summary.reimbursements} />,
                },
                {
                  key: "linked",
                  label: "Lançamentos",
                  icon: <Receipt aria-hidden="true" className="size-3.5" />,
                  value: detail.linked.length,
                },
              ]}
              primaryLabel="Custo líquido"
              primaryValue={<MoneyValue amount={detail.summary.netCost} />}
              subtitle={
                <>
                  <span>{formatTripPeriod(detail.trip)}</span>
                  {detail.trip.note ? <span>· {detail.trip.note}</span> : null}
                </>
              }
              title={detail.trip.name}
              variant="soft"
            />
            <section className="grid gap-6 xl:grid-cols-3">
              <TripBreakdownCard
                items={detail.summary.byCategory}
                showShare
                title="Por categoria"
              />
              <TripBreakdownCard items={detail.summary.bySource} title="Por cartão ou conta" />
              <TripBreakdownCard items={detail.summary.byPerson} title="Por pessoa" />
            </section>
            <TripLinkedList entries={detail.linked} tripId={tripId} />
            <TripSuggestions tripId={tripId} />
          </section>
        ) : null}
      </main>
      <TripDialog
        open={editing}
        onOpenChange={setEditing}
        trip={detail?.trip ?? null}
        trips={tripsQuery.data ?? []}
        onSubmit={save}
      />
      <AlertDialog
        open={removing}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setRemoving(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir viagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Os lançamentos continuam existindo, só deixam de pertencer a esta viagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={async (event) => {
                event.preventDefault();
                await removeTrip();
              }}
            >
              {remove.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}

function TripDetailLoading() {
  return (
    <section
      aria-label="Carregando viagem"
      className="app-page project-container min-w-0 grid gap-6"
      role="status"
    >
      <Skeleton className="h-48" />
      <Skeleton className="h-40" />
    </section>
  );
}

function TripDetailNotFound() {
  return (
    <section className="app-page project-container">
      <p className="text-destructive text-sm" role="alert">
        Viagem não encontrada.
      </p>
    </section>
  );
}
