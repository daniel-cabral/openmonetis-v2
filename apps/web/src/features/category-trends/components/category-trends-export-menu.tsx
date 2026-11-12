import { ChevronDown, Download, FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryTrendsExportFormat } from "../category-trends.mutations";

export function CategoryTrendsExportMenu({
  onExport,
  pending,
  disabled,
}: {
  onExport: (format: CategoryTrendsExportFormat) => void;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled || pending} render={<Button variant="outline" />}>
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        {pending ? "Exportando…" : "Exportar"}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onExport("csv")}>
            <FileText aria-hidden="true" />
            Exportar CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("xlsx")}>
            <FileSpreadsheet aria-hidden="true" />
            Exportar como Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("pdf")}>
            <FileDown aria-hidden="true" />
            Exportar como PDF
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
