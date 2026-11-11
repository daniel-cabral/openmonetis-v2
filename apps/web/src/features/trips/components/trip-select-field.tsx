import type { TransactionOrigin } from "@openmonetis/domain/transactions";
import { useQuery } from "@tanstack/react-query";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldShell } from "@/features/transactions/components/transaction-field-shell";
import { noneValue } from "@/features/transactions/components/transaction-form-options";
import {
  resolveTransactionTripId,
  type TransactionFormValues,
} from "@/features/transactions/components/transaction-form.validation";
import type { useTransactionForm } from "@/features/transactions/useTransactionForm";
import { tripsQueryOptions } from "../trips.queries";

export function TripSelectField({
  form,
  values,
  disabled,
  mode,
  origin,
}: {
  form: ReturnType<typeof useTransactionForm>["form"];
  values: TransactionFormValues;
  disabled: boolean;
  mode: "create" | "edit" | "copy";
  origin: TransactionOrigin;
}) {
  const query = useQuery(tripsQueryOptions());
  const trips = query.data ?? [];

  return (
    <form.Field name="tripId">
      {(field) => {
        const tripId = resolveTransactionTripId({
          mode,
          origin,
          touched: field.state.meta.isTouched,
          trips,
          value: {
            type: values.type,
            purchaseDate: values.purchaseDate,
            tripId: field.state.value,
          },
        });

        return (
          <FieldShell label="Viagem">
            <Select
              disabled={disabled || query.isLoading || query.isError}
              onValueChange={(next) => field.handleChange(next && next !== noneValue ? next : "")}
              value={tripId || noneValue}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {trips.find((trip) => trip.id === tripId)?.name ?? "Nenhuma"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={noneValue}>Nenhuma</SelectItem>
                {trips.map((trip) => (
                  <SelectItem key={trip.id} value={trip.id}>
                    {trip.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        );
      }}
    </form.Field>
  );
}
