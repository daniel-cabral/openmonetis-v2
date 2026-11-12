import type { CategoryOutput } from "@openmonetis/validators/categories";
import type { PersonOutput } from "@openmonetis/validators/people";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MobileDatePicker as DatePicker } from "@/components/forms/mobile-date-picker";
import { MobileRecordSelect } from "@/components/forms/mobile-record-select";
import { MobileSelectContent as SelectContent } from "@/components/forms/mobile-select-content";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { CategoryPicker } from "@/features/categories/components/category-picker";
import { PersonOption } from "@/features/people/components/person-option";

import { noneValue } from "./transaction-form-options";

export type MassAddRowValues = {
  id: string;
  purchaseDate: string;
  name: string;
  amount: string;
  categoryId: string;
  personId: string;
};

export type MassAddRowField = Exclude<keyof MassAddRowValues, "id">;

export function TransactionMassAddRow({
  index,
  row,
  people,
  categories,
  disabled,
  errorField,
  errorMessage,
  onChange,
  onRemove,
}: {
  index: number;
  row: MassAddRowValues;
  people: PersonOutput[];
  categories: CategoryOutput[];
  disabled: boolean;
  errorField?: MassAddRowField;
  errorMessage?: string;
  onChange: (field: MassAddRowField, value: string) => void;
  onRemove: () => void;
}) {
  const rowNumber = index + 1;

  return (
    <>
      <TableRow>
        <TableCell className="align-top">
          <DatePicker
            aria-invalid={errorField === "purchaseDate"}
            disabled={disabled}
            onChange={(value) => onChange("purchaseDate", value)}
            value={row.purchaseDate}
          />
        </TableCell>
        <TableCell className="align-top">
          <Input
            aria-invalid={errorField === "name"}
            aria-label={`Estabelecimento da linha ${rowNumber}`}
            disabled={disabled}
            maxLength={160}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="Ex.: Restaurante"
            value={row.name}
          />
        </TableCell>
        <TableCell className="align-top">
          <CurrencyInput
            aria-invalid={errorField === "amount"}
            aria-label={`Valor da linha ${rowNumber}`}
            disabled={disabled}
            onValueChange={(value) => onChange("amount", value)}
            placeholder="R$ 0,00"
            value={row.amount}
          />
        </TableCell>
        <TableCell className="align-top">
          <CategoryPicker
            categories={categories}
            disabled={disabled}
            invalid={errorField === "categoryId"}
            onChange={(id) => onChange("categoryId", id)}
            onCreate={() => toast.info("Crie a categoria antes de adicionar em massa.")}
            value={row.categoryId}
          />
        </TableCell>
        <TableCell className="align-top">
          <MobileRecordSelect
            disabled={disabled}
            invalid={errorField === "personId"}
            onValueChange={(value) =>
              onChange("personId", value === noneValue || value === null ? "" : value)
            }
            options={[
              { value: noneValue, label: "Selecione" },
              ...people.map((person) => ({
                value: person.id,
                label: person.name,
                content: <PersonOption person={person} />,
              })),
            ]}
            title="Pessoa responsável"
            value={row.personId || noneValue}
          >
            <SelectTrigger className="w-full" aria-invalid={errorField === "personId"}>
              <SelectValue placeholder="Selecione">
                <PersonOption person={people.find((person) => person.id === row.personId)} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={noneValue}>Selecione</SelectItem>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  <PersonOption person={person} />
                </SelectItem>
              ))}
            </SelectContent>
          </MobileRecordSelect>
        </TableCell>
        <TableCell className="align-top">
          <Button
            aria-label={`Remover linha ${rowNumber}`}
            disabled={disabled}
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </TableCell>
      </TableRow>
      {errorMessage ? (
        <TableRow className="border-b-0 hover:bg-transparent">
          <TableCell className="pt-0" colSpan={6}>
            <p className="text-destructive text-xs" role="alert">
              {`Linha ${rowNumber}: ${errorMessage}`}
            </p>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
