import { invoicePaymentCategoryName } from "@openmonetis/domain/categories";
import {
  type BulkTransactionUpdateField,
  bulkTransactionUpdateFields,
  listInapplicableBulkUpdateFields,
  type PaymentMethod,
} from "@openmonetis/domain/transactions";
import type { AccountOutput } from "@openmonetis/validators/accounts";
import type { CardOutput } from "@openmonetis/validators/cards";
import type { CategoryOutput } from "@openmonetis/validators/categories";
import type { PersonOutput } from "@openmonetis/validators/people";
import {
  type BulkUpdateTransactionsInput,
  BulkUpdateTransactionsInputSchema,
  type TransactionOutput,
} from "@openmonetis/validators/transactions";
import { useForm } from "@tanstack/react-form";
import { type ReactNode, useId } from "react";
import { toast } from "sonner";
import { MobileDatePicker as DatePicker } from "@/components/forms/mobile-date-picker";
import { MobileFormContent } from "@/components/forms/mobile-form-content";
import { MobileFormDialog } from "@/components/forms/mobile-form-dialog";
import { MobileFormState } from "@/components/forms/mobile-form-state";
import { MobileRecordSelect } from "@/components/forms/mobile-record-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryPicker } from "@/features/categories/components/category-picker";
import { PersonOption } from "@/features/people/components/person-option";
import { showInvalidFormToast } from "@/lib/form-feedback";
import { paymentMethodLabels } from "../transactions.presentation";
import { InvoicePeriodPicker } from "./invoice-period-picker";
import { EntityOption } from "./transaction-entity-option";
import { noneValue } from "./transaction-form-options";

type BulkEditItem = Pick<TransactionOutput, "recordId" | "type" | "paymentMethod" | "condition">;
type BulkEditScope = BulkUpdateTransactionsInput["scope"];
type BulkEditChanges = BulkUpdateTransactionsInput["changes"];
type FieldState = { enabled: boolean; value: string };
type BulkEditValues = {
  scope: BulkEditScope;
  fields: Record<BulkTransactionUpdateField, FieldState>;
};

export type TransactionBulkEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly BulkEditItem[];
  accounts: AccountOutput[];
  cards: CardOutput[];
  categories: CategoryOutput[];
  people: PersonOutput[];
  pending: boolean;
  onSubmit: (input: { scope: BulkEditScope; changes: BulkEditChanges }) => Promise<boolean>;
};

const fieldLabels: Record<BulkTransactionUpdateField, string> = {
  purchaseDate: "Data da compra",
  invoicePeriod: "Fatura",
  dueDate: "Vencimento",
  personId: "Pessoa",
  accountId: "Conta",
  cardId: "Cartão",
  categoryId: "Categoria",
  note: "Observação",
  amount: "Valor",
};

const scopeOptions: { value: BulkEditScope; label: string; hint: string }[] = [
  { value: "single", label: "Apenas este", hint: "Altera só a parcela selecionada." },
  {
    value: "future",
    label: "Este e os próximos",
    hint: "Altera a parcela selecionada e as seguintes.",
  },
  { value: "series", label: "Toda a série", hint: "Altera todas as parcelas da série." },
];

function createDefaultValues(): BulkEditValues {
  return {
    scope: "single",
    fields: Object.fromEntries(
      bulkTransactionUpdateFields.map((field) => [field, { enabled: false, value: "" }]),
    ) as BulkEditValues["fields"],
  };
}

/** Only the fields the user ticked; an empty due date ticked means "clear it". */
function toChanges(fields: BulkEditValues["fields"]) {
  const changes: Partial<Record<BulkTransactionUpdateField, string | number | null>> = {};
  for (const field of bulkTransactionUpdateFields) {
    const { enabled, value } = fields[field];
    if (!enabled) continue;
    if (field === "amount") changes[field] = Number(value);
    else if (field === "dueDate" && value === "") changes[field] = null;
    else changes[field] = value;
  }
  return changes;
}

