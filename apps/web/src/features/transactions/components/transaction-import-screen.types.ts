import type { AccountOutput } from "@openmonetis/validators/accounts";
import type { CardOutput } from "@openmonetis/validators/cards";
import type { CategoryOutput } from "@openmonetis/validators/categories";
import type { PersonOutput } from "@openmonetis/validators/people";
import type {
  TransactionImportDetection,
  TransactionImportPreview,
} from "@openmonetis/validators/transactions";
import type { TransactionImportPreviewOptions } from "../transactions.api";

export type PreviewRow = TransactionImportPreview["transactions"][number];

export type ReviewRow = PreviewRow & {
  rowKey: string;
  selected: boolean;
  personId: string;
  categoryId: string;
};

export type Props = {
  accounts: AccountOutput[];
  cards: CardOutput[];
  categories: CategoryOutput[];
  people: PersonOutput[];
  isLoadingOptions: boolean;
  isDownloadingTemplate: boolean;
  isPreviewing: boolean;
  isImporting: boolean;
  onDetect: (file: File) => Promise<TransactionImportDetection>;
  onPreview: (
    file: File,
    options?: TransactionImportPreviewOptions,
  ) => Promise<TransactionImportPreview>;
  onDownloadTemplate: () => Promise<{ fileName: string; contentBase64: string }>;
  onImport: (
    input: import("@openmonetis/validators/transactions").ImportTransactionsInput,
    onImported: () => void,
  ) => Promise<void>;
};
