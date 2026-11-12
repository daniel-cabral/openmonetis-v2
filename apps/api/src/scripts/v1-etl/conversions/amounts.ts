import type { AccountType } from "@openmonetis/domain/accounts";
import type { CardBrand } from "@openmonetis/domain/cards";
import type { CategoryType } from "@openmonetis/domain/categories";
import { toCents } from "@openmonetis/domain/money";
import type { PaymentMethod, TransactionCondition } from "@openmonetis/domain/transactions";

export const PAYMENT_METHOD_MAP: Record<string, PaymentMethod> = {
  "Cartão de crédito": "credit_card",
  "Cartão de débito": "debit_card",
  Pix: "pix",
  Dinheiro: "cash",
  Boleto: "boleto",
  "Pré-Pago | VR/VA": "benefits",
  "Transferência bancária": "bank_transfer",
};

export const CATEGORY_TYPE_MAP: Record<string, CategoryType> = {
  despesa: "expense",
  receita: "income",
};

export const ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  "Conta Corrente": "checking",
  "Conta Poupança": "savings",
  "Carteira Digital": "checking",
  "Conta Investimento": "investment",
  Dinheiro: "cash",
  "Pré-Pago | VR/VA": "benefits",
  Outros: "other",
};

export const CARD_BRAND_MAP: Record<string, CardBrand> = {
  visa: "visa",
  mastercard: "mastercard",
  elo: "elo",
  amex: "amex",
  hipercard: "hipercard",
};

export const PERSON_STATUS_MAP: Record<string, "active" | "inactive"> = {
  Ativo: "active",
  Ativa: "active",
  Inativo: "inactive",
  Inativa: "inactive",
};

export const CONDITION_MAP: Record<string, TransactionCondition> = {
  "À vista": "single",
  Parcelado: "installment",
  Recorrente: "recurring",
};

export function toTypedAmount(
  valor: string,
):
  | { ok: true; type: "income" | "expense"; amountCents: number }
  | { ok: false; reason: "zero" | "precision" } {
  const value = Number(valor);
  if (value === 0) return { ok: false, reason: "zero" };

  const [, fraction = ""] = valor.split(".");
  if (fraction.replace(/0+$/, "").length > 2) return { ok: false, reason: "precision" };

  return {
    ok: true,
    type: value < 0 ? "expense" : "income",
    amountCents: toCents(Math.abs(value)),
  };
}

export function mapAccountType(v: string): { type: AccountType; unknown: boolean } {
  if (!Object.hasOwn(ACCOUNT_TYPE_MAP, v)) return { type: "other", unknown: true };
  return { type: ACCOUNT_TYPE_MAP[v], unknown: false };
}

export function mapCardBrand(v: string | null): { brand: CardBrand; unknown: boolean } {
  if (v === null) return { brand: "other", unknown: false };
  const key = v.toLowerCase();
  if (!Object.hasOwn(CARD_BRAND_MAP, key)) return { brand: "other", unknown: true };
  return { brand: CARD_BRAND_MAP[key], unknown: false };
}
