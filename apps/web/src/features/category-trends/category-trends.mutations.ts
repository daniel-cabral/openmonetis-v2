import type { CategoryTrendsOutput } from "@openmonetis/validators/category-trends";
import { useMutation } from "@tanstack/react-query";
import { downloadBlob } from "@/lib/download-blob";
import { formatExportGeneratedAt } from "../transactions/transactions.presentation";
import {
  buildCategoryTrendsExportTable,
  downloadCategoryTrendsCsv,
  getCategoryTrendsExportFileName,
  toCategoryTrendsPdfTable,
  toCategoryTrendsXlsxSheet,
} from "./category-trends.presentation";

export type CategoryTrendsExportFormat = "csv" | "xlsx" | "pdf";

export function useExportCategoryTrendsMutation() {
  return useMutation({
    mutationFn: async ({
      report,
      format,
    }: {
      report: CategoryTrendsOutput;
      format: CategoryTrendsExportFormat;
    }) => {
      if (format === "csv") {
        downloadCategoryTrendsCsv(report);
      } else if (format === "xlsx") {
        const { buildXlsx } = await import("@/lib/xlsx-export");
        const blob = await buildXlsx(
          toCategoryTrendsXlsxSheet(buildCategoryTrendsExportTable(report)),
        );
        downloadBlob(blob, getCategoryTrendsExportFileName(report, "xlsx"));
      } else {
        const [{ buildBrandedPdf }, { resolveExportBranding }] = await Promise.all([
          import("@/lib/pdf-export"),
          import("@/lib/export-branding"),
        ]);
        const branding = await resolveExportBranding();
        const { blob } = await buildBrandedPdf(
          toCategoryTrendsPdfTable(
            buildCategoryTrendsExportTable(report),
            branding,
            formatExportGeneratedAt(new Date()),
          ),
        );
        downloadBlob(blob, getCategoryTrendsExportFileName(report, "pdf"));
      }
      return { exportedCategoryCount: report.categories.length };
    },
  });
}
