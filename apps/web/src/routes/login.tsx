import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/auth/login-page";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar · OpenMonetis" }] }),
  component: LoginPage,
});
