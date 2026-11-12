import { invoicePaymentCategoryName } from "@openmonetis/domain/categories";
import { paymentMethods } from "@openmonetis/domain/transactions";
import { getCurrentDateInBrazil } from "@openmonetis/shared/date-time";
import type { AccountOutput } from "@openmonetis/validators/accounts";
import type { CardOutput } from "@openmonetis/validators/cards";
import type { CategoryOutput } from "@openmonetis/validators/categories";
import type { PersonOutput } from "@openmonetis/validators/people";
import { BulkCreateTransactionsInputSchema } from "@openmonetis/validators/transactions";
import { useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MobileFormContent as DialogContent } from "@/components/forms/mobile-form-content";
import { MobileRecordSelect } from "@/components/forms/mobile-record-select";
import { MobileSelect as Select } from "@/components/forms/mobile-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sortCategoryOptions } from "@/features/categories/categories.presentation";
import { showInvalidFormToast } from "@/lib/form-feedback";
import { useCreateTransactionsBulkMutation } from "../transactions.mutations";
import {
  formatMassAddSuccess,
  getMassAddErrorMessage,
  paymentMethodLabels,
  transactionTypeLabels,
} from "../transactions.presentation";
import { InvoicePeriodPicker } from "./invoice-period-picker";
import { EntityOption } from "./transaction-entity-option";
import { FieldShell } from "./transaction-field-shell";
import { noneValue } from "./transaction-form-options";
import {
  type MassAddRowField,
  type MassAddRowValues,
  TransactionMassAddRow,
} from "./transaction-mass-add-row";

const maxMassAddRows = 500;
const requiredRowMessage =
  "Preencha todos os campos obrigatórios das transações (data, estabelecimento e valor)";

const rowErrorMessages: Partial<Record<MassAddRowField, string>> = {
  purchaseDate: requiredRowMessage,
  name: requiredRowMessage,
  amount: "Informe um valor maior que zero",
  categoryId: "Selecione a categoria",
  personId: "Selecione a pessoa",
};

const topErrorMessages = {
  accountId: "Selecione uma conta para continuar",
  cardId: "Selecione um cartão para continuar",
};

type MassAddFormValues = {
  type: "income" | "expense";
  paymentMethod: (typeof paymentMethods)[number];
  accountId: string;
  cardId: string;
  invoicePeriod: string;
  rows: MassAddRowValues[];
};

type MassAddErrors = {
  top: Partial<Record<keyof typeof topErrorMessages, string>>;
  rows: Record<number, { field: MassAddRowField; message: string }>;
};

const noMassAddErrors: MassAddErrors = { top: {}, rows: {} };

type MassAddDefaultsInput = {
  accounts: AccountOutput[];
  cards: CardOutput[];
  people: PersonOutput[];
  lockedCardId?: string;
  defaultInvoicePeriod?: string;
};

export type TransactionMassAddDialogProps = MassAddDefaultsInput & {
  open: boolean;
  categories: CategoryOutput[];
  onOpenChange: (open: boolean) => void;
};

function getDefaultPersonId(people: PersonOutput[]) {
  const activePeople = people.filter((person) => person.status === "active");
  return (activePeople.find((person) => person.role === "admin") ?? activePeople[0])?.id ?? "";
}

function createMassAddRow(purchaseDate: string, personId: string): MassAddRowValues {
  return { purchaseDate, name: "", amount: "", categoryId: "", personId };
}

function getMassAddDefaultValues({
  accounts,
  cards,
  people,
  lockedCardId,
  defaultInvoicePeriod,
}: MassAddDefaultsInput): MassAddFormValues {
  return {
    type: "expense",
    paymentMethod: lockedCardId ? "credit_card" : "pix",
    accountId: accounts.find((account) => !account.isArchived)?.id ?? "",
    cardId: lockedCardId ?? cards.find((card) => card.status === "active")?.id ?? "",
    invoicePeriod: defaultInvoicePeriod ?? "",
    rows: [createMassAddRow(getCurrentDateInBrazil(), getDefaultPersonId(people))],
  };
}

function toBulkCreateInput(values: MassAddFormValues) {
  const isCard = values.paymentMethod === "credit_card";

  return {
    type: values.type,
    paymentMethod: values.paymentMethod,
    ...(isCard
      ? { cardId: values.cardId || undefined, invoicePeriod: values.invoicePeriod || undefined }
      : { accountId: values.accountId || undefined }),
    rows: values.rows.map((row) => ({
      purchaseDate: row.purchaseDate,
      name: row.name,
      amount: Number(row.amount),
      categoryId: row.categoryId || undefined,
      personId: row.personId || undefined,
    })),
  };
}

