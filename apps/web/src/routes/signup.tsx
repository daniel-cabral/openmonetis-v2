import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicOnlyRoute } from "@/components/auth/public-only-route";
import { SignupForm } from "@/components/auth/signup-form";
import { OpenMonetisLogo } from "@/components/openmonetis-logo";
import { Button } from "@/components/ui/button";
import { authConfigQueryOptions } from "@/features/auth-config/auth-config.queries";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Criar conta · OpenMonetis" }] }),
  component: SignupPage,
});

function SignupPage() {
  const configuration = useQuery(authConfigQueryOptions());
  return (
    <PublicOnlyRoute>
      <main className="relative isolate flex min-h-svh flex-col items-center justify-center gap-8 overflow-hidden bg-background px-4 py-16">
        <div
          aria-hidden="true"
          className="atmospheric-wash absolute top-1/2 left-1/2 -z-10 size-[min(42rem,90vw)] -translate-x-1/2 -translate-y-1/2 opacity-55"
        />
        <Link to="/">
          <OpenMonetisLogo />
        </Link>
        <section className="w-full max-w-md rounded-card border border-border bg-background/85 p-6 backdrop-blur-md sm:p-8">
          <h1 className="mt-3 font-heading text-4xl font-normal">
            {configuration.data?.signupEnabled === false ? "Cadastro desabilitado" : "Criar conta"}
          </h1>
          <p className="mt-3 text-muted-foreground text-sm">
            {configuration.data?.signupEnabled === false
              ? "Esta instalação não aceita novas contas. Entre com uma conta existente."
              : configuration.data?.googleEnabled
                ? "Use sua conta Google ou informe seus dados para começar."
                : "Informe seus dados para começar."}
          </p>
          <div className="mt-8">
            {configuration.isPending ? (
              <p className="text-muted-foreground text-sm" role="status">
                Verificando disponibilidade do cadastro…
              </p>
            ) : configuration.isError ? (
              <div className="grid gap-3">
                <p className="text-muted-foreground text-sm" role="alert">
                  Não foi possível verificar a disponibilidade do cadastro.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void configuration.refetch()}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : configuration.data.signupEnabled ? (
              <SignupForm />
            ) : null}
          </div>
          <p className="mt-6 text-center text-muted-foreground text-sm">
            Já tem conta?{" "}
            <Link className="font-medium text-brand-strong hover:underline" to="/login">
              Entrar
            </Link>
          </p>
        </section>
      </main>
    </PublicOnlyRoute>
  );
}
