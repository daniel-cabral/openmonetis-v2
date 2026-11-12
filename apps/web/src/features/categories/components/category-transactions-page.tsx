import { getCurrentPeriodInBrazil } from "@openmonetis/shared/date-time";
import type { CategoryOutput } from "@openmonetis/validators/categories";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChartNoAxesCombined, Tags, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { EntityLoadError } from "@/components/entity-load-error";
import { FinancialSummaryHeader } from "@/components/financial-summary-header";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { MoneyValue } from "@/components/money-value";
import { Navbar } from "@/components/navigation/navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTrendPercentage } from "@/features/category-trends/category-trends.presentation";
import { categoryTrendsQueryOptions } from "@/features/category-trends/category-trends.queries";
import { peopleQueryOptions } from "@/features/people/people.queries";
import { TransactionsContainer } from "@/features/transactions/components/transactions-container";
import type { TransactionsSearch } from "@/features/transactions/transactions.presentation";
import { formatPeriod } from "@/lib/period-presentation";
import { categoryTypeLabels, getCategoryLabel } from "../categories.presentation";
import { categoriesQueryOptions, categoryQueryOptions } from "../categories.queries";
import { CategoryIcon } from "../category-icons";
import { SubcategoryBreakdown } from "./subcategory-breakdown";

export type CategoryTransactionsSearch = TransactionsSearch & {
  personScope?: string;
  subcategory?: string;
};

type CategoryTransactionsPageProps = {
  categoryId: string;
  search: CategoryTransactionsSearch;
  onSearchChange: (search: Partial<CategoryTransactionsSearch>) => void;
};

export function CategoryTransactionsPage({
  categoryId,
  search,
  onSearchChange,
}: CategoryTransactionsPageProps) {
  const categoryQuery = useQuery(categoryQueryOptions(categoryId));
  const categoriesQuery = useQuery(categoriesQueryOptions());
  const period = search.period ?? getCurrentPeriodInBrazil();
  const selectedPersonScope = search.personScope ?? "admin";
  const subcategories = (categoriesQuery.data ?? []).filter((item) => item.parentId === categoryId);
  const activeSubcategory = resolveActiveSubcategory(search.subcategory, subcategories);

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        {categoryQuery.isLoading ? <CategoryTransactionsLoading /> : null}
        {categoryQuery.isError ? (
          <EntityLoadError
            error={categoryQuery.error}
            entity="a categoria"
            onRetry={() => void categoryQuery.refetch()}
          >
            <CategoryTransactionsNotFound />
          </EntityLoadError>
        ) : null}
        {categoryQuery.data ? (
          <TransactionsContainer
            onSearchChange={onSearchChange}
            scope={getCategoryTransactionsScope(
              categoryQuery.data,
              period,
              selectedPersonScope,
              (personScope) =>
                onSearchChange({
                  personScope: personScope === "admin" ? undefined : personScope,
                  people: undefined,
                  page: undefined,
                }),
              activeSubcategory,
              subcategories.length ? (
                <SubcategoryBreakdown
                  activeSubcategory={activeSubcategory}
                  categoryId={categoryId}
                  onSelect={(subcategory) => onSearchChange({ subcategory, page: undefined })}
                  period={period}
                  personScope={selectedPersonScope}
                />
              ) : undefined,
            )}
            search={search}
          />
        ) : null}
      </main>
    </ProtectedRoute>
  );
}

function getCategoryTransactionsScope(
  category: CategoryOutput,
  period: string,
  personScope: string,
  onPersonScopeChange: (value: string) => void,
  activeSubcategory: string | undefined,
  subcategoryBreakdown: ReactNode,
) {
  const periodLabel = formatPeriod(period);

  return {
    adminPersonOnly: personScope === "admin",
    personIds: personScope === "all" ? [] : personScope === "admin" ? undefined : [personScope],
    categoryIds:
      activeSubcategory && activeSubcategory !== "none" ? [activeSubcategory] : [category.id],
    exactCategories: activeSubcategory === "none",
    createDefaults: { categoryId: category.id },
    createTypes: [category.type],
    header: {
      breadcrumbs: [
        { label: "Visão geral", href: "/dashboard" },
        { label: "Organização" },
        { label: "Categorias", href: "/categories" },
        { label: getCategoryLabel(category) },
      ],
      summary: (
        <CategoryTransactionsSummary
          category={category}
          period={period}
          periodLabel={periodLabel}
          personScope={personScope}
          onPersonScopeChange={onPersonScopeChange}
          subcategoryBreakdown={subcategoryBreakdown}
        />
      ),
    },
    hiddenFilters: ["type", "category", "person"] as const,
    periodNavigationPlacement: "afterPageHeader" as const,
  };
}

