import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GitCompareArrows } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { accountsQueryOptions } from "@/features/accounts/accounts.queries";
import { cardsQueryOptions } from "@/features/cards/cards.queries";
import { peopleQueryOptions } from "@/features/people/people.queries";
import { TransactionImportUpload } from "@/features/transactions/components/transaction-import-upload";
import { useReconciliationReview } from "../useReconciliationReview";
import { ReconciliationOriginStep } from "./reconciliation-origin-step";

export function ReconciliationScreen() {
  const [accounts, cards, people] = useQueries({
    queries: [accountsQueryOptions(), cardsQueryOptions(), peopleQueryOptions()],
  });
  const review = useReconciliationReview({
    adminPersonId: people.data?.find((person) => person.role === "admin")?.id ?? null,
  });

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

      {review.error ? (
        <p className="text-destructive text-sm" role="alert">
          {review.error}
        </p>
      ) : null}
    </section>
  );
}
