import type { ListEstablishmentsReportQuery } from "@openmonetis/validators/establishments-report";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getEstablishmentsReport } from "./establishments-report.api";

export function establishmentsReportQueryOptions(query: ListEstablishmentsReportQuery) {
  return queryOptions({
    queryKey: ["establishments-report", query.period, query.months, query.trip ?? "all"] as const,
    queryFn: () => getEstablishmentsReport(query),
    placeholderData: keepPreviousData,
  });
}
