import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Code } from "lucide-react";
import type { ReactNode } from "react";
import { OpenMonetisLogo } from "@/components/openmonetis-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authConfigQueryOptions } from "@/features/auth-config/auth-config.queries";
import {
  type LandingItem,
  landingAudienceFor,
  landingAudienceNotFor,
  landingCompanionSteps,
  landingFeatures,
  landingLicenseNote,
  landingLinks,
  landingPwaHighlights,
  landingStack,
} from "@/features/landing/landing.presentation";
import { LandingHeader } from "./landing-header";
import { LandingQuickStart } from "./landing-quick-start";

export function LandingPage() {
  const configuration = useQuery(authConfigQueryOptions());
  const signupEnabled = configuration.data?.signupEnabled === true;

  return (
    <>
      <LandingHeader signupEnabled={signupEnabled} />
      <main>
        <section className="relative isolate overflow-hidden py-24 text-center">
          <div
            aria-hidden="true"
            className="atmospheric-wash absolute top-1/2 left-1/2 -z-10 size-[min(42rem,90vw)] -translate-x-1/2 -translate-y-1/2 opacity-55"
          />
          <div className="project-container px-4">
            <p className="eyebrow">Self-hosted · Código-fonte público</p>
            <h1 className="mx-auto mt-4 max-w-3xl font-heading text-4xl sm:text-6xl">
              Suas finanças, no seu servidor.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Controle financeiro pessoal completo, sem anúncios e sem entregar seus dados.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PrimaryAction signupEnabled={signupEnabled} />
              <Button asChild size="lg" variant="outline">
                <ExternalLink href={landingLinks.repository}>
                  <Code aria-hidden="true" />
                  Ver no GitHub
                </ExternalLink>
              </Button>
            </div>
          </div>
        </section>

        <section className="scroll-mt-20 project-container px-4 py-16" id="recursos">
          <h2 className="section-title">Tudo que você precisa para organizar suas finanças</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {landingFeatures.map((item) => (
              <ItemCard item={item} key={item.title} />
            ))}
          </div>
        </section>

        <section className="scroll-mt-20 project-container px-4 py-16" id="mobile">
          <h2 className="section-title">Leve o controle para o celular</h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow">PWA</p>
              <ul className="mt-4 grid gap-4">
                {landingPwaHighlights.map((item) => (
                  <ItemRow item={item} key={item.title} />
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Companion Android</p>
              <ol className="mt-4 grid gap-4">
                {landingCompanionSteps.map((item) => (
                  <ItemRow item={item} key={item.title} />
                ))}
              </ol>
              <p className="mt-6 text-muted-foreground text-sm">
                O Companion é um projeto Android separado.{" "}
                <ExternalLink
                  className="font-medium text-brand-strong hover:underline"
                  href={landingLinks.companion}
                >
                  Ver repositório do Companion
                </ExternalLink>
              </p>
            </div>
          </div>
        </section>

        <section className="scroll-mt-20 project-container px-4 py-16" id="stack">
          <h2 className="section-title">Tecnologias por trás do projeto</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {landingStack.map((item) => (
              <ItemCard item={item} key={item.title} />
            ))}
          </div>
        </section>

        <section className="scroll-mt-20 project-container px-4 py-16" id="como-usar">
          <h2 className="section-title">Como usar</h2>
          <LandingQuickStart />
        </section>

        <section className="scroll-mt-20 project-container px-4 py-16" id="para-quem-e">
          <h2 className="section-title">Para quem é e para quem não é</h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow">Para quem é</p>
              <ul className="mt-4 grid gap-4">
                {landingAudienceFor.map((item) => (
                  <ItemRow item={item} key={item.title} />
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Para quem não é</p>
              <ul className="mt-4 grid gap-4">
                {landingAudienceNotFor.map((item) => (
                  <ItemRow item={item} key={item.title} />
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden py-24 text-center">
          <div
            aria-hidden="true"
            className="atmospheric-wash absolute top-1/2 left-1/2 -z-10 size-[min(42rem,90vw)] -translate-x-1/2 -translate-y-1/2 opacity-55"
          />
          <div className="project-container px-4">
            <h2 className="section-title">Comece hoje, no seu servidor.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PrimaryAction signupEnabled={signupEnabled} />
              <Button asChild size="lg" variant="outline">
                <ExternalLink href={landingLinks.docs}>Ver documentação</ExternalLink>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-border border-t py-10 text-muted-foreground text-sm">
        <div className="project-container px-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <OpenMonetisLogo />
          <p>{landingLicenseNote}</p>
          <nav aria-label="Links do projeto" className="flex flex-wrap gap-4">
            <ExternalLink className="hover:text-foreground" href={landingLinks.repository}>
              Repositório
            </ExternalLink>
            <ExternalLink className="hover:text-foreground" href={landingLinks.docs}>
              Documentação
            </ExternalLink>
            <ExternalLink className="hover:text-foreground" href={landingLinks.issues}>
              Reportar problema
            </ExternalLink>
            <ExternalLink className="hover:text-foreground" href={landingLinks.companion}>
              Companion Android
            </ExternalLink>
          </nav>
        </div>
      </footer>
    </>
  );
}

function PrimaryAction({ signupEnabled }: { signupEnabled: boolean }) {
  if (signupEnabled) {
    return (
      <Button asChild size="lg">
        <Link to="/signup">
          Criar conta
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild size="lg">
      <Link to="/login">Entrar</Link>
    </Button>
  );
}

function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a className={className} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

function ItemCard({ item }: { item: LandingItem }) {
  const Icon = item.icon;

  return (
    <Card>
      <CardHeader>
        <Icon aria-hidden="true" className="size-5 text-brand-strong" />
        <CardTitle>
          <h3>{item.title}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{item.description}</CardContent>
    </Card>
  );
}

function ItemRow({ item }: { item: LandingItem }) {
  const Icon = item.icon;

  return (
    <li className="flex gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-strong" />
      <div>
        <h3 className="font-medium">{item.title}</h3>
        <p className="text-muted-foreground text-sm">{item.description}</p>
      </div>
    </li>
  );
}
