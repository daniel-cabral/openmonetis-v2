import type { InvoiceClosure } from "@openmonetis/domain/reconciliations-closure";
import type {
  PaidAfterEnd,
  ProjectionComparison,
} from "@openmonetis/domain/reconciliations-projection";
import { dateOnlyToSafeInstant, formatDateInBrazil } from "@openmonetis/shared/date-time";
import type { ReconciliationPreview } from "@openmonetis/validators/reconciliations";
import { formatCurrency } from "../../lib/money-presentation";
import type { ClosureView, ProjectionView } from "./components/reconciliation-review";

type PreviewLine = ReconciliationPreview["lines"][number];
type Suspicion = PreviewLine["suspicions"][number];
type MatchRule = NonNullable<PreviewLine["rule"]>;
type KeptAmountReason = NonNullable<PreviewLine["alignment"]["reason"]>;

export const reconciliationSectionTitles = {
  "needs-decision": "Precisa da sua decisão",
  matched: "Casadas",
  "bank-only": "Só no banco",
  ambiguous: "Ambíguas",
  "app-only": "Só no app",
  ignored: "Ignoradas",
  informational: "Informativas",
} as const;

const matchRuleLabels: Record<MatchRule, string> = {
  identity: "identificação",
  installment: "parcela",
  exact: "valor exato",
  cents: "centavos",
  "name-period": "nome e período",
};

const keptAmountReasonLabels: Record<KeptAmountReason, string> = {
  splits: "Lançamento dividido entre pessoas: o valor do app é mantido.",
  transfer: "Transferência entre contas: o valor do app é mantido.",
  generated:
    "Lançamento gerado automaticamente (ex.: pagamento de fatura): o valor do app é mantido.",
  "paid-invoice": "Fatura já paga: o valor do app é mantido.",
  "card-recurring": "Recorrência de cartão: o valor do app é mantido.",
};

export const reconciliationAlignmentNote =
  "O valor do lançamento será alinhado ao do arquivo ao aplicar. O desfazer restaura o anterior.";

const reconciliationErrorMessages: Partial<Record<string, string>> = {
  RECONCILIATION_STALE: "O arquivo mudou de situação desde a leitura. Leia o arquivo de novo.",
  RECONCILIATION_NOTHING_TO_APPLY: "Nenhuma alteração para aplicar.",
  RECONCILIATION_EMPTY_NAME: "Informe o nome de todos os lançamentos novos.",
  RECONCILIATION_INVOICE_PERIOD_REQUIRED: "Escolha o período da fatura para conciliar o cartão.",
  RECONCILIATION_BATCH_NOT_FOUND: "Esta conciliação não existe ou já foi desfeita.",
  INVOICE_ALREADY_PAID: "Esta fatura já está paga. Não é possível criar lançamentos nela.",
};

const genericReconciliationError = "Não foi possível concluir a conciliação.";

function requiredField<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Reconciliation suspicion is missing a field required by its reason");
  }
  return value;
}

function formatShortDate(date: string) {
  return formatDateInBrazil(dateOnlyToSafeInstant(date), { day: "2-digit", month: "2-digit" });
}

export function formatSuspicionReason(suspicion: Suspicion, entryName: string) {
  if (suspicion.reason === "before-file-start") {
    const entryDate = formatShortDate(requiredField(suspicion.entryDate));
    const fileStartDate = formatShortDate(requiredField(suspicion.fileStartDate));
    return `Casou com “${entryName}” de ${entryDate}, antes do início do arquivo (${fileStartDate}). O débito desse lançamento pode ter sido outro.`;
  }
  const appAmount = formatCurrency(requiredField(suspicion.appAmount));
  return `Valor diferente: o lançamento “${entryName}” tem ${appAmount}. Manter alinha o valor ao do arquivo.`;
}

export function formatKeptAmountReason(reason: KeptAmountReason) {
  return keptAmountReasonLabels[reason];
}

export function formatMatchRule(rule: MatchRule) {
  return matchRuleLabels[rule];
}

export function formatReconciliationResult(result: {
  created: number;
  reconciled: number;
  ignored: number;
}) {
  return `${result.created} criados, ${result.reconciled} conciliados, ${result.ignored} ignorados.`;
}

export function formatSkippedWarning(skipped: number) {
  if (skipped === 0) return null;
  return `${skipped} linha(s) não foram criadas: já estão vinculadas a lançamentos de outro período.`;
}

export function formatReconciliationError(code: string | null | undefined) {
  return (code && reconciliationErrorMessages[code]) || genericReconciliationError;
}

export const invoiceCreditLineLabel = "Crédito da fatura";

export function formatCents(cents: number) {
  return formatCurrency(cents / 100);
}

export function formatProjectionBadge(comparison: ProjectionComparison) {
  return comparison.matches
    ? { tone: "success" as const, label: "Bate" }
    : {
        tone: "warning" as const,
        label: `Diferença de ${formatCents(comparison.differenceCents)}`,
      };
}

export function formatProjectionLine(view: ProjectionView) {
  if (view.kind === "card") {
    const projected = `Total da fatura no app após aplicar: ${formatCents(view.projectedCents)}`;
    return view.targetCents === null
      ? `${projected} · Informe o total da fatura para comparar`
      : `${projected} · Total informado: ${formatCents(view.targetCents)}`;
  }
  const projected = `Saldo do app após aplicar: ${formatCents(view.projectedCents)}`;
  return view.target === null
    ? `${projected} · Saldo final do extrato indisponível`
    : `${projected} · Saldo final do extrato (${formatShortDate(view.target.date)}): ${formatCents(view.target.cents)}`;
}

export function formatPaidAfterEndSummary(count: number) {
  return `${count} lançamento(s) pago(s) depois do fim do arquivo`;
}

export function formatPaidAfterEndItem(item: PaidAfterEnd) {
  return {
    label: `${item.name} (${formatShortDate(item.date)})`,
    amount: formatCents(item.signedCents),
  };
}

export function formatStatementClosureSummary(view: Extract<ClosureView, { kind: "statement" }>) {
  const { closure } = view;
  const unverified =
    closure.unverifiedDays.length > 0
      ? `${closure.unverifiedDays.length} dia(s) não verificável(is): ${closure.unverifiedDays.map(formatShortDate).join(", ")}`
      : null;
  if (closure.closes) {
    return {
      tone: "success" as const,
      badge: "Fecha",
      text: "Todos os dias contábeis batem com o saldo do extrato.",
      divergences: [],
      unverified,
    };
  }
  return {
    tone: "destructive" as const,
    badge: "Não fecha",
    text: `${closure.divergences.length} dia(s) com divergência.`,
    divergences: closure.divergences.map(
      (day) =>
        `${formatShortDate(day.day)}: movimento ${formatCents(day.movementCents)} · soma das linhas ${formatCents(day.sumCents)} · diferença de ${formatCents(Math.abs(day.differenceCents))}`,
    ),
    unverified,
  };
}

export function formatInvoiceClosureSummary(closure: InvoiceClosure) {
  const totals = `Soma do arquivo: ${formatCents(closure.netCents)} · Total informado: ${formatCents(closure.expectedCents)}`;
  return closure.closes
    ? { tone: "success" as const, badge: "Fecha", text: totals }
    : {
        tone: "destructive" as const,
        badge: "Não fecha",
        text: `${totals} · diferença de ${formatCents(Math.abs(closure.differenceCents))}`,
      };
}
