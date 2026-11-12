import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GitCompareArrows } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { accountsQueryOptions } from "@/features/accounts/accounts.queries";
import { cardsQueryOptions } from "@/features/cards/cards.queries";
import { categoriesQueryOptions } from "@/features/categories/categories.queries";
import { peopleQueryOptions } from "@/features/people/people.queries";
import { TransactionImportUpload } from "@/features/transactions/components/transaction-import-upload";
import { useReconciliationReview } from "../useReconciliationReview";
import { ReconciliationApplyBar } from "./reconciliation-apply-bar";
import { ReconciliationBuckets } from "./reconciliation-buckets";
import { ReconciliationOriginStep } from "./reconciliation-origin-step";
import { buildClosureView, buildProjectionView } from "./reconciliation-review";
import { ReconciliationSummary } from "./reconciliation-summary";

export function ReconciliationScreen() {
  const [accounts, cards, categories, people] = useQueries({
    queries: [
      accountsQueryOptions(),
      cardsQueryOptions(),
      categoriesQueryOptions(),
      peopleQueryOptions(),
    ],
  });
  const activePeople = people.data?.filter((person) => person.status === "active") ?? [];
  const adminPersonId = people.data?.find((person) => person.role === "admin")?.id ?? null;
  const review = useReconciliationReview({ adminPersonId });
  const closure = review.preview
    ? buildClosureView(review.preview, review.invoiceTotalCents)
    : null;
  const projection = review.preview
    ? buildProjectionView({
        preview: review.preview,
        decisions: review.decisions,
        adminPersonId,
        invoiceTotalCents: review.invoiceTotalCents,
      })
    : null;

  return (
    <section className="app-page project-container">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link to="/transactions">Voltar para lançamentos</Link>
          </Button>
        }
        breadcrumbs={[
          { label: "Visão geral", href: "/dashboard" },
          { label: "Lançamentos", href: "/transactions" },
          { label: "Conciliar extrato" },
        ]}
        description="Compare o extrato do banco com os lançamentos do app antes de aplicar."
        icon={<GitCompareArrows aria-hidden="true" className="size-5" />}
        title="Conciliar extrato"
      />

      {review.file && review.detection ? (
        <ReconciliationOriginStep
          accounts={accounts.data?.filter((account) => !account.isArchived) ?? []}
          cards={cards.data?.filter((card) => card.status === "active") ?? []}
          detection={review.detection}
          file={review.file}
          isReading={review.isReading}
          onOriginChange={review.resetReview}
          onRead={(origin) => void review.readFile(origin)}
          onReset={review.resetUpload}
          invoiceTotalText={review.invoiceTotalText}
          onInvoiceTotalChange={review.setInvoiceTotalText}
        />
      ) : (
        <TransactionImportUpload
          dragging={review.dragging}
          downloadTemplate={review.downloadTemplate}
          handleFile={review.handleFile}
          inputRef={review.inputRef}
          isDownloadingTemplate={review.isDownloadingTemplate}
          isLoadingOptions={[accounts, cards, people].some((query) => query.isLoading)}
          isPreviewing={review.isDetecting}
          setDragging={review.setDragging}
        />
      )}

      {review.preview ? (
        <div className="grid gap-6">
          <ReconciliationSummary closure={closure} counts={review.preview.counts} />
          <ReconciliationBuckets
            categories={categories.data ?? []}
            decisions={review.decisions}
            onChange={review.updateDecision}
            onMarkAllBankOnlyAsCreate={review.markAllBankOnly}
            people={activePeople}
            preview={review.preview}
          />
          <ReconciliationApplyBar
            decisions={review.decisions}
            isApplying={review.isApplying}
            onApply={() => void review.applyReview()}
            preview={review.preview}
            projection={projection}
          />
        </div>
      ) : null}

      {review.error ? (
        <p className="text-destructive text-sm" role="alert">
          {review.error}
        </p>
      ) : null}
    </section>
  );
}
