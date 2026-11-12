import {
  type AttachmentSizeLimitMb,
  attachmentSizeLimitOptionsMb,
  defaultAttachmentSizeLimitMb,
} from "./attachments";
import { type PaymentMethod, paymentMethods } from "./transactions";

export const applicationThemes = ["system", "light", "dark"] as const;
export const transactionColumnIds = [
  "name",
  "amount",
  "condition",
  "paymentMethod",
  "note",
  "account",
] as const;
export const notificationDueSoonDayOptions = [1, 3, 5, 7] as const;
export const transactionPageSizeOptions = [20, 30, 50] as const;
export const mobileShortcutDestinations = [
  "accounts",
  "cards",
  "budgets",
  "goals",
  "people",
  "categories",
  "notes",
  "attachments",
  "inbox",
] as const;
export const startPageDestinations = [
  "dashboard",
  "transactions",
  "accounts",
  "cards",
  "budgets",
  "inbox",
] as const;

export type ApplicationTheme = (typeof applicationThemes)[number];
export type TransactionColumnId = (typeof transactionColumnIds)[number];
export type NotificationDueSoonDays = (typeof notificationDueSoonDayOptions)[number];
export type TransactionPageSize = (typeof transactionPageSizeOptions)[number];
export type MobileShortcutDestination = (typeof mobileShortcutDestinations)[number];
export type StartPageDestination = (typeof startPageDestinations)[number];

export type UserPreferences = {
  theme: ApplicationTheme;
  hideValuesOnStart: boolean;
  defaultPaymentMethod: PaymentMethod;
  defaultAccountId: string | null;
  defaultCardId: string | null;
  notificationDueSoonDays: NotificationDueSoonDays;
  transactionsPageSize: TransactionPageSize;
  mobileShortcut: MobileShortcutDestination;
  startPage: StartPageDestination;
  transactionsColumnOrder: TransactionColumnId[] | null;
  groupTransactionsByDate: boolean;
  hideAnticipatedInstallments: boolean;
  showTransactionSummary: boolean;
  transactionNoteAsColumn: boolean;
  attachmentMaxSizeMb: AttachmentSizeLimitMb;
};

export type UserPreferencesRecord = {
  theme: string;
  hideValuesOnStart: boolean;
  defaultPaymentMethod: string;
  defaultAccountId: string | null;
  defaultCardId: string | null;
  notificationDueSoonDays: number;
  transactionsPageSize: number;
  mobileShortcut: string;
  startPage: string;
  transactionsColumnOrder: string[] | null;
  groupTransactionsByDate: boolean;
  hideAnticipatedInstallments: boolean;
  showTransactionSummary: boolean;
  transactionNoteAsColumn: boolean;
  attachmentMaxSizeMb: number;
};

const applicationThemeSet = new Set<string>(applicationThemes);
const transactionColumnIdSet = new Set<string>(transactionColumnIds);
const attachmentSizeLimitSet = new Set<number>(attachmentSizeLimitOptionsMb);
const notificationDueSoonDaySet = new Set<number>(notificationDueSoonDayOptions);
const paymentMethodSet = new Set<string>(paymentMethods);
const transactionPageSizeSet = new Set<number>(transactionPageSizeOptions);
const mobileShortcutDestinationSet = new Set<string>(mobileShortcutDestinations);
const startPageDestinationSet = new Set<string>(startPageDestinations);

export function createDefaultUserPreferences(): UserPreferences {
  return {
    theme: "system",
    hideValuesOnStart: false,
    defaultPaymentMethod: "credit_card",
    defaultAccountId: null,
    defaultCardId: null,
    notificationDueSoonDays: 5,
    transactionsPageSize: 30,
    mobileShortcut: "accounts",
    startPage: "dashboard",
    transactionsColumnOrder: null,
    groupTransactionsByDate: true,
    hideAnticipatedInstallments: false,
    showTransactionSummary: true,
    transactionNoteAsColumn: false,
    attachmentMaxSizeMb: defaultAttachmentSizeLimitMb,
  };
}

