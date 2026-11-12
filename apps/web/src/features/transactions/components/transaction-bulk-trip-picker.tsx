import type { TripListItemOutput } from "@openmonetis/validators/trips";
import { Loader2, Plane } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  MobilePicker,
  MobilePickerContent,
  MobilePickerTrigger,
} from "@/components/forms/mobile-picker";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function TransactionBulkTripPicker({
  blockedReason,
  busy,
  trips,
  pending,
  onSelect,
}: {
  blockedReason: string | null;
  busy: boolean;
  trips: TripListItemOutput[];
  pending: boolean;
  onSelect: (tripId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <MobilePicker
      open={open}
      onOpenChange={(next) => {
        if (next && blockedReason) {
          toast.info(blockedReason);
          return;
        }
        setOpen(next);
      }}
    >
      <MobilePickerTrigger
        render={
          <Button
            aria-expanded={open}
            aria-label="Viagem"
            aria-disabled={Boolean(blockedReason)}
            className="aria-disabled:opacity-70"
            disabled={busy}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Plane aria-hidden="true" />
        )}
      </MobilePickerTrigger>
      <MobilePickerContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        side="top"
        title="Definir viagem"
      >
        <Command>
          <CommandInput
            aria-label="Buscar viagem"
            className="text-base md:text-sm"
            placeholder="Buscar viagem"
          />
          <CommandList>
            <CommandEmpty>Nenhuma viagem encontrada.</CommandEmpty>
            <CommandItem
              className="min-h-11 md:min-h-9"
              onSelect={() => {
                setOpen(false);
                onSelect(null);
              }}
              value="Sem viagem"
            >
              <span className="truncate">Sem viagem</span>
            </CommandItem>
            {trips.map((trip) => (
              <CommandItem
                className="min-h-11 md:min-h-9"
                key={trip.id}
                onSelect={() => {
                  setOpen(false);
                  onSelect(trip.id);
                }}
                value={`${trip.name} ${trip.id}`}
              >
                <span className="truncate">{trip.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </MobilePickerContent>
    </MobilePicker>
  );
}
