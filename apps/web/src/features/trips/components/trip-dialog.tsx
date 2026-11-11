import type {
  CreateTripInput,
  TripListItemOutput,
  TripOutput,
} from "@openmonetis/validators/trips";
import { MobileFormContent } from "@/components/forms/mobile-form-content";
import { MobileFormDialog } from "@/components/forms/mobile-form-dialog";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TripForm } from "./trip-form";

export function TripDialog({
  open,
  onOpenChange,
  trip = null,
  trips,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  trip?: TripOutput | null;
  trips: readonly TripListItemOutput[];
  onSubmit: (input: CreateTripInput) => Promise<void>;
}) {
  return (
    <MobileFormDialog open={open} onOpenChange={onOpenChange}>
      <MobileFormContent guarded>
        <DialogHeader>
          <DialogTitle>{trip ? "Editar viagem" : "Nova viagem"}</DialogTitle>
          <DialogDescription>
            Os lançamentos com data da compra no período passam a ser sugeridos para esta viagem.
          </DialogDescription>
        </DialogHeader>
        <TripForm
          key={trip?.id ?? "new-trip"}
          trip={trip}
          trips={trips}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </MobileFormContent>
    </MobileFormDialog>
  );
}
