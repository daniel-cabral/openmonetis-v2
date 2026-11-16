import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Navbar } from "@/components/navigation/navbar";
import { ReconciliationScreen } from "@/features/reconciliations/components/reconciliation-screen";
import { validateReconciliationSearch } from "@/features/reconciliations/reconciliations.presentation";

export const Route = createFileRoute("/transactions_/reconciliation")({
  head: () => ({ meta: [{ title: "Conciliar extrato · OpenMonetis" }] }),
  component: ReconciliationRoute,
  validateSearch: validateReconciliationSearch,
});

function ReconciliationRoute() {
  const search = Route.useSearch();

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        <ReconciliationScreen preset={search} />
      </main>
    </ProtectedRoute>
  );
}
