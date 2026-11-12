import { useQuery } from "@tanstack/react-query";
import { CreditCard, RefreshCw } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { MonthNavigation } from "@/components/month-navigation";
import { Navbar } from "@/components/navigation/navbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResolvedCardUsageReportSearch } from "../card-usage-report.presentation";
import { cardUsageReportQueryOptions } from "../card-usage-report.queries";
import { CardUsageList } from "./card-usage-list";
import { CardUsageSummary } from "./card-usage-summary";

type CardUsageReportPageProps = {
  filters: ResolvedCardUsageReportSearch;
  onFiltersChange: (filters: ResolvedCardUsageReportSearch) => void;
};

export function CardUsageReportPage({ filters, onFiltersChange }: CardUsageReportPageProps) {
  const reportQuery = useQuery(
    cardUsageReportQueryOptions({ period: filters.period, cardId: filters.card }),
  );
  const report = reportQuery.data;

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        <section className="app-page project-container min-w-0">
          <PageHeader
            description="Quanto do limite de cada cartão você usou no mês e como isso mudou."
            eyebrow="Relatórios"
            icon={<CreditCard aria-hidden="true" className="size-5" />}
            title="Uso de cartões"
          />

          <section
            aria-label="Filtros do relatório"
            className="flex min-w-0 flex-wrap items-center gap-3"
          >
            <MonthNavigation
              compact
              onPeriodChange={(period) => onFiltersChange({ ...filters, period })}
              period={filters.period}
            />
          </section>

          {reportQuery.isLoading ? <CardUsageReportSkeleton /> : null}

          {reportQuery.isError ? (
            <Card className="grid min-h-56 place-items-center p-6 text-center">
              <div>
                <p className="font-medium">Não foi possível carregar o uso dos cartões</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Verifique sua conexão e tente novamente.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => reportQuery.refetch()}
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

          {report && !reportQuery.isError ? (
            report.cards.length ? (
              <div aria-busy={reportQuery.isFetching} className="grid gap-6">
                <CardUsageSummary summary={report.summary} />
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="min-w-0">
                    <CardUsageList
                      cards={report.cards}
                      onSelect={(cardId) => onFiltersChange({ ...filters, card: cardId })}
                      selectedCardId={report.selectedCardId}
                    />
                  </div>
                  <div className="min-w-0 lg:col-span-2" />
                </div>
              </div>
            ) : (
              <Card className="grid min-h-56 place-items-center p-6 text-center">
                <div>
                  <p className="font-medium">Nenhum cartão encontrado</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Cadastre um cartão ativo para acompanhar o uso do limite.
                  </p>
                </div>
              </Card>
            )
          ) : null}
        </section>
      </main>
    </ProtectedRoute>
  );
}

function CardUsageReportSkeleton() {
  return (
    <div aria-label="Carregando uso dos cartões" className="grid gap-6" role="status">
      <Skeleton className="h-24" />
      <Skeleton className="h-96" />
      <span className="sr-only">Carregando relatório…</span>
    </div>
  );
}
