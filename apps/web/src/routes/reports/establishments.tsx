import { createFileRoute } from "@tanstack/react-router";
import { EstablishmentsReportPage } from "@/features/establishments-report/components/establishments-report-page";
import {
  resolveEstablishmentsReportSearch,
  validateEstablishmentsReportSearch,
} from "@/features/establishments-report/establishments-report.presentation";

export const Route = createFileRoute("/reports/establishments")({
  head: () => ({ meta: [{ title: "Estabelecimentos · OpenMonetis" }] }),
  component: EstablishmentsReportRoute,
  validateSearch: validateEstablishmentsReportSearch,
});

function EstablishmentsReportRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = resolveEstablishmentsReportSearch(search);

  return (
    <EstablishmentsReportPage
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
