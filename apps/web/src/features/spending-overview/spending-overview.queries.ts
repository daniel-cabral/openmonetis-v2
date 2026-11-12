import { queryOptions } from "@tanstack/react-query";
import { getSpendingOverview } from "./spending-overview.api";

export function spendingOverviewQueryOptions(period: string) {
  return queryOptions({
    queryKey: ["spending-overview", period] as const,
    queryFn: () => getSpendingOverview(period),
  });
}