/** Fields ticked by the user that a payment method of the selection cannot take. */
function getInapplicableNotices(items: readonly BulkEditItem[], fields: BulkEditValues["fields"]) {
  const checked = bulkTransactionUpdateFields.filter((field) => fields[field].enabled);
  const byMethod = new Map<PaymentMethod, Set<string>>();

  for (const item of items) {
    if (!item.paymentMethod) continue;
    for (const field of listInapplicableBulkUpdateFields(item, checked)) {
      const labels = byMethod.get(item.paymentMethod) ?? new Set<string>();
      labels.add(fieldLabels[field]);
      byMethod.set(item.paymentMethod, labels);
    }
  }

  return [...byMethod].map(([paymentMethod, labels]) => ({
    paymentMethod,
    labels: [...labels],
  }));
}

export function TransactionBulkEditDialog({
  open,
  onOpenChange,
  items,
  accounts,
  cards,
  categories,
  people,
  pending,
  onSubmit,
}: TransactionBulkEditDialogProps) {
  return (
    <MobileFormDialog onOpenChange={onOpenChange} open={open}>
      <MobileFormContent guarded>
        <DialogHeader>
          <DialogTitle>Editar em massa</DialogTitle>
          <DialogDescription>
            Marque os campos que deseja alterar. Os demais permanecem como estão.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TransactionBulkEditForm
            accounts={accounts}
            cards={cards}
            categories={categories}
            items={items}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (input) => {
              if (await onSubmit(input)) onOpenChange(false);
            }}
            pending={pending}
            people={people}
          />
        ) : null}
      </MobileFormContent>
    </MobileFormDialog>
  );
}

function RecordPicker<T extends { id: string; name: string }>({
  title,
  items,
  value,
  disabled,
  onChange,
  renderOption,
}: {
  title: string;
  items: T[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
  renderOption: (item: T | undefined) => ReactNode;
}) {
  return (
    <MobileRecordSelect
      disabled={disabled}
      onValueChange={(next) => onChange(next === null || next === noneValue ? "" : next)}
      options={items.map((item) => ({
        value: item.id,
        label: item.name,
        content: renderOption(item),
      }))}
      title={title}
      value={value || noneValue}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecione">
          {renderOption(items.find((item) => item.id === value))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {renderOption(item)}
          </SelectItem>
        ))}
      </SelectContent>
    </MobileRecordSelect>
  );
}

