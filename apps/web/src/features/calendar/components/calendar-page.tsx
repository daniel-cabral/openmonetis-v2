import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { MonthNavigation } from "@/components/month-navigation";
import { Navbar } from "@/components/navigation/navbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { accountsQueryOptions } from "@/features/accounts/accounts.queries";
import { cardsQueryOptions } from "@/features/cards/cards.queries";
import { categoriesQueryOptions } from "@/features/categories/categories.queries";
import { peopleQueryOptions } from "@/features/people/people.queries";
import { TransactionDialog } from "@/features/transactions/components/transaction-dialog";
import { calendarQueryOptions } from "../calendar.queries";
import { CalendarDayDialog } from "./calendar-day-dialog";
import { CalendarGrid } from "./calendar-grid";
import { CalendarLegend } from "./calendar-legend";

type CalendarPageProps = {
  period: string;
  onPeriodChange: (period: string) => void;
};

export function CalendarPage({ onPeriodChange, period }: CalendarPageProps) {
  const queryClient = useQueryClient();
  const calendarQuery = useQuery(calendarQueryOptions(period));
  const accountsQuery = useQuery(accountsQueryOptions());
  const cardsQuery = useQuery(cardsQueryOptions());
  const categoriesQuery = useQuery(categoriesQueryOptions());
  const peopleQuery = useQuery(peopleQueryOptions());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const days = calendarQuery.data?.days;
  const selectedDay = days?.find((day) => day.date === selectedDate) ?? null;

  // Waits for the form options (cached or retried) so a click made while they load opens the
  // form, and a failure is reported on that same click, as the dashboard quick actions do.
  async function openCreate(date: string) {
    try {
      await Promise.all([
        queryClient.ensureQueryData(accountsQueryOptions()),
        queryClient.ensureQueryData(cardsQueryOptions()),
        queryClient.ensureQueryData(categoriesQueryOptions()),
        queryClient.ensureQueryData(peopleQueryOptions()),
      ]);
      setCreateDate(date);
    } catch {
      toast.error("Não foi possível preparar o formulário.", {
        description: "Verifique sua conexão e tente novamente.",
      });
    }
  }

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        <section className="app-page project-container min-w-0">
          <PageHeader
            actions={<MonthNavigation compact onPeriodChange={onPeriodChange} period={period} />}
            description="Lançamentos, parcelas, boletos e faturas do mês."
            eyebrow="Planejamento"
            icon={<CalendarDays aria-hidden="true" className="size-5" />}
            title="Calendário"
          />

          <CalendarLegend />

          {calendarQuery.isLoading ? <CalendarSkeleton /> : null}

          {calendarQuery.isError ? (
            <Card className="grid min-h-56 place-items-center p-6 text-center">
              <div>
                <p className="font-medium">Não foi possível carregar o calendário</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Verifique sua conexão e tente novamente.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => calendarQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw aria-hidden="true" />
                  Tentar novamente
                </Button>
              </div>
            </Card>
          ) : null}

          {days && !calendarQuery.isError ? (
            <div aria-busy={calendarQuery.isFetching}>
              <CalendarGrid
                days={days}
                onCreate={(date) => void openCreate(date)}
                onOpenDay={setSelectedDate}
              />
            </div>
          ) : null}

          <CalendarDayDialog
            day={selectedDay}
            onCreate={(date) => {
              setSelectedDate(null);
              void openCreate(date);
            }}
            onOpenChange={(open) => {
              if (!open) setSelectedDate(null);
            }}
          />

          {createDate ? (
            <TransactionDialog
              accounts={accountsQuery.data ?? []}
              cards={cardsQuery.data ?? []}
              categories={categoriesQuery.data ?? []}
              createDefaults={{ purchaseDate: createDate }}
              key={createDate}
              onOpenChange={(open) => {
                if (!open) setCreateDate(null);
              }}
              open
              people={peopleQuery.data ?? []}
              transaction={null}
            />
          ) : null}
        </section>
      </main>
    </ProtectedRoute>
  );
}

function CalendarSkeleton() {
  return (
    <div aria-label="Carregando calendário" className="grid gap-4" role="status">
      <Skeleton className="h-96" />
      <span className="sr-only">Carregando calendário…</span>
    </div>
  );
}
