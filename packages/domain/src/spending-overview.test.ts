import assert from "node:assert/strict";
import test from "node:test";
import type {
  EstablishmentPurchaseEntry,
  EstablishmentRecurringRule,
} from "./establishments-report";
import { calculateSpendingOverview } from "./spending-overview";

const period = "2026-06";

function purchase(
  overrides: Pick<EstablishmentPurchaseEntry, "name" | "period" | "amount"> &
    Partial<EstablishmentPurchaseEntry>,
): EstablishmentPurchaseEntry {
  return {
    origin: "regular",
    transactionType: "expense",
    excludeFromBalance: false,
    categoryId: null,
    categoryName: null,
    categoryIcon: null,
    isInvoicePaymentCategory: false,
    tripId: null,
    ...overrides,
  };
}

function recurringRule(
  overrides: Partial<EstablishmentRecurringRule> & Pick<EstablishmentRecurringRule, "name">,
): EstablishmentRecurringRule {
  return {
    amount: "99.90",
    anchorDate: "2026-01-05",
    startDate: "2026-01-05",
    endDate: null,
    frequency: "monthly",
    paymentMethod: "pix",
    dueDate: null,
    status: "active",
    card: null,
    categoryId: null,
    categoryName: null,
    categoryIcon: null,
    isInvoicePaymentCategory: false,
    transactionType: "expense",
    ...overrides,
  };
}

test("spending overview ranks only eligible period expenses and active recurring occurrences", () => {
  const eligible = [
    purchase({
      id: "t01",
      name: "Mercado",
      period,
      purchaseDate: "2026-06-02",
      amount: "320.50",
      categoryIcon: "shopping-cart",
    }),
    purchase({
      id: "t02",
      name: "Posto",
      period,
      purchaseDate: "2026-06-03",
      amount: "210.00",
      categoryIcon: "fuel",
    }),
    purchase({
      id: "t03",
      name: "Restaurante",
      period,
      purchaseDate: "2026-06-04",
      amount: "180.00",
      categoryIcon: "utensils",
    }),
    purchase({
      id: "t04",
      name: "Farmacia",
      period,
      purchaseDate: "2026-06-05",
      amount: "95.90",
      categoryIcon: "pill",
    }),
    purchase({
      id: "t05",
      name: "Fatura de energia",
      period,
      purchaseDate: "2026-06-06",
      amount: "250.00",
      categoryIcon: "zap",
    }),
    purchase({
      id: "t06",
      name: "Academia",
      period,
      purchaseDate: "2026-06-07",
      amount: "120.00",
      categoryIcon: "dumbbell",
    }),
    purchase({
      id: "t07",
      name: "Mercado",
      period,
      purchaseDate: "2026-06-08",
      amount: "150.00",
      categoryIcon: null,
    }),
    purchase({ id: "t08", name: "Livraria", period, purchaseDate: "2026-06-09", amount: "60.00" }),
    purchase({
      id: "t09",
      name: "Streaming",
      period,
      purchaseDate: "2026-06-10",
      amount: "75.00",
      categoryIcon: "tv",
    }),
    purchase({
      id: "t10",
      name: "Padaria",
      period,
      purchaseDate: "2026-06-11",
      amount: "30.00",
      categoryIcon: "croissant",
    }),
    purchase({
      id: "t11",
      name: "Padaria",
      period,
      purchaseDate: "2026-06-12",
      amount: "25.00",
      categoryIcon: "croissant",
    }),
    purchase({
      id: "t12",
      name: "Oficina",
      period,
      purchaseDate: "2026-06-13",
      amount: "75.00",
      categoryIcon: "wrench",
    }),
  ];
  const excluded = [
    purchase({
      id: "x01",
      name: "Pagamento cartao",
      period,
      purchaseDate: "2026-06-14",
      amount: "999.00",
      origin: "invoicePayment",
    }),
    purchase({
      id: "x02",
      name: "Estorno Loja",
      period,
      purchaseDate: "2026-06-14",
      amount: "500.00",
      origin: "refund",
    }),
    purchase({
      id: "x03",
      name: "Ajuste saldo",
      period,
      purchaseDate: "2026-06-14",
      amount: "400.00",
      origin: "accountBalanceAdjustment",
    }),
    purchase({
      id: "x04",
      name: "Acerto pessoa",
      period,
      purchaseDate: "2026-06-14",
      amount: "300.00",
      origin: "personSettlement",
    }),
    purchase({
      id: "x05",
      name: "Conta excluida",
      period,
      purchaseDate: "2026-06-14",
      amount: "350.00",
      excludeFromBalance: true,
    }),
    purchase({
      id: "x06",
      name: "Categoria fatura",
      period,
      purchaseDate: "2026-06-14",
      amount: "280.00",
      isInvoicePaymentCategory: true,
    }),
    purchase({
      id: "x07",
      name: "Transferencia",
      period,
      purchaseDate: "2026-06-14",
      amount: "260.00",
      transactionType: "transfer",
    }),
    purchase({
      id: "x08",
      name: "Salario",
      period,
      purchaseDate: "2026-06-14",
      amount: "5000.00",
      transactionType: "income",
    }),
    purchase({
      id: "x09",
      name: "Mercado",
      period: "2026-05",
      purchaseDate: "2026-05-30",
      amount: "900.00",
    }),
  ];
  const recurringRules = [
    recurringRule({ id: "r-assinatura", name: "Assinatura", amount: "90.00" }),
    recurringRule({ id: "r-antigo", name: "Plano antigo", amount: "500.00", status: "paused" }),
  ];

  const result = calculateSpendingOverview({
    period,
    entries: [...eligible, ...excluded],
    recurringRules,
  });

  assert.deepEqual(
    result.topExpenses.map((expense) => [expense.name, expense.purchaseDate, expense.amountCents]),
    [
      ["Mercado", "2026-06-02", 32050],
      ["Fatura de energia", "2026-06-06", 25000],
      ["Posto", "2026-06-03", 21000],
      ["Restaurante", "2026-06-04", 18000],
      ["Mercado", "2026-06-08", 15000],
      ["Academia", "2026-06-07", 12000],
      ["Farmacia", "2026-06-05", 9590],
      ["Assinatura", "2026-06-05", 9000],
      ["Oficina", "2026-06-13", 7500],
      ["Streaming", "2026-06-10", 7500],
    ],
  );
  assert.deepEqual(
    result.topEstablishments.map((item) => [
      item.name,
      item.count,
      item.totalCents,
      item.categoryIcon,
    ]),
    [
      ["Mercado", 2, 47050, "shopping-cart"],
      ["Padaria", 2, 5500, "croissant"],
      ["Fatura de energia", 1, 25000, "zap"],
      ["Posto", 1, 21000, "fuel"],
      ["Restaurante", 1, 18000, "utensils"],
      ["Academia", 1, 12000, "dumbbell"],
      ["Farmacia", 1, 9590, "pill"],
      ["Assinatura", 1, 9000, null],
      ["Oficina", 1, 7500, "wrench"],
      ["Streaming", 1, 7500, "tv"],
    ],
  );
});

test("spending overview is empty when the period has no eligible expense", () => {
  assert.deepEqual(calculateSpendingOverview({ period, entries: [], recurringRules: [] }), {
    topExpenses: [],
    topEstablishments: [],
  });
});