function TransactionBulkEditForm({
  items,
  accounts,
  cards,
  categories,
  people,
  pending,
  onCancel,
  onSubmit,
}: {
  items: readonly BulkEditItem[];
  accounts: AccountOutput[];
  cards: CardOutput[];
  categories: CategoryOutput[];
  people: PersonOutput[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: { scope: BulkEditScope; changes: BulkEditChanges }) => Promise<void>;
}) {
  const id = useId();
  const hasInstallments = items.some((item) => item.condition === "installment");
  const count = items.length;
  const plural = count === 1 ? "" : "s";
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const activeCards = cards.filter((card) => card.status === "active");
  const activePeople = people.filter((person) => person.status === "active");
  const selectableCategories = categories.filter(
    (category) => !(category.isSystem && category.name === invoicePaymentCategoryName),
  );

  const form = useForm({
    defaultValues: createDefaultValues(),
    onSubmitInvalid: showInvalidFormToast,
    onSubmit: async ({ value }) => {
      const parsed = BulkUpdateTransactionsInputSchema.shape.changes.safeParse(
        toChanges(value.fields),
      );
      if (!parsed.success) {
        showInvalidFormToast();
        return;
      }
      await onSubmit({ scope: value.scope, changes: parsed.data });
    },
  });

  function setField(field: BulkTransactionUpdateField, next: Partial<FieldState>) {
    form.setFieldValue("fields", (previous) => ({
      ...previous,
      [field]: { ...previous[field], ...next },
    }));
  }

  function renderInput(
    field: BulkTransactionUpdateField,
    state: FieldState,
    fields: BulkEditValues["fields"],
  ) {
    const onChange = (value: string) => setField(field, { value });
    switch (field) {
      case "purchaseDate":
        return <DatePicker disabled={pending} onChange={onChange} value={state.value} />;
      case "dueDate":
        return (
          <div className="flex items-center gap-2">
            <DatePicker disabled={pending} onChange={onChange} value={state.value} />
            <Button
              disabled={pending || !state.value}
              onClick={() => onChange("")}
              size="sm"
              type="button"
              variant="ghost"
            >
              Remover vencimento
            </Button>
          </div>
        );
      case "invoicePeriod":
        return (
          <InvoicePeriodPicker
            cardId={fields.cardId.enabled ? fields.cardId.value : undefined}
            onChange={onChange}
            purchaseDate={fields.purchaseDate.enabled ? fields.purchaseDate.value : undefined}
            value={state.value}
          />
        );
      case "personId":
        return (
          <RecordPicker
            disabled={pending}
            items={activePeople}
            onChange={onChange}
            renderOption={(person) => <PersonOption person={person} />}
            title="Pessoa"
            value={state.value}
          />
        );
      case "accountId":
        return (
          <RecordPicker
            disabled={pending}
            items={activeAccounts}
            onChange={onChange}
            renderOption={(account) => <EntityOption entity={account} />}
            title="Conta"
            value={state.value}
          />
        );
      case "cardId":
        return (
          <RecordPicker
            disabled={pending}
            items={activeCards}
            onChange={onChange}
            renderOption={(card) => <EntityOption entity={card} />}
            title="Cartão"
            value={state.value}
          />
        );
      case "categoryId":
        return (
          <CategoryPicker
            categories={selectableCategories}
            disabled={pending}
            onChange={onChange}
            onCreate={() => toast.info("Crie a categoria antes de editar em massa.")}
            value={state.value}
          />
        );
      case "note":
        return (
          <Input
            disabled={pending}
            maxLength={1000}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Observação"
            value={state.value}
          />
        );
      case "amount":
        return (
          <CurrencyInput
            aria-label="Novo valor"
            disabled={pending}
            onValueChange={onChange}
            placeholder="R$ 0,00"
            value={state.value}
          />
        );
    }
  }

  return (
    <form
      className="grid gap-4"
      data-mobile-page-form
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

      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const notices = getInapplicableNotices(items, values.fields);
          const hasChanges = bulkTransactionUpdateFields.some(
            (field) => values.fields[field].enabled,
          );

          return (
            <>
              {bulkTransactionUpdateFields.map((field) => {
                const state = values.fields[field];
                const checkboxId = `${id}-${field}`;

                return (
                  <div className="grid gap-2" key={field}>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={state.enabled}
                        disabled={pending}
                        id={checkboxId}
                        onCheckedChange={(checked) =>
                          setField(field, { enabled: checked === true })
                        }
                      />
                      <Label className="cursor-pointer font-mono font-normal" htmlFor={checkboxId}>
                        {fieldLabels[field]}
                      </Label>
                    </div>
                    {state.enabled ? renderInput(field, state, values.fields) : null}
                  </div>
                );
              })}

              {hasInstallments ? (
                <fieldset className="grid gap-2">
                  <legend className="font-mono mb-1 text-sm font-medium">
                    Escopo das parcelas
                  </legend>
                  <RadioGroup
                    disabled={pending}
                    onValueChange={(scope) => form.setFieldValue("scope", scope as BulkEditScope)}
                    value={values.scope}
                  >
                    {scopeOptions.map((option) => (
                      <Label
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary has-data-checked:bg-accent"
                        htmlFor={`${id}-scope-${option.value}`}
                        key={option.value}
                      >
                        <RadioGroupItem
                          className="mt-0.5"
                          id={`${id}-scope-${option.value}`}
                          value={option.value}
                        />
                        <span className="grid gap-0.5">
                          <span className="font-medium text-sm">{option.label}</span>
                          <span className="text-muted-foreground text-xs">{option.hint}</span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                </fieldset>
              ) : null}

              {notices.map((notice) => (
                <p className="text-destructive text-sm" key={notice.paymentMethod} role="status">
                  {`Não se aplica a ${paymentMethodLabels[notice.paymentMethod]}: ${notice.labels.join(", ")}. Desmarque esses campos para atualizar a seleção.`}
                </p>
              ))}

              <div className="flex justify-end gap-2">
                <Button disabled={pending} onClick={onCancel} type="button" variant="outline">
                  Cancelar
                </Button>
                <Button disabled={pending || !hasChanges} type="submit">
                  {`Aplicar a ${count} lançamento${plural}`}
                </Button>
              </div>
            </>
          );
        }}
      </form.Subscribe>
    </form>
  );
}
