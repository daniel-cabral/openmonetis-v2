import type { ListCardUsageReportQuery } from "@openmonetis/validators/card-usage-report";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getCardUsageReport } from "./card-usage-report.api";

export function cardUsageReportQueryOptions(query: ListCardUsageReportQuery) {
  return queryOptions({
    queryKey: ["card-usage-report", query.period, query.cardId ?? "default"] as const,
    queryFn: () => getCardUsageReport(query),
    placeholderData: keepPreviousData,
  });
}
