import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Store } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { MonthNavigation } from "@/components/month-navigation";
import { Navbar } from "@/components/navigation/navbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatEstablishmentsPeriodLabel,
  type ResolvedEstablishmentsReportSearch,
} from "../establishments-report.presentation";
import { establishmentsReportQueryOptions } from "../establishments-report.queries";
import { EstablishmentsHighlights } from "./establishments-highlights";
import { EstablishmentsList } from "./establishments-list";
import { EstablishmentsSummary } from "./establishments-summary";
import { EstablishmentsTopCategories } from "./establishments-top-categories";

const monthOptions = [3, 6, 12] as const;

type EstablishmentsReportPageProps = {
  filters: ResolvedEstablishmentsReportSearch;
  onFiltersChange: (filters: ResolvedEstablishmentsReportSearch) => void;
};

export function EstablishmentsReportPage({
  filters,
  onFiltersChange,
}: EstablishmentsReportPageProps) {
  const reportQuery = useQuery(establishmentsReportQueryOptions(filters));
  const report = reportQuery.data;

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        <section className="app-page project-container min-w-0">
          <PageHeader
            description="Onde você mais compra, quanto gasta e qual o ticket médio de cada lugar."
            eyebrow="Relatórios"
            icon={<Store aria-hidden="true" className="size-5" />}
            title="Estabelecimentos"
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
            <ToggleGroup
              aria-label="Janela de meses"
              onValueChange={(value) => {
                const months = monthOptions.find((option) => String(option) === value[0]);
                if (months) onFiltersChange({ ...filters, months });
              }}
              spacing={0}
              value={[String(filters.months)]}
              variant="outline"
            >
              {monthOptions.map((option) => (
                <ToggleGroupItem key={option} value={String(option)}>
                  {option} meses
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>

          {report ? (
            <p className="text-muted-foreground text-sm">
              {formatEstablishmentsPeriodLabel(report)}
            </p>
          ) : null}

          {reportQuery.isLoading ? <EstablishmentsReportSkeleton /> : null}

          {reportQuery.isError ? (
            <Card className="grid min-h-56 place-items-center p-6 text-center">
              <div>
                <p className="font-medium">Não foi possível carregar os estabelecimentos</p>
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
            <div aria-busy={reportQuery.isFetching} className="grid gap-6">
              <EstablishmentsSummary summary={report.summary} />
              <EstablishmentsHighlights
                establishments={report.establishments}
                summary={report.summary}
              />
              <div className="grid gap-4 xl:grid-cols-3">
                <div className="min-w-0 xl:col-span-2">
                  <EstablishmentsList establishments={report.establishments} />
                </div>
                <EstablishmentsTopCategories categories={report.topCategories} />
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </ProtectedRoute>
  );
}

function EstablishmentsReportSkeleton() {
  return (
    <div aria-label="Carregando estabelecimentos" className="grid gap-6" role="status">
      <Skeleton className="h-24" />
      <Skeleton className="h-96" />
      <span className="sr-only">Carregando relatório…</span>
    </div>
  );
}