function CategoryTransactionsSummary({
  category,
  period,
  periodLabel,
  personScope,
  onPersonScopeChange,
  subcategoryBreakdown,
}: {
  category: CategoryOutput;
  period: string;
  periodLabel: string;
  personScope: string;
  onPersonScopeChange: (value: string) => void;
  subcategoryBreakdown: ReactNode;
}) {
  const peopleQuery = useQuery(peopleQueryOptions());
  const people = peopleQuery.data ?? [];
  const options = [
    { value: "admin", label: "Você", person: people.find((person) => person.role === "admin") },
    ...people
      .filter((person) => person.role !== "admin")
      .map((person) => ({
        value: person.id,
        label: person.name,
        person,
      })),
    { value: "all", label: "Todas as pessoas", person: undefined },
  ];
  const selected = options.find((option) => option.value === personScope);
  const renderOption = (option: (typeof options)[number]) => (
    <span className="flex min-w-0 items-center gap-2">
      {option.value === "all" ? (
        <Users aria-hidden="true" className="size-5 shrink-0" />
      ) : (
        <Avatar size="sm">
          <AvatarImage src={option.person?.avatarUrl ?? undefined} alt="" />
          <AvatarFallback>{(option.person?.name ?? option.label).slice(0, 1)}</AvatarFallback>
        </Avatar>
      )}
      <span className="truncate">{option.label}</span>
    </span>
  );
  const isIncome = category.type === "income";
  const trendsQuery = useQuery({
    ...categoryTrendsQueryOptions({
      categoryIds: [category.id],
      endPeriod: period,
      startPeriod: period,
      personScope,
    }),
    placeholderData: undefined,
  });
  const categoryTrend = trendsQuery.data?.categories.find(
    (item) => item.categoryId === category.id,
  );
  const periodTrend = categoryTrend?.values.find((value) => value.period === period);
  const categoryAmount = periodTrend?.totalAmount ?? 0;

  return (
    <FinancialSummaryHeader
      actions={
        <Select
          value={personScope}
          onValueChange={(value) => {
            if (value && options.some((option) => option.value === value))
              onPersonScopeChange(value);
          }}
        >
          <SelectTrigger aria-label="Considerar lançamentos de" className="w-full sm:w-48">
            <SelectValue>{selected ? renderOption(selected) : "Pessoa indisponível"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {renderOption(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      details={subcategoryBreakdown}
      eyebrow={`Histórico de ${periodLabel}`}
      identity={
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-current/10">
          <CategoryIcon className="size-6" name={category.icon} />
        </span>
      }
      metrics={[
        {
          icon: <Tags aria-hidden="true" className="size-3.5" />,
          label: "Tipo",
          value: categoryTypeLabels[category.type],
        },
        {
          icon: <CalendarDays aria-hidden="true" className="size-3.5" />,
          label: "Mês",
          value: periodLabel,
        },
        {
          icon: <ChartNoAxesCombined aria-hidden="true" className="size-3.5" />,
          label: "Comparado ao mês anterior",
          value: trendsQuery.isLoading
            ? "Carregando..."
            : trendsQuery.isError || !periodTrend
              ? "Indisponível"
              : formatTrendPercentage(periodTrend.changePercentage, periodTrend.changeKind),
        },
      ]}
      primaryLabel={
        personScope === "admin"
          ? isIncome
            ? "Suas receitas no período"
            : "Suas despesas no período"
          : `${isIncome ? "Receitas" : "Despesas"} de ${selected?.label ?? "pessoa indisponível"}`
      }
      primaryValue={
        trendsQuery.isLoading ? (
          <Skeleton className="h-10 w-48 bg-current/20 before:via-current/20" />
        ) : trendsQuery.isError ? (
          <span className="text-xl">Indisponível</span>
        ) : (
          <MoneyValue amount={categoryAmount} />
        )
      }
      subtitle={`${category.parentId ? "Subcategoria" : "Categoria e suas subcategorias"} de ${categoryTypeLabels[category.type].toLocaleLowerCase("pt-BR")} · ${selected?.label ?? "Pessoa indisponível"}`}
      title={getCategoryLabel(category)}
      variant="soft"
    />
  );
}

function resolveActiveSubcategory(
  subcategory: string | undefined,
  subcategories: CategoryOutput[],
) {
  if (!subcategories.length) return undefined;
  if (subcategory === "none") return subcategory;
  return subcategories.some((item) => item.id === subcategory) ? subcategory : undefined;
}

function CategoryTransactionsLoading() {
  return (
    <section className="app-page project-container">
      <p className="text-muted-foreground text-sm">Carregando histórico da categoria...</p>
    </section>
  );
}

function CategoryTransactionsNotFound() {
  return (
    <section className="app-page project-container">
      <p className="text-destructive text-sm" role="alert">
        Categoria não encontrada.
      </p>
    </section>
  );
}
