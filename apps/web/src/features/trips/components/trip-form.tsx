import {
  type CreateTripInput,
  CreateTripInputSchema,
  type TripListItemOutput,
  type TripOutput,
} from "@openmonetis/validators/trips";
import { useForm } from "@tanstack/react-form";
import { useId, useState } from "react";
import { MobileDatePicker } from "@/components/forms/mobile-date-picker";
import { MobileFormState } from "@/components/forms/mobile-form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showInvalidFormToast } from "@/lib/form-feedback";
import { getTripErrorMessage, tripFormMessages } from "../trips.presentation";

type TripFormValues = { name: string; startDate: string; endDate: string; note: string };

function getTripIssueMessage(field: string, code: string) {
  if (field === "name") {
    return code === "too_big" ? tripFormMessages.nameTooLong : tripFormMessages.nameRequired;
  }
  if (field === "startDate") return tripFormMessages.startDateInvalid;
  if (field === "endDate") {
    return code === "custom" ? tripFormMessages.endBeforeStart : tripFormMessages.endDateInvalid;
  }
  return tripFormMessages.noteTooLong;
}

function getTripFieldErrors({ value }: { value: TripFormValues }) {
  const result = CreateTripInputSchema.safeParse(value);
  if (result.success) return undefined;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    fields[field] ??= getTripIssueMessage(field, issue.code);
  }
  return { fields };
}

export function TripForm({
  trip,
  trips,
  onSubmit,
  onCancel,
}: {
  trip: TripOutput | null;
  trips: readonly TripListItemOutput[];
  onSubmit: (input: CreateTripInput) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      name: trip?.name ?? "",
      startDate: trip?.startDate ?? "",
      endDate: trip?.endDate ?? "",
      note: trip?.note ?? "",
    } satisfies TripFormValues,
    validators: { onSubmit: getTripFieldErrors },
    onSubmitInvalid: showInvalidFormToast,
    onSubmit: async ({ value }) => {
      setError(null);
      const input = CreateTripInputSchema.parse(value);
      try {
        await onSubmit(input);
      } catch (cause) {
        setError(
          getTripErrorMessage(cause, trips, {
            id: trip?.id,
            startDate: input.startDate,
            endDate: input.endDate,
          }),
        );
      }
    },
  });

  return (
    <form
      data-mobile-page-form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe
        selector={(state) => ({ isDirty: !state.isDefaultValue, isSubmitting: state.isSubmitting })}
      >
        {(state) => <MobileFormState {...state} />}
      </form.Subscribe>
      <form.Field name="name">
        {(field) => (
          <div className="grid gap-2">
            <Label className="font-mono" htmlFor={`${id}-name`}>
              Nome
            </Label>
            <Input
              autoFocus
              id={`${id}-name`}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Ex.: Lisboa"
              aria-invalid={field.state.meta.errors.length > 0}
            />
            {field.state.meta.errors.length ? (
              <p className="text-destructive text-sm" role="alert">
                {field.state.meta.errors[0]}
              </p>
            ) : null}
          </div>
        )}
      </form.Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="startDate">
          {(field) => (
            <div className="grid gap-2">
              <Label className="font-mono" htmlFor={`${id}-start`}>
                Início
              </Label>
              <MobileDatePicker
                id={`${id}-start`}
                value={field.state.value}
                onChange={field.handleChange}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length ? (
                <p className="text-destructive text-sm" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              ) : null}
            </div>
          )}
        </form.Field>
        <form.Field name="endDate">
          {(field) => (
            <div className="grid gap-2">
              <Label className="font-mono" htmlFor={`${id}-end`}>
                Fim
              </Label>
              <MobileDatePicker
                id={`${id}-end`}
                value={field.state.value}
                onChange={field.handleChange}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              {field.state.meta.errors.length ? (
                <p className="text-destructive text-sm" role="alert">
                  {field.state.meta.errors[0]}
                </p>
              ) : null}
            </div>
          )}
        </form.Field>
      </div>
      <form.Field name="note">
        {(field) => (
          <div className="grid gap-2">
            <Label className="font-mono" htmlFor={`${id}-note`}>
              Anotação
            </Label>
            <Textarea
              id={`${id}-note`}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            {field.state.meta.errors.length ? (
              <p className="text-destructive text-sm" role="alert">
                {field.state.meta.errors[0]}
              </p>
            ) : null}
          </div>
        )}
      </form.Field>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <div data-mobile-form-actions className="grid grid-cols-2 gap-2">
            <Button
              data-mobile-cancel
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onCancel}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
