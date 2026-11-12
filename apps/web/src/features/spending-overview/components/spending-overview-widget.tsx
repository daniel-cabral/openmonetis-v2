import type { SpendingOverviewOutput } from "@openmonetis/validators/spending-overview";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCw, Wallet } from "lucide-react";
import { useState } from "react";
import { MoneyValue } from "@/components/money-value";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import { DashboardWidgetEmptyState } from "@/features/dashboard/components/dashboard-widget-empty-state";
import { dashboardWidgetFooterNavigationLinkClassName } from "@/features/dashboard/components/dashboard-widget-footer-link";
import { DashboardWidgetListSheet } from "@/features/dashboard/components/dashboard-widget-list-sheet";
import { DashboardWidgetRow } from "@/features/dashboard/components/dashboard-widget-row";
import { EstablishmentLogo } from "@/features/establishments/components/establishment-logo";
import { formatEstablishmentPurchases, formatPurchaseDay } from "../spending-overview.presentation";
import { spendingOverviewQueryOptions } from "../spending-overview.queries";

const visibleRowLimit = 5;

type PanoramaView = "expenses" | "establishments";

type Expense = SpendingOverviewOutput["topExpenses"][number];
type Establishment = SpendingOverviewOutput["topEstablishments"][number];

export function SpendingOverviewWidget({ period }: { period: string }) {
  const query = useQuery(spendingOverviewQueryOptions(period));
  const [view, setView] = useState<PanoramaView>("expenses");
  const [listOpen, setListOpen] = useState(false);
  const expenses = query.data?.topExpenses ?? [];
  const establishments = query.data?.topEstablishments ?? [];
  const hiddenCount = Math.max(
    0,
    (view === "expenses" ? expenses.length : establishments.length) - visibleRowLimit,
  );
  const hiddenNoun = view === "expenses" ? "lançamento" : "estabelecimento";
  const hiddenRows =
    view === "expenses"
      ? expenses
          .slice(visibleRowLimit)
          .map((expense) => <ExpenseRow expense={expense} key={expense.key} />)
      : establishments
          .slice(visibleRowLimit)
          .map((establishment) => (
            <EstablishmentRow establishment={establishment} key={establishment.name} />
          ));

  return (
    <DashboardWidget
      description="Maiores gastos e lugares onde você mais compra no mês"
      footer={
        query.data ? (
          <div className="flex items-center justify-between gap-3">
            {hiddenCount > 0 ? (
              <DashboardWidgetListSheet
                description="Demais itens do panorama de gastos do mês."
                onOpenChange={setListOpen}
                open={listOpen}
                title={view === "expenses" ? "Top gastos" : "Estabelecimentos"}
                triggerLabel={`Ver mais ${hiddenCount} ${hiddenCount === 1 ? hiddenNoun : `${hiddenNoun}s`}`}
              >
                <ul className="divide-y">{hiddenRows}</ul>
              </DashboardWidgetListSheet>
            ) : null}
            <Link
              className={dashboardWidgetFooterNavigationLinkClassName}
              search={{ period }}
              to="/reports/establishments"
            >
              Ver relatório de estabelecimentos <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        ) : undefined
      }
      icon={<Wallet aria-hidden="true" />}
      title="Panorama de gastos"
    >
      {query.isLoading ? <SpendingOverviewLoading /> : null}
      {query.isError ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <p className="font-medium text-sm">Não foi possível carregar o panorama</p>
            <Button
              className="mt-3"
              onClick={() => void query.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw data-icon="inline-start" />
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : null}
      {query.data && !query.isError ? (
        <Tabs
          className="flex-1"
          onValueChange={(value) => setView(value as PanoramaView)}
          value={view}
        >
          <TabsList className="w-full" variant="line">
            <TabsTrigger value="expenses">Top gastos</TabsTrigger>
            <TabsTrigger value="establishments">Estabelecimentos</TabsTrigger>
          </TabsList>
          <TabsContent value="expenses">
            {expenses.length === 0 ? (
              <DashboardWidgetEmptyState
                description="Quando houver despesas registradas, elas aparecerão aqui."
                icon={<Wallet aria-hidden="true" />}
                title="Nenhuma despesa encontrada"
              />
            ) : (
              <ul className="divide-y">
                {expenses.slice(0, visibleRowLimit).map((expense) => (
                  <ExpenseRow expense={expense} key={expense.key} />
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="establishments">
            {establishments.length === 0 ? (
              <DashboardWidgetEmptyState
                description="Quando houver despesas registradas, elas aparecerão aqui."
                icon={<Wallet aria-hidden="true" />}
                title="Nenhum estabelecimento encontrado"
              />
            ) : (
              <ul className="divide-y">
                {establishments.slice(0, visibleRowLimit).map((establishment) => (
                  <EstablishmentRow establishment={establishment} key={establishment.name} />
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      ) : null}
    </DashboardWidget>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  return (
    <DashboardWidgetRow>
      <EstablishmentLogo categoryIcon={expense.categoryIcon} editable={false} name={expense.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm" title={expense.name}>
          {expense.name}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {formatPurchaseDay(expense.purchaseDate)}
        </p>
      </div>
      <MoneyValue amount={expense.amount} className="shrink-0 font-medium text-sm" />
    </DashboardWidgetRow>
  );
}

function EstablishmentRow({ establishment }: { establishment: Establishment }) {
  return (
    <DashboardWidgetRow>
      <EstablishmentLogo
        categoryIcon={establishment.categoryIcon}
        editable={false}
        name={establishment.name}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm" title={establishment.name}>
          {establishment.name}
        </p>
        <p className="mt-0.5 truncate text-muted-foreground text-xs">
          {formatEstablishmentPurchases(establishment.count)}
        </p>
      </div>
      <MoneyValue amount={establishment.total} className="shrink-0 font-medium text-sm" />
    </DashboardWidgetRow>
  );
}

function SpendingOverviewLoading() {
  return (
    <div aria-label="Carregando panorama de gastos" className="grid gap-3" role="status">
      {["first", "second", "third", "fourth"].map((key) => (
        <div className="flex h-16 items-center gap-3" key={key}>
          <Skeleton className="size-8" />
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
