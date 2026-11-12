import { createFileRoute } from "@tanstack/react-router";
import {
  resolveCardUsageReportSearch,
  validateCardUsageReportSearch,
} from "@/features/card-usage-report/card-usage-report.presentation";
import { CardUsageReportPage } from "@/features/card-usage-report/components/card-usage-report-page";

export const Route = createFileRoute("/reports/card-usage")({
  head: () => ({ meta: [{ title: "Uso de cartões · OpenMonetis" }] }),
  component: CardUsageReportRoute,
  validateSearch: validateCardUsageReportSearch,
});

function CardUsageReportRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = resolveCardUsageReportSearch(search);

  return (
    <CardUsageReportPage
      filters={filters}
      onFiltersChange={(nextFilters) =>
        navigate({
          replace: true,
          search: nextFilters,
        })
      }
    />
  );
}
