import { resolveTransactionColumnOrder } from "@openmonetis/domain/preferences";
import { ChevronDown, ChevronUp, Rows3 } from "lucide-react";
import { useId } from "react";
import { SettingsSection } from "@/components/settings-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { transactionColumnLabels } from "../preferences.presentation";
import type { PreferencesFormApi } from "../usePreferencesForm";

export function PreferencesTransactionsListSection({
  form,
  disabled: isMutating,
}: {
  form: PreferencesFormApi;
  disabled: boolean;
}) {
  const groupByDateId = useId();
  const noteAsColumnId = useId();
  const hideAnticipatedId = useId();
  return (
    <SettingsSection
      description="Como a lista de lançamentos aparece em todos os seus dispositivos."
      icon={Rows3}
      title="Lista de lançamentos"
    >
      <div className="grid gap-4">
        <form.Field name="groupTransactionsByDate">
          {(field) => (
            <PreferenceSwitchRow
              checked={field.state.value}
              description="Mostra um cabeçalho com a data antes de cada dia."
              disabled={isMutating}
              id={groupByDateId}
              label="Agrupar por data"
              onCheckedChange={field.handleChange}
            />
          )}
        </form.Field>

        <form.Field name="transactionNoteAsColumn">
          {(field) => (
            <PreferenceSwitchRow
              checked={field.state.value}
              description="Mostra a anotação numa coluna própria em vez de abaixo da descrição."
              disabled={isMutating}
              id={noteAsColumnId}
              label="Anotação como coluna"
              onCheckedChange={field.handleChange}
            />
          )}
        </form.Field>

        <form.Field name="hideAnticipatedInstallments">
          {(field) => (
            <PreferenceSwitchRow
              checked={field.state.value}
              description="Esconde da lista as parcelas que você antecipou. Saldos e faturas não mudam."
              disabled={isMutating}
              id={hideAnticipatedId}
              label="Ocultar parcelas antecipadas"
              onCheckedChange={field.handleChange}
            />
          )}
        </form.Field>

        <form.Field name="transactionsColumnOrder">
          {(field) => {
            const order = resolveTransactionColumnOrder(field.state.value, { noteAsColumn: true });
            const moveColumn = (index: number, offset: -1 | 1) => {
              const next = [...order];
              const [column] = next.splice(index, 1);
              next.splice(index + offset, 0, column);
              field.handleChange(next);
            };

            return (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm">Ordem das colunas</p>
                    <p className="mt-1 text-muted-foreground text-sm">
                      A seleção fica sempre primeiro e Ações sempre por último.
                    </p>
                  </div>
                  <Button
                    disabled={isMutating}
                    onClick={() => field.handleChange(null)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Restaurar ordem
                  </Button>
                </div>
                <ol className="grid gap-1.5">
                  {order.map((column, index) => {
                    const label = transactionColumnLabels[column];
                    return (
                      <li
                        className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                        key={column}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-5 font-mono text-muted-foreground text-xs tabular-nums">
                            {index + 1}
                          </span>
                          <span className="text-sm">{label}</span>
                          {column === "note" ? (
                            <Badge variant="secondary">com Anotação como coluna</Badge>
                          ) : null}
                        </span>
                        <span className="flex gap-1">
                          <Button
                            aria-label={`Mover ${label} para cima`}
                            disabled={isMutating || index === 0}
                            onClick={() => moveColumn(index, -1)}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            aria-label={`Mover ${label} para baixo`}
                            disabled={isMutating || index === order.length - 1}
                            onClick={() => moveColumn(index, 1)}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <ChevronDown />
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          }}
        </form.Field>
      </div>
    </SettingsSection>
  );
}

function PreferenceSwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-1">
      <div className="flex min-w-0 items-start gap-3">
        <div>
          <Label
            className="cursor-pointer normal-case font-mono text-sm tracking-normal"
            htmlFor={id}
          >
            {label}
          </Label>
          <p className="mt-1 text-muted-foreground text-sm leading-relaxed" id={`${id}-description`}>
            {description}
          </p>
        </div>
      </div>
      <Switch
        aria-describedby={`${id}-description`}
        checked={checked}
        className="mt-0.5 shrink-0"
        disabled={disabled}
        id={id}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
