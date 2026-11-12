import type {
  EstablishmentsReportOutput,
  ListEstablishmentsReportQuery,
} from "@openmonetis/validators/establishments-report";
import { requestApi } from "@/lib/api-client";

export function getEstablishmentsReport(query: ListEstablishmentsReportQuery) {
  const params = new URLSearchParams({ months: String(query.months) });
  if (query.period) params.set("period", query.period);
  if (query.trip) params.set("trip", query.trip);

  return requestApi<EstablishmentsReportOutput>(
    `/reports/establishments?${params.toString()}`,
    undefined,
    { useResponseMessage: true },
  );
}
