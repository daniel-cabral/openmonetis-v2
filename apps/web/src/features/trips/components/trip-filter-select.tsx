import { useQuery } from "@tanstack/react-query";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tripsQueryOptions } from "../trips.queries";

const allValue = "all";
const noTripValue = "none";

type TripFilterSelectProps = {
  value?: string;
  onChange: (value: string | undefined) => void;
};

export function TripFilterSelect({ value, onChange }: TripFilterSelectProps) {
  const query = useQuery(tripsQueryOptions());
  const options = [
    { value: allValue, label: "Todos os lançamentos" },
    { value: noTripValue, label: "Sem viagens" },
    ...(query.data ?? []).map((trip) => ({ value: trip.id, label: trip.name })),
  ];
  const selectedValue = value ?? allValue;

  return (
    <Select
      onValueChange={(next) =>
        onChange(typeof next === "string" && next !== allValue ? next : undefined)
      }
      value={selectedValue}
    >
      <SelectTrigger
        aria-label="Filtrar por viagem"
        className="min-w-0 w-full sm:min-w-52 sm:w-auto"
      >
        <SelectValue>
          {options.find((option) => option.value === selectedValue)?.label ?? "Viagem"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
