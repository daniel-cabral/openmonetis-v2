import type { SpendingOverviewOutput } from "@openmonetis/validators/spending-overview";
import { requestApi } from "@/lib/api-client";

export function getSpendingOverview(period: string) {
  const params = new URLSearchParams({ period });

  return requestApi<SpendingOverviewOutput>(
    `/dashboard/spending-overview?${params.toString()}`,
    undefined,
    { useResponseMessage: true },
  );
}
