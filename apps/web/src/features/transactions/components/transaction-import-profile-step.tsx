import type { AccountOutput } from "@openmonetis/validators/accounts";
import type { CardOutput } from "@openmonetis/validators/cards";
import type { TransactionImportDetection } from "@openmonetis/validators/transactions";
import { useForm } from "@tanstack/react-form";
import { RotateCcw } from "lucide-react";
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
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TransactionImportPreviewOptions } from "../transactions.api";
import { EntityOption, Field, TextOption } from "./transaction-import-options";

export function TransactionImportProfileStep({
  file,
  detection,
  accounts,
  cards,
  isPreviewing,
  onConfirm,
  onCancel,
}: {
  file: File;
  detection: TransactionImportDetection;
  accounts: AccountOutput[];
  cards: CardOutput[];
  isPreviewing: boolean;
  onConfirm: (options: TransactionImportPreviewOptions) => void;
  onCancel: () => void;
}) {
  const form = useForm({
    defaultValues: { profileId: detection.detectedProfileId ?? "", destination: "" },
    onSubmit: ({ value }) => {
      const [destinationType, destinationId] = value.destination.split(":") as [
        "account" | "card",
        string,
      ];
      onConfirm({ profileId: value.profileId, destinationType, destinationId });
    },
  });

  return (
    <Card className="border" aria-labelledby="profile-step-title">
      <CardHeader className="border-b">
        <CardTitle id="profile-step-title">Confirmar arquivo</CardTitle>
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
                      form.setFieldValue("destination", "");
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
              const destinationType = detection.profiles.find(
                (profile) => profile.id === profileId,
              )?.destinationType;
              return (
                <form.Field name="destination">
                  {(field) => {
                    const selectedAccount = accounts.find(
                      (account) => field.state.value === `account:${account.id}`,
                    );
                    const selectedCard = cards.find(
                      (card) => field.state.value === `card:${card.id}`,
                    );
                    return (
                      <Field label={destinationType === "card" ? "Cartão" : "Conta"}>
                        <Select
                          disabled={!destinationType}
                          onValueChange={(value) => field.handleChange(value as string)}
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
                                  <SelectItem key={card.id} value={`card:${card.id}`}>
                                    <EntityOption entity={card} kind="Cartão" />
                                  </SelectItem>
                                ))
                              : accounts.map((account) => (
                                  <SelectItem key={account.id} value={`account:${account.id}`}>
                                    <EntityOption entity={account} kind="Conta" />
                                  </SelectItem>
                                ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    );
                  }}
                </form.Field>
              );
            }}
          </form.Subscribe>
        </CardContent>
        <CardFooter className="flex-col-reverse gap-2 border-t sm:flex-row sm:justify-between">
          <Button disabled={isPreviewing} onClick={onCancel} type="button" variant="outline">
            <RotateCcw />
            Escolher outro arquivo
          </Button>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <Button
                disabled={isPreviewing || !values.profileId || !values.destination}
                type="submit"
              >
                {isPreviewing ? "Lendo arquivo..." : "Ler arquivo"}
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </form>
    </Card>
  );
}
