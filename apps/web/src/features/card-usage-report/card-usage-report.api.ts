import type {
  CardUsageReportOutput,
  ListCardUsageReportQuery,
} from "@openmonetis/validators/card-usage-report";
import { requestApi } from "@/lib/api-client";

export function getCardUsageReport({ period, cardId }: ListCardUsageReportQuery) {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (cardId) params.set("cardId", cardId);

  return requestApi<CardUsageReportOutput>(
    `/reports/card-usage?${params.toString()}`,
    undefined,
    { useResponseMessage: true },
  );
}
