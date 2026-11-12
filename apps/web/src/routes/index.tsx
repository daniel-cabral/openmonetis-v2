import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/auth/login-page";
import { PublicOnlyRoute } from "@/components/auth/public-only-route";
import { LandingPage } from "@/features/landing/components/landing-page";
import { getLandingSettings } from "@/features/landing/landing.api";
import { buildLandingHead } from "@/features/landing/landing.presentation";

export const Route = createFileRoute("/")({
  loader: () => getLandingSettings(),
  head: ({ loaderData }) => {
    if (!loaderData?.enabled) {
      return { meta: [{ title: "Entrar · OpenMonetis" }] };
    }

    const head = buildLandingHead(loaderData.origin);
    return {
      meta: [...head.meta, { name: "googlebot", content: "index, follow" }],
      links: head.links,
    };
  },
  component: HomePage,
});

function HomePage() {
  const { enabled, hasSessionCookie } = Route.useLoaderData();

  if (!enabled) {
    return <LoginPage />;
  }

  if (hasSessionCookie) {
    return (
      <PublicOnlyRoute>
        <LandingPage />
      </PublicOnlyRoute>
    );
  }

  return <LandingPage />;
}
