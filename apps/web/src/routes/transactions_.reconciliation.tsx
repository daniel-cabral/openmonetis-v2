import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Navbar } from "@/components/navigation/navbar";
import { ReconciliationScreen } from "@/features/reconciliations/components/reconciliation-screen";

export const Route = createFileRoute("/transactions_/reconciliation")({
  head: () => ({ meta: [{ title: "Conciliar extrato · OpenMonetis" }] }),
  component: ReconciliationRoute,
});

function ReconciliationRoute() {
  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        <ReconciliationScreen />
      </main>
    </ProtectedRoute>
  );
}
