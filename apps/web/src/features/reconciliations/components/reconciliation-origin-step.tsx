import {
  formatDateInBrazil,
  getCurrentPeriodInBrazil,
  periodToSafeInstant,
} from "@openmonetis/shared/date-time";
import type { AccountOutput } from "@openmonetis/validators/accounts";
import type { CardOutput } from "@openmonetis/validators/cards";
import type { ReconciliationDetection } from "@openmonetis/validators/reconciliations";
import { useForm } from "@tanstack/react-form";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  MobilePicker as Popover,
  MobilePickerContent as PopoverContent,
  MobilePickerTrigger as PopoverTrigger,
} from "@/components/forms/mobile-picker";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MonthPicker } from "@/components/ui/month-picker";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EntityOption,
  Field,
  TextOption,
} from "@/features/transactions/components/transaction-import-options";
import type { ReconciliationOrigin } from "../reconciliations.api";
import { defaultProfileId } from "./reconciliation-review";

type Detection = ReconciliationDetection;

function destinationTypeOf(detection: Detection, profileId: string) {
  return detection.profiles.find((profile) => profile.id === profileId)?.destinationType;
}

// Only an account profile can use the account suggested by the file.
function targetIdFor(detection: Detection, profileId: string) {
  return destinationTypeOf(detection, profileId) === "account"
    ? (detection.suggestedAccountId ?? "")
    : "";
}

function isOriginComplete(
  detection: Detection,
  values: { profileId: string; targetId: string; invoicePeriod: string },
) {
  const destinationType = destinationTypeOf(detection, values.profileId);
  if (!destinationType || !values.targetId) return false;
  return destinationType === "account" || Boolean(values.invoicePeriod);
}

function displayPeriod(period: string) {
  return formatDateInBrazil(periodToSafeInstant(period), { month: "short", year: "numeric" });
}

export function ReconciliationOriginStep({
  file,
  detection,
  accounts,
  cards,
  isReading,
  onRead,
  onOriginChange,
  onReset,
}: {
  file: File;
  detection: Detection;
  accounts: AccountOutput[];
  cards: CardOutput[];
  isReading: boolean;
  onRead: (origin: ReconciliationOrigin) => void;
  onOriginChange: () => void;
  onReset: () => void;
}) {
  const [periodOpen, setPeriodOpen] = useState(false);
  const initialProfileId = defaultProfileId(detection) ?? "";
  const form = useForm({
    defaultValues: {
      profileId: initialProfileId,
      targetId: targetIdFor(detection, initialProfileId),
      invoicePeriod: getCurrentPeriodInBrazil(),
    },
    onSubmit: ({ value }) => {
      const targetType = destinationTypeOf(detection, value.profileId);
      if (!targetType) return;
      onRead({
        profileId: value.profileId,
        targetType,
        targetId: value.targetId,
        invoicePeriod: targetType === "card" ? value.invoicePeriod : undefined,
      });
    },
  });

  return (
    <Card className="border" aria-labelledby="reconciliation-origin-title">
      <CardHeader className="border-b">
        <CardTitle id="reconciliation-origin-title">Confirmar arquivo</CardTitle>
        <CardDescription>{file.name}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <CardContent className="grid gap-5">
          {detection.detectedProfileId ? null : (
            <p className="text-muted-foreground text-sm" role="status">
              Não reconhecemos o formato. Escolha o perfil do banco.
            </p>
          )}
          {detection.accountIdentification ? (
            <p className="text-muted-foreground text-sm">
              Conta identificada no arquivo: {detection.accountIdentification}
            </p>
          ) : null}
          <form.Field name="profileId">
            {(field) => {
              const selectedProfile = detection.profiles.find(
                (profile) => profile.id === field.state.value,
              );
              return (
                <Field label="Perfil do banco">
                  <Select
                    onValueChange={(value) => {
                      field.handleChange(value as string);
                      form.setFieldValue("targetId", targetIdFor(detection, value as string));
                      onOriginChange();
                    }}
                    value={field.state.value}
                  >
                    <SelectTrigger className="h-auto min-h-14 w-full px-3 py-2">
                      <SelectValue placeholder="Selecione o perfil do banco">
                        {selectedProfile ? (
                          <TextOption label={selectedProfile.label} />
                        ) : (
                          <span>Selecione o perfil do banco</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {detection.profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          <TextOption label={profile.label} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              );
            }}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.profileId}>
            {(profileId) => {
              const destinationType = destinationTypeOf(detection, profileId);
              return (
                <>
                  <form.Field name="targetId">
                    {(field) => {
                      const selectedAccount = accounts.find(
                        (account) => account.id === field.state.value,
                      );
                      const selectedCard = cards.find((card) => card.id === field.state.value);
                      return (
                        <Field
                          label={
                            destinationType === "card" ? "Cartão de destino" : "Conta de destino"
                          }
                        >
                          <Select
                            disabled={!destinationType}
                            onValueChange={(value) => {
                              field.handleChange(value as string);
                              onOriginChange();
                            }}
                            value={field.state.value}
                          >
                            <SelectTrigger className="h-auto min-h-14 w-full px-3 py-2">
                              <SelectValue placeholder="Selecione o destino">
                                {selectedAccount ? (
                                  <EntityOption entity={selectedAccount} kind="Conta" />
                                ) : selectedCard ? (
                                  <EntityOption entity={selectedCard} kind="Cartão" />
                                ) : (
                                  <span>Selecione o destino</span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {destinationType === "card"
                                ? cards.map((card) => (
                                    <SelectItem key={card.id} value={card.id}>
                                      <EntityOption entity={card} kind="Cartão" />
                                    </SelectItem>
                                  ))
                                : accounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                      <EntityOption entity={account} kind="Conta" />
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      );
                    }}
                  </form.Field>
                  {destinationType === "card" ? (
                    <form.Field name="invoicePeriod">
                      {(field) => (
                        <Field label="Período da fatura">
                          <Popover onOpenChange={setPeriodOpen} open={periodOpen}>
                            <PopoverTrigger className="max-md:min-h-11 max-md:px-2 rounded-sm text-left font-medium text-brand-strong text-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              {displayPeriod(field.state.value)} · alterar
                            </PopoverTrigger>
                            <PopoverContent
                              title="Mês da fatura"
                              align="start"
                              className="w-auto bg-popover/80 p-0 backdrop-blur-sm"
                            >
                              <MonthPicker
                                onMonthSelect={(date) => {
                                  field.handleChange(getCurrentPeriodInBrazil(date));
                                  onOriginChange();
                                  setPeriodOpen(false);
                                }}
                                selectedMonth={periodToSafeInstant(field.state.value)}
                              />
                            </PopoverContent>
                          </Popover>
                          <p className="text-muted-foreground text-xs">
                            Os lançamentos criados entram neste período, não no mês da compra
                            original.
                          </p>
                        </Field>
                      )}
                    </form.Field>
                  ) : null}
                </>
              );
            }}
          </form.Subscribe>
        </CardContent>
        <CardFooter className="flex-col-reverse gap-2 border-t sm:flex-row sm:justify-between">
          <Button disabled={isReading} onClick={onReset} type="button" variant="outline">
            <RotateCcw />
            Escolher outro arquivo
          </Button>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <Button disabled={isReading || !isOriginComplete(detection, values)} type="submit">
                {isReading ? "Lendo arquivo..." : "Ler arquivo"}
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </form>
    </Card>
  );
}
