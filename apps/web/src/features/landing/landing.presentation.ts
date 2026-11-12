import {
  Bell,
  CalendarDays,
  ChartColumnBig,
  ChartLine,
  Check,
  Clock,
  Code,
  Container,
  CreditCard,
  EyeOff,
  FileText,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Paperclip,
  Percent,
  PieChart,
  Plane,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";

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

export type LandingItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type LandingNavLink = { href: `#${string}`; label: string };

export type LandingQuickStartStep = {
  title: string;
  commands: readonly string[];
  note?: string;
};

export type LandingQuickStartTab = {
  value: "installer" | "development";
  label: string;
  steps: readonly LandingQuickStartStep[];
};

export const landingNavLinks: readonly LandingNavLink[] = [
  { href: "#recursos", label: "Recursos" },
  { href: "#mobile", label: "Mobile" },
  { href: "#stack", label: "Stack" },
  { href: "#como-usar", label: "Como usar" },
  { href: "#para-quem-e", label: "Para quem é" },
];

export const landingFeatures: readonly LandingItem[] = [
  {
    icon: Wallet,
    title: "Contas e transações",
    description: "Contas bancárias, cartões e dinheiro em um só lugar, organizados do seu jeito.",
  },
  {
    icon: Percent,
    title: "Parcelamentos",
    description: "Controle compras parceladas e antecipe parcelas quando quiser.",
  },
  {
    icon: Sparkles,
    title: "Assistente com IA (opcional)",
    description:
      "Diagnósticos e chat sobre seus gastos com o seu próprio provedor de IA. Desligado por padrão.",
  },
  {
    icon: ChartColumnBig,
    title: "Relatórios e gráficos",
    description:
      "Dashboard com widgets configuráveis, relatórios por categoria e exportação em PDF, Excel e CSV.",
  },
  {
    icon: CreditCard,
    title: "Faturas de cartão",
    description: "Acompanhe faturas por período, limites e vencimentos de cada cartão.",
  },
  {
    icon: Users,
    title: "Pessoas e divisão de despesas",
    description:
      "Associe lançamentos a cada pessoa, compartilhe com quem divide gastos e acerte os repasses.",
  },
  {
    icon: PieChart,
    title: "Categorias e orçamentos",
    description:
      "Categorias personalizadas com orçamentos mensais e indicadores visuais de progresso.",
  },
  {
    icon: FileText,
    title: "Anotações e tarefas",
    description: "Notas de texto e listas de tarefas com checklists.",
  },
  {
    icon: CalendarDays,
    title: "Calendário financeiro",
    description: "Veja lançamentos e vencimentos no calendário mensal para não perder prazos.",
  },
  {
    icon: Upload,
    title: "Importação e conciliação",
    description: "Importe extratos em OFX, QFX, Excel e CSV e concilie com os seus lançamentos.",
  },
  {
    icon: Paperclip,
    title: "Anexos",
    description: "Anexe comprovantes e arquivos aos lançamentos.",
  },
  {
    icon: Plane,
    title: "Viagens",
    description: "Agrupe gastos por viagem e acompanhe o total de cada uma.",
  },
  {
    icon: EyeOff,
    title: "Modo privacidade",
    description: "Oculte valores com um clique. Tema claro e escuro e calculadora integrada.",
  },
];

export const landingPwaHighlights: readonly LandingItem[] = [
  {
    icon: Smartphone,
    title: "Instale direto da web",
    description: "Adicione à tela inicial e abra como app, sem loja.",
  },
  {
    icon: LayoutGrid,
    title: "Acesso rápido ao que importa",
    description: "Dashboard, caixa de entrada e lançamentos a um toque.",
  },
  {
    icon: Zap,
    title: "Experiência mais direta",
    description: "Abre em modo standalone, com navegação limpa e sem a barra do navegador.",
  },
];

export const landingCompanionSteps: readonly LandingItem[] = [
  {
    icon: Bell,
    title: "Notificação bancária chega",
    description: "O Companion identifica automaticamente a notificação de apps bancários.",
  },
  {
    icon: Smartphone,
    title: "Dados extraídos e enviados",
    description: "Valor, descrição e banco são identificados e enviados ao OpenMonetis.",
  },
  {
    icon: Check,
    title: "Revise e confirme no OpenMonetis",
    description: "Pré-lançamentos ficam na caixa de entrada para a sua aprovação.",
  },
];

export const landingStack: readonly LandingItem[] = [
  {
    icon: Code,
    title: "Frontend",
    description: "TanStack Start, React, Tailwind CSS e shadcn/ui",
  },
  {
    icon: Server,
    title: "Backend",
    description: "Hono, Drizzle ORM e PostgreSQL",
  },
  {
    icon: ShieldCheck,
    title: "Autenticação",
    description: "Better Auth com e-mail, Google e passkeys",
  },
  {
    icon: Container,
    title: "Deploy",
    description: "Docker Compose com banco, API e aplicação web",
  },
];

export const landingAudienceFor: readonly LandingItem[] = [
  {
    icon: Clock,
    title: "Tem disciplina para registrar gastos",
    description: "Dedica alguns minutos por dia ou por semana para manter tudo atualizado.",
  },
  {
    icon: Lock,
    title: "Quer controle total sobre os seus dados",
    description: "Prefere hospedar os próprios dados em vez de depender de serviços de terceiros.",
  },
  {
    icon: ChartLine,
    title: "Quer entender para onde o dinheiro vai",
    description: "Gosta de visualizar padrões de gastos para tomar decisões informadas.",
  },
];

export const landingAudienceNotFor: readonly LandingItem[] = [
  {
    icon: Wrench,
    title: "Não é plug and play",
    description:
      "Você precisa configurar o sistema, importar seus extratos e ajustá-lo ao seu jeito de usar.",
  },
  {
    icon: Server,
    title: "Não é um serviço hospedado",
    description: "Não há versão online: você roda o OpenMonetis no seu computador ou servidor.",
  },
  {
    icon: TriangleAlert,
    title: "Projeto pessoal, sem garantias",
    description:
      "Não é uma empresa nem um SaaS. Não há garantias sobre o funcionamento nem sobre os seus dados, então mantenha backups.",
  },
];

export const landingQuickStartTabs: readonly LandingQuickStartTab[] = [
  {
    value: "installer",
    label: "Instalador",
    steps: [
      {
        title: "Pré-requisitos",
        commands: [],
        note: "Git e Docker com o plugin Compose instalados. No Windows, mantenha o Docker Desktop aberto.",
      },
      {
        title: "Linux ou macOS",
        commands: [
          "curl -fsSL https://github.com/felipegcoutinho/openmonetis-v2/raw/refs/heads/main/install.sh | bash",
        ],
      },
      {
        title: "Windows (PowerShell)",
        commands: [
          "irm https://github.com/felipegcoutinho/openmonetis-v2/raw/refs/heads/main/install.ps1 | iex",
        ],
      },
      {
        title: "Crie sua conta",
        commands: [],
        note: "Abra http://localhost:7002 e crie sua conta.",
      },
    ],
  },
  {
    value: "development",
    label: "Desenvolvimento",
    steps: [
      {
        title: "Clone o repositório",
        commands: [
          "git clone https://github.com/felipegcoutinho/openmonetis-v2.git",
          "cd openmonetis-v2",
        ],
      },
      {
        title: "Prepare o pnpm",
        commands: ["corepack enable", "corepack prepare pnpm@11.25.0 --activate"],
        note: "Requer Node.js 22.12 ou superior.",
      },
      {
        title: "Instale as dependências",
        commands: ["pnpm install --frozen-lockfile", "cp .env.example .env"],
      },
      {
        title: "Suba o banco e aplique as migrações",
        commands: ["pnpm docker:db", "pnpm db:migrate"],
      },
      {
        title: "Rode a aplicação",
        commands: ["pnpm dev"],
        note: "A aplicação web fica em http://localhost:7002.",
      },
    ],
  },
];

export const landingLicenseNote = "Código-fonte público sob a Sustainable Use License.";
