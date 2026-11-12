export const landingLinks = {
  repository: "https://github.com/felipegcoutinho/openmonetis-v2",
  docs: "https://github.com/felipegcoutinho/openmonetis-v2#readme",
  issues: "https://github.com/felipegcoutinho/openmonetis-v2/issues",
  companion: "https://github.com/felipegcoutinho/openmonetis-companion",
} as const;

const sessionCookieNames = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
] as const;

export const landingTitle = "OpenMonetis | Finanças pessoais self-hosted";

export const landingDescription =
  "Aplicativo self-hosted de finanças pessoais. Controle lançamentos, cartões, orçamentos e categorias com privacidade total no seu próprio servidor.";

export function isLandingPageEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader.split(";").some((cookie) => {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) {
      return false;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    return sessionCookieNames.includes(name as never) && value.length > 0;
  });
}

export function buildRobotsTxt(landingEnabled: boolean): string {
  if (!landingEnabled) {
    return "User-agent: *\nDisallow: /\n";
  }

  return "User-agent: *\nAllow: /$\nDisallow: /\n";
}

export type LandingHeadMeta =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

export type LandingHeadLink = { rel: string; href: string };

export function buildLandingHead(origin: string): {
  meta: LandingHeadMeta[];
  links: LandingHeadLink[];
} {
  const canonicalUrl = `${origin}/`;

  return {
    meta: [
      { title: landingTitle },
      { name: "description", content: landingDescription },
      { property: "og:title", content: landingTitle },
      { property: "og:description", content: landingDescription },
      { property: "og:url", content: canonicalUrl },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:image", content: `${origin}/icon-512.png` },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  };
}
