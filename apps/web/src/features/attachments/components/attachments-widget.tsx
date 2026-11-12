import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FileImage, FileText, Paperclip, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import { DashboardWidgetEmptyState } from "@/features/dashboard/components/dashboard-widget-empty-state";
import { dashboardWidgetFooterNavigationLinkClassName } from "@/features/dashboard/components/dashboard-widget-footer-link";
import { DashboardWidgetRow } from "@/features/dashboard/components/dashboard-widget-row";
import {
  formatAttachmentCount,
  formatAttachmentDay,
  formatFileSize,
} from "../attachments.presentation";
import { attachmentsSummaryQueryOptions } from "../attachments.queries";
import { AttachmentPreviewDialog } from "./attachment-preview-dialog";

type PreviewState = { index: number; key: number; open: boolean };

export function AttachmentsWidget({ period }: { period: string }) {
  const query = useQuery(attachmentsSummaryQueryOptions(period));
  const [preview, setPreview] = useState<PreviewState>({ index: 0, key: 0, open: false });
  const summary = query.data;
  const recent = summary?.recent ?? [];

  function openPreview(index: number) {
    setPreview((current) => ({ index, key: current.key + 1, open: true }));
  }

  return (
    <DashboardWidget
      description="Comprovantes do período"
      footer={
        summary ? (
          <Link
            className={dashboardWidgetFooterNavigationLinkClassName}
            search={{ period }}
            to="/attachments"
          >
            Ver todos <ArrowRight aria-hidden="true" />
          </Link>
        ) : undefined
      }
      icon={<Paperclip aria-hidden="true" />}
      title="Anexos"
    >
      {query.isLoading ? <AttachmentsLoading /> : null}
      {query.isError ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <p className="font-medium text-sm">Não foi possível carregar os anexos</p>
            <Button
              className="mt-3"
              onClick={() => void query.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw data-icon="inline-start" />
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : null}
      {summary && !query.isError ? (
        summary.count === 0 ? (
          <DashboardWidgetEmptyState
            description="Adicione comprovantes nos seus lançamentos para vê-los aqui."
            icon={<Paperclip aria-hidden="true" />}
            title="Nenhum anexo no período"
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 py-3">
              <Badge variant="secondary">{formatAttachmentCount(summary.count)}</Badge>
              <Badge variant="secondary">{formatFileSize(summary.totalBytes)}</Badge>
              {summary.imageCount > 0 ? (
                <Badge variant="outline">
                  {summary.imageCount === 1 ? "1 imagem" : `${summary.imageCount} imagens`}
                </Badge>
              ) : null}
              {summary.pdfCount > 0 ? (
                <Badge variant="outline">
                  {summary.pdfCount === 1 ? "1 PDF" : `${summary.pdfCount} PDFs`}
                </Badge>
              ) : null}
            </div>
            <ul className="divide-y">
              {recent.map((attachment, index) => {
                const isPdf = attachment.mimeType === "application/pdf";
                const Icon = isPdf ? FileText : FileImage;

                return (
                  <DashboardWidgetRow key={attachment.id}>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openPreview(index)}
                      type="button"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&>svg]:size-4">
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate font-medium text-sm"
                          title={attachment.fileName}
                        >
                          {attachment.fileName}
                        </span>
                        <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                          {attachment.transactionName} ·{" "}
                          {formatAttachmentDay(attachment.purchaseDate)}
                        </span>
                      </span>
                      <span className="shrink-0 text-muted-foreground text-xs">
                        {formatFileSize(attachment.fileSize)}
                      </span>
                    </button>
                  </DashboardWidgetRow>
                );
              })}
            </ul>
            <AttachmentPreviewDialog
              attachments={recent}
              initialIndex={preview.index}
              key={preview.key}
              onOpenChange={(open) => setPreview((current) => ({ ...current, open }))}
              open={preview.open}
            />
          </>
        )
      ) : null}
    </DashboardWidget>
  );
}

function AttachmentsLoading() {
  return (
    <div aria-label="Carregando anexos" className="grid gap-3 py-3" role="status">
      {["first", "second", "third", "fourth"].map((key) => (
        <div className="flex h-12 items-center gap-3" key={key}>
          <Skeleton className="size-8" />
          <Skeleton className="h-8 flex-1" />
        </div>
      ))}
    </div>
  );
}