function getMassAddErrors(values: MassAddFormValues): MassAddErrors {
  const errors: MassAddErrors = { top: {}, rows: {} };
  const result = BulkCreateTransactionsInputSchema.safeParse(toBulkCreateInput(values));
  if (result.success) return errors;

  for (const issue of result.error.issues) {
    const [root, rowIndex, field] = issue.path;

    if (root === "rows" && typeof rowIndex === "number" && typeof field === "string") {
      const rowField = field as MassAddRowField;
      errors.rows[rowIndex] ??= {
        field: rowField,
        message: rowErrorMessages[rowField] ?? requiredRowMessage,
      };
    } else if (root === "accountId") {
      errors.top.accountId ??= topErrorMessages.accountId;
    } else if (root === "cardId") {
      errors.top.cardId ??= topErrorMessages.cardId;
    }
  }

  return errors;
}

export function TransactionMassAddDialog({
  open,
  accounts,
  cards,
  categories,
  people,
  lockedCardId,
  defaultInvoicePeriod,
  onOpenChange,
}: TransactionMassAddDialogProps) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const createBulk = useCreateTransactionsBulkMutation();
  const defaultsInput = { accounts, cards, people, lockedCardId, defaultInvoicePeriod };
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const activeCards = cards.filter((card) => card.status === "active");
  const activePeople = people.filter((person) => person.status === "active");
  const defaultPersonId = getDefaultPersonId(people);

  const form = useForm({
    defaultValues: getMassAddDefaultValues(defaultsInput),
    onSubmit: async ({ value }) => {
      const parsed = BulkCreateTransactionsInputSchema.safeParse(toBulkCreateInput(value));
      if (!parsed.success) {
        showInvalidFormToast();
        return;
      }

      try {
        const result = await createBulk.mutateAsync(parsed.data);
        toast.success(formatMassAddSuccess(result.ids.length));
        closeDialog();
      } catch (error) {
        toast.error(getMassAddErrorMessage(error));
      }
    },
  });

  function closeDialog() {
    form.reset(getMassAddDefaultValues(defaultsInput));
    onOpenChange(false);
  }

  function requestClose() {
    if (createBulk.isPending) return;

    if (form.state.isDirty) {
      setDiscardOpen(true);
      return;
    }

    closeDialog();
  }

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
            return;
          }
          requestClose();
        }}
        open={open}
      >
        <DialogContent className="flex min-w-0 flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adicionar em massa</DialogTitle>
            <DialogDescription>
              Crie vários lançamentos com as mesmas configurações comuns.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Subscribe
              selector={(state) => ({
                values: state.values,
                attempted: state.submissionAttempts > 0,
              })}
            >
              {({ values, attempted }) => {
                const errors = attempted ? getMassAddErrors(values) : noMassAddErrors;
                const isCard = values.paymentMethod === "credit_card";
                const isPending = createBulk.isPending;
                const visibleCategories = sortCategoryOptions(
                  categories.filter(
                    (category) =>
                      category.type === values.type &&
                      !(category.isSystem && category.name === invoicePaymentCategoryName),
                  ),
                );
                const rowCount = values.rows.length;

                return (
                  <>
                    <section className="grid gap-4 sm:grid-cols-2">
                      <FieldShell label="Tipo de transação">
                        <Select
                          disabled={isPending}
                          onValueChange={(value) =>
                            form.setFieldValue("type", value === "income" ? "income" : "expense")
                          }
                          value={values.type}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione">
                              {transactionTypeLabels[values.type]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="expense">{transactionTypeLabels.expense}</SelectItem>
                            <SelectItem value="income">{transactionTypeLabels.income}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldShell>

                      <FieldShell label="Forma de pagamento">
                        <Select
                          disabled={isPending}
                          onValueChange={(value) =>
                            form.setFieldValue(
                              "paymentMethod",
                              value as MassAddFormValues["paymentMethod"],
                            )
                          }
                          value={values.paymentMethod}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione">
                              {paymentMethodLabels[values.paymentMethod]}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods.map((method) => (
                              <SelectItem key={method} value={method}>
                                {paymentMethodLabels[method]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldShell>

                      {isCard ? (
                        <FieldShell error={errors.top.cardId} label="Cartão">
                          <MobileRecordSelect
                            disabled={isPending || Boolean(lockedCardId)}
                            invalid={Boolean(errors.top.cardId)}
                            onValueChange={(value) =>
                              form.setFieldValue(
                                "cardId",
                                value === noneValue || value === null ? "" : value,
                              )
                            }
                            options={activeCards.map((card) => ({
                              value: card.id,
                              label: card.name,
                              content: <EntityOption entity={card} />,
                            }))}
                            title="Cartão"
                            value={values.cardId || noneValue}
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-invalid={Boolean(errors.top.cardId)}
                            >
                              <SelectValue placeholder="Selecione">
                                <EntityOption
                                  entity={cards.find((card) => card.id === values.cardId)}
                                />
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {activeCards.map((card) => (
                                <SelectItem key={card.id} value={card.id}>
                                  <EntityOption entity={card} />
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </MobileRecordSelect>
                        </FieldShell>
                      ) : (
                        <FieldShell error={errors.top.accountId} label="Conta">
                          <MobileRecordSelect
                            disabled={isPending}
                            invalid={Boolean(errors.top.accountId)}
                            onValueChange={(value) =>
                              form.setFieldValue(
                                "accountId",
                                value === noneValue || value === null ? "" : value,
                              )
                            }
                            options={activeAccounts.map((account) => ({
                              value: account.id,
                              label: account.name,
                              content: <EntityOption entity={account} />,
                            }))}
                            title="Conta"
                            value={values.accountId || noneValue}
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-invalid={Boolean(errors.top.accountId)}
                            >
                              <SelectValue placeholder="Selecione">
                                <EntityOption
                                  entity={accounts.find(
                                    (account) => account.id === values.accountId,
                                  )}
                                />
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {activeAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  <EntityOption entity={account} />
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </MobileRecordSelect>
                        </FieldShell>
                      )}

                      {isCard ? (
                        <FieldShell label="Fatura">
                          <InvoicePeriodPicker
                            cardId={values.cardId}
                            onChange={(value) => form.setFieldValue("invoicePeriod", value)}
                            purchaseDate={values.rows[0]?.purchaseDate ?? ""}
                            value={values.invoicePeriod}
                          />
                        </FieldShell>
                      ) : null}
                    </section>

                    <section className="grid gap-2">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Estabelecimento</TableHead>
                              <TableHead>Valor</TableHead>
                              <TableHead>Categoria</TableHead>
                              <TableHead>Pessoa</TableHead>
                              <TableHead>
                                <span className="sr-only">Remover</span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {values.rows.map((row, index) => (
                              <TransactionMassAddRow
                                categories={visibleCategories}
                                disabled={isPending}
                                errorField={errors.rows[index]?.field}
                                errorMessage={errors.rows[index]?.message}
                                index={index}
                                key={index}
                                onChange={(field, value) =>
                                  form.setFieldValue("rows", (rows) =>
                                    rows.map((current, rowIndex) =>
                                      rowIndex === index ? { ...current, [field]: value } : current,
                                    ),
                                  )
                                }
                                onRemove={() => {
                                  if (rowCount === 1) {
                                    toast.info("É necessário ter pelo menos uma transação");
                                    return;
                                  }
                                  form.setFieldValue("rows", (rows) =>
                                    rows.filter((_, rowIndex) => rowIndex !== index),
                                  );
                                }}
                                people={activePeople}
                                row={row}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button
                          disabled={isPending || rowCount >= maxMassAddRows}
                          onClick={() =>
                            form.setFieldValue("rows", (rows) => [
                              ...rows,
                              createMassAddRow(
                                rows[rows.length - 1]?.purchaseDate ?? getCurrentDateInBrazil(),
                                defaultPersonId,
                              ),
                            ])
                          }
                          type="button"
                          variant="outline"
                        >
                          <Plus aria-hidden="true" />
                          Adicionar linha
                        </Button>
                        {rowCount >= maxMassAddRows ? (
                          <p className="text-muted-foreground text-xs">
                            Limite de 500 lançamentos por envio
                          </p>
                        ) : null}
                      </div>
                    </section>

                    <div className="flex justify-end gap-2">
                      <Button
                        disabled={isPending}
                        onClick={requestClose}
                        type="button"
                        variant="outline"
                      >
                        Cancelar
                      </Button>
                      <Button disabled={isPending} type="submit">
                        {`Criar ${rowCount} ${rowCount === 1 ? "lançamento" : "lançamentos"}`}
                      </Button>
                    </div>
                  </>
                );
              }}
            </form.Subscribe>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setDiscardOpen} open={discardOpen}>
        <AlertDialogContent
          size="sm"
          className="w-[calc(100%-2rem)] data-[size=sm]:max-w-sm sm:data-[size=sm]:max-w-md"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              As informações preenchidas nestes lançamentos serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid-cols-1 sm:grid-cols-2">
            <AlertDialogCancel className="min-w-0 whitespace-nowrap px-3">
              Continuar editando
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-w-0 whitespace-nowrap px-3"
              onClick={() => {
                setDiscardOpen(false);
                closeDialog();
              }}
              variant="destructive"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