export function resolveTransactionColumnOrder(
  saved: readonly string[] | null,
  options: { noteAsColumn: boolean },
): TransactionColumnId[] {
  const order = [
    ...new Set([...toKnownTransactionColumnIds(saved ?? []), ...transactionColumnIds]),
  ];
  return options.noteAsColumn ? order : order.filter((id) => id !== "note");
}

export function excludeAnticipatedInstallments<T extends { anticipationId: string | null }>(
  items: readonly T[],
  hide: boolean,
): T[] {
  return hide ? items.filter((item) => item.anticipationId === null) : [...items];
}

export function normalizeUserPreferences(
  preferences?: Partial<UserPreferencesRecord> | null,
): UserPreferences {
  const defaults = createDefaultUserPreferences();
  if (!preferences) return defaults;

  return {
    theme: applicationThemeSet.has(preferences.theme ?? "")
      ? (preferences.theme as ApplicationTheme)
      : defaults.theme,
    hideValuesOnStart:
      typeof preferences.hideValuesOnStart === "boolean"
        ? preferences.hideValuesOnStart
        : defaults.hideValuesOnStart,
    defaultPaymentMethod: paymentMethodSet.has(preferences.defaultPaymentMethod ?? "")
      ? (preferences.defaultPaymentMethod as PaymentMethod)
      : defaults.defaultPaymentMethod,
    defaultAccountId:
      typeof preferences.defaultAccountId === "string" ? preferences.defaultAccountId : null,
    defaultCardId: typeof preferences.defaultCardId === "string" ? preferences.defaultCardId : null,
    notificationDueSoonDays: notificationDueSoonDaySet.has(
      preferences.notificationDueSoonDays ?? Number.NaN,
    )
      ? (preferences.notificationDueSoonDays as NotificationDueSoonDays)
      : defaults.notificationDueSoonDays,
    transactionsPageSize: transactionPageSizeSet.has(preferences.transactionsPageSize ?? Number.NaN)
      ? (preferences.transactionsPageSize as TransactionPageSize)
      : defaults.transactionsPageSize,
    mobileShortcut: mobileShortcutDestinationSet.has(preferences.mobileShortcut ?? "")
      ? (preferences.mobileShortcut as MobileShortcutDestination)
      : defaults.mobileShortcut,
    startPage: startPageDestinationSet.has(preferences.startPage ?? "")
      ? (preferences.startPage as StartPageDestination)
      : defaults.startPage,
    transactionsColumnOrder: normalizeTransactionsColumnOrder(preferences.transactionsColumnOrder),
    groupTransactionsByDate:
      typeof preferences.groupTransactionsByDate === "boolean"
        ? preferences.groupTransactionsByDate
        : defaults.groupTransactionsByDate,
    hideAnticipatedInstallments:
      typeof preferences.hideAnticipatedInstallments === "boolean"
        ? preferences.hideAnticipatedInstallments
        : defaults.hideAnticipatedInstallments,
    showTransactionSummary:
      typeof preferences.showTransactionSummary === "boolean"
        ? preferences.showTransactionSummary
        : defaults.showTransactionSummary,
    transactionNoteAsColumn:
      typeof preferences.transactionNoteAsColumn === "boolean"
        ? preferences.transactionNoteAsColumn
        : defaults.transactionNoteAsColumn,
    attachmentMaxSizeMb: attachmentSizeLimitSet.has(preferences.attachmentMaxSizeMb ?? Number.NaN)
      ? (preferences.attachmentMaxSizeMb as AttachmentSizeLimitMb)
      : defaults.attachmentMaxSizeMb,
  };
}

function toKnownTransactionColumnIds(ids: readonly string[]) {
  return ids.filter((id): id is TransactionColumnId => transactionColumnIdSet.has(id));
}

function normalizeTransactionsColumnOrder(
  order: string[] | null | undefined,
): TransactionColumnId[] | null {
  if (!Array.isArray(order)) return null;
  const known = [...new Set(toKnownTransactionColumnIds(order))];
  return known.length > 0 ? known : null;
}
