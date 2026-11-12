# V1 landing content + V2 parity (research)

Note: V1 icons are Remix Icons (@remixicon/react), NOT lucide. Names below as in V1.
V1 repo: https://github.com/felipegcoutinho/openmonetis ; Companion: https://github.com/felipegcoutinho/openmonetis-companion

## 1. Section order (page.tsx)

Navbar (LandingNavbar): anchor links Funcionalidades(#funcionalidades), Mobile(#mobile), Stack(#stack), Como usar(#como-usar), Para quem é(#para-quem-e) (mobile sheet label "Para quem é?"). Right side: theme toggler; if not public-domain host: logged in -> "Dashboard" (/dashboard); else "Entrar" (/login) and "Começar" (/signup, hidden if signup disabled). Mobile: hamburger Sheet (aria "Abrir menu") with same links + same auth buttons. AnimateOnScroll = IntersectionObserver fade/translate-y-6 (threshold 0.1, rootMargin -40px, duration-700).

### 1. Hero
- Badge (outline, RiGithubFill): "Projeto Open Source"
- H1: "Suas finanças," + accent " do seu jeito"
- P: "Gestão financeira self-hosted e open source. Lance manualmente ou capture notificações bancárias direto pelo **Companion para Android**. Seus dados, seu servidor."
- CTA1 (RiGithubFill) "Baixar no GitHub" -> https://github.com/felipegcoutinho/openmonetis
- CTA2 (outline) "Ver Documentação" -> https://github.com/felipegcoutinho/openmonetis#readme
- Browser-frame mock with dashboard screenshot light/dark (alt "openmonetis Dashboard Preview", 1920x1080)

### 2. Metrics bar (4 items)
- RiLayoutGridLine "20+" / "Widgets no dashboard"
- RiShieldCheckLine "100%" / "Self-hosted"
- RiStarLine {stars} / "Stars no GitHub" (live GitHub API)
- RiGitBranchLine {forks} / "Forks no GitHub"

### 3. #funcionalidades
Badge "O que tem aqui"; H2 "Funcionalidades que importam"; sub "Ferramentas simples para organizar suas contas, cartões, gastos e receitas". 12 cards (mainFeatures then extraFeatures):
1. RiWalletLine | Contas e transações | Contas bancárias, cartões e dinheiro em um só lugar, se organize como preferir.
2. RiPercentLine | Parcelamentos avançados | Controle compras parceladas e antecipe parcelas com cálculo automático de desconto.
3. RiRobot2Line | Insights com IA | Análises por IA com insights sobre padrões de gastos e recomendações personalizadas.
4. RiBarChartBoxLine | Relatórios e gráficos | 20+ widgets interativos, relatórios por categoria e exportação em PDF e Excel.
5. RiBankCard2Line | Faturas de cartão | Acompanhe faturas por período, limites e vencimentos de cada cartão.
6. RiTeamLine | Gestão colaborativa | Compartilhe acesso com permissões granulares (admin/viewer) e notificações por e-mail.
7. RiPieChartLine | Categorias e orçamentos | Categorias personalizadas com orçamentos mensais e indicadores visuais de progresso.
8. RiFileTextLine | Anotações e tarefas | Notas de texto e listas de tarefas com checkboxes e arquivamento.
9. RiCalendarLine | Calendário financeiro | Visualize transações em calendário mensal para não perder prazos.
10. RiDownloadCloudLine | Importação em massa | Importe múltiplos lançamentos de uma só vez.
11. RiEyeOffLine | Modo privacidade | Oculte valores com um clique. Tema dark/light e calculadora integrada.
12. RiFlashlightLine | Performance otimizada | Interface rápida e otimizada para uso diário.

### 4. #mobile
Badge (RiSmartphoneLine) "Mobile"; H2 "Use o OpenMonetis no celular sem perder o fluxo"; sub "Instale como PWA para acesso rápido no dia a dia. No Android, use o Companion para capturar notificações bancárias automaticamente."

PWA block (image left, phone mock 390x844 light/dark, alt "Preview PWA"):
- Badge (RiSmartphoneLine) "PWA instalável"
- H3 "Leve o OpenMonetis para a tela inicial"
- P "Adicione à tela inicial e abra direto, como um app. Sem depender de uma aba perdida no navegador. Funciona em Android, iOS e desktop."
- Highlights (format "**title** — description"):
  - RiSmartphoneLine | Instale direto da web | Adicione à tela inicial e abra como app, sem loja.
  - RiLayoutGridLine | Acesso rápido ao que importa | Dashboard, inbox e lançamentos a um toque.
  - RiFlashlightLine | Experiência mobile mais direta | Modo standalone com navegação limpa e fluida.

Companion block (border-top; text left, phone image right, alt "Preview Companion"):
- Badge (RiAndroidLine) "Companion Android"
- H3 "Capture, envie e revise no mesmo fluxo"
- P "O Companion captura notificações de apps bancários e cria pré-lançamentos automaticamente para você revisar na inbox."
- Ordered steps:
  - RiNotification3Line | Notificação bancária chega | O Companion intercepta automaticamente
  - RiSmartphoneLine | Dados extraídos e enviados | Valor, descrição e banco são identificados
  - RiCheckLine | Revise e confirme no OpenMonetis | Pré-lançamentos ficam na inbox para sua aprovação
- Label "Bancos testados" chips: Nubank (/logos/nubank.png), Itaú (/logos/itau.png), Inter (/logos/intermedium.png), Mercado Pago (/logos/mercadopagocartao.png)
- Link (RiGithubFill) "Ver no GitHub" -> https://github.com/felipegcoutinho/openmonetis-companion

### 5. #stack
Badge "Stack técnica"; H2 "O que roda por baixo"; sub "Self-hosted, open source, type-safe do banco ao frontend". 4 cards (title + subtitle shown; description unused in render):
- RiCodeSSlashLine | Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui (desc: Interface moderna e responsiva com React 19 e App Router)
- RiDatabase2Line | Backend | PostgreSQL, Drizzle ORM, Better Auth (desc: Banco relacional robusto com type-safe ORM)
- RiShieldCheckLine | Segurança | Better Auth com OAuth (Google) e autenticação por email (desc: Sessões seguras e proteção de rotas por middleware)
- RiDeviceLine | Deploy | Docker com multi-stage build, health checks e volumes persistentes (desc: Fácil de rodar localmente ou em qualquer servidor)

### 6. #como-usar
Badge "Como usar"; H2 "Rode no seu computador"; sub "Não há versão hospedada online. Você precisa rodar localmente." Then SetupTabs (section 3). Link "Ver documentação completa →" -> https://github.com/felipegcoutinho/openmonetis#-início-rápido

### 7. #para-quem-e
Badge "Para quem é?"; H2 "Feito para quem gosta de controle"; sub "O OpenMonetis não é para todo mundo." 6 cards:
- RiTimeLine | Tem disciplina de registrar gastos | Não se importa em dedicar alguns minutos por dia ou semana para manter tudo atualizado
- RiLockLine | Quer controle total sobre seus dados | Prefere hospedar seus próprios dados ao invés de depender de serviços terceiros
- RiLineChartLine | Gosta de entender exatamente onde o dinheiro vai | Quer visualizar padrões de gastos e tomar decisões informadas
- RiTimeLine | Não é plug and play | Você vai precisar configurar as coisas, conectar suas contas e ajustar o sistema para o seu jeito de usar.
- RiShieldCheckLine | Não é para qualquer um | Não é uma empresa, não é um SaaS, não é uma plataforma. É um projeto pessoal.
- RiErrorWarningLine | Não sou responsável por nada | Não sou responsável por nada que aconteça com você ou com seus dados.

### 8. CTA
H2 "Pronto para testar?"; P "Clone o repositório, rode localmente e veja se faz sentido pra você. É open source e gratuito."
- (RiGithubFill) "Baixar Projeto" -> https://github.com/felipegcoutinho/openmonetis
- outline "Como Instalar" -> https://github.com/felipegcoutinho/openmonetis#-início-rápido

### 9. Footer
- Logo compact; "Projeto pessoal de gestão financeira. Open source e self-hosted."
- Col "Projeto": GitHub (https://github.com/felipegcoutinho/openmonetis), Documentação (…#readme), Reportar Bug (…/issues)
- Col "Companion": GitHub (https://github.com/felipegcoutinho/openmonetis-companion)
- Bottom: "© {year} openmonetis. Projeto open source sob licença." + RiShieldCheckLine "Seus dados, seu servidor"

## 2. SEO (layout.tsx)
- BASE_URL: https://${PUBLIC_DOMAIN} or https://openmonetis.com
- title (absolute): "OpenMonetis | Finanças pessoais self-hosted e open source"
- description: "Aplicativo self-hosted de finanças pessoais. Controle lançamentos, cartões, orçamentos e categorias com total privacidade. Open source e gratuito."
- keywords: finanças pessoais, controle financeiro, self-hosted, open source, gestão financeira, orçamento pessoal, lançamentos financeiros, cartão de crédito, planejamento financeiro
- canonical: "/"
- OG: type website, locale pt_BR, url "/", siteName "OpenMonetis", same title/description, image /images/dashboard-preview-light.png 1920x1080 alt "OpenMonetis — Dashboard de finanças pessoais"
- twitter: summary_large_image, same title/desc/image
- robots: index/follow true; googleBot max-image-preview large, max-snippet -1
- JSON-LD SoftwareApplication: name OpenMonetis, applicationCategory FinanceApplication, operatingSystem Web, offers price 0 BRL, description, url, isAccessibleForFree true, author Organization OpenMonetis (url BASE_URL)

## 3. SetupTabs (default tab "docker"; tabs "Docker (Recomendado)" | "Manual")
Docker:
1. "Clone o repositório": `git clone https://github.com/felipegcoutinho/openmonetis.git`
2. "Configure as variáveis de ambiente": "Copie o `.env.example` para `.env` e configure o banco de dados"
3. "Suba tudo com Docker Compose": `docker compose up -d` + "Isso vai subir o banco PostgreSQL e a aplicação automaticamente"
Manual:
1. same clone
2. same env step
3. "Suba o banco via Docker": `docker compose up db -d`
4. "Instale e rode a aplicação": `pnpm install`, `pnpm db:push`, `pnpm dev`
StepCard: numbered circle tinted with --data-1/3/5/4.

## 4. Verdicts (V2 = worktree 014-landing-page)
V2 facts: routes in apps/web/src/routes; API routes in apps/api/src/routes; features in apps/web/src/features.
- Contas e transações: EXISTS. apps/web/src/routes/accounts.tsx, transactions.tsx; apps/api/src/routes/accounts.ts, transactions.ts
- Parcelamentos / antecipar: EXISTS. features/installments, api routes/installments.ts (anticipation discount calc not verified)
- Insights com IA: DIFFERENT. features/ai-diagnoses, ai-chats, ai-providers; docs/ai-diagnoses.md. Opt-in assistant (off by default), diagnosis + chat, uses user's own Claude/ChatGPT(Codex)/Google subscription via CLIs in `ai` service
- Relatórios/gráficos: EXISTS. features/card-usage-report, establishments-report, category-trends, person-reports, financial-distribution, spending-overview; dashboard widgets (docs/dashboard-widgets.md, "widgets configuráveis"); "20+" count not verified
- PDF/Excel export: EXISTS. docs/exports.md (CSV, Excel .xlsx, PDF, client-side generation)
- Faturas de cartão: EXISTS. routes/cards.tsx, cards_.$cardId.tsx; features/invoices, cards; api routes/invoices.ts
- Gestão colaborativa (admin/viewer): DIFFERENT. V2 has people, person-connections, person-settlements, person-reports (people sharing, splits, repasses; invites via /person-connections/accept); not admin/viewer roles
- Categorias e orçamentos: EXISTS. routes/categories.tsx, budgets.tsx; features/budgets
- Metas (goals): EXISTS (new vs V1 copy). routes/goals.tsx
- Anotações e tarefas: EXISTS. routes/notes.tsx; features/notes (notas e checklists)
- Calendário: EXISTS. routes/calendar.tsx; docs/calendar.md
- Importação em massa: EXISTS (broader). routes/transactions_.import.tsx; docs/transaction-imports.md: .ofx/.qfx, .xlsx/.xls, .csv (bank profiles)
- Modo privacidade: EXISTS. components/money-value.tsx, navbar (privacy); verify toggle
- Tema dark/light: EXISTS. components/theme-provider.tsx, theme-toggle.tsx
- Calculadora: EXISTS. components/calculator/calculator-dialog.tsx
- Companion Android (captura de notificações, inbox): DIFFERENT. Companion is an external project; V2 provides API (docs/companion-api.md, routes/device-tokens.ts, inbox.ts, inbox-rules.ts; web route inbox.tsx). README: "projeto externo que usa os endpoints de integração documentados". No separate Companion repo URL in V2 (README/package.json); V1 URL is the only known one
- Bancos testados (Nubank, Itaú, Inter, Mercado Pago): logo assets exist in V2 apps/web/public/logos (nubank.png, itau.png, intermedium.png, mercadopagocartao.png; 140 logos total). Tested-bank claim itself unverified for V2 Companion
- PWA: PARTIAL. apps/web/public/manifest.json + icons (192/512, maskable, apple-touch) linked in routes/__root.tsx; no service worker found (installable manifest only)
- Anexos: EXISTS (not on V1 landing). routes/attachments.tsx, features/attachments; requires S3 storage configured
- Recorrência: EXISTS. features/recurring-transactions, recurring-expenses; docs/recurring-transactions.md; recurring-worker service
- Trips: EXISTS. routes/trips.tsx, trips_.$tripId.tsx
- Tags, reconciliation, due-date rules, commitments, bills (contas a pagar): EXIST (extra, not in V1 copy)
- Open Finance: MISSING (README says no integration)
- Docker self-hosting: EXISTS. compose.yml (db, migrator, api, recurring-worker, ai, web), install.sh, install.ps1, docs/production-deployment.md
- Signup toggle: EXISTS. DISABLE_SIGNUP env; routes/signup.tsx; features/auth-config (signupEnabled)
- OAuth Google + email auth: EXISTS (README: "login ... Google"; Better Auth; passkey plugin also in apps/api)
- Landing/marketing page itself: MISSING. routes/index.tsx is the login page ("Entrar"); robots.txt route returns `Disallow: /` (apps/web/src/routes/robots[.]txt.ts); no landing route

## 4b. V2 stack (package.json)
- Web: @tanstack/react-start 1.169.4, @tanstack/react-router 1.170.46, @tanstack/react-query ^5.105.3, @tanstack/react-form ^1.33.5, react ^19.3.1, @tailwindcss/vite ^4.3.4, shadcn/ui
- API: hono ^4.13.16, @hono/zod-openapi, @hono/node-server, drizzle-orm ^0.45.4 (drizzle-kit), better-auth ^1.7.16 (+ @better-auth/passkey, drizzle-adapter), zod, PostgreSQL
- Monorepo: pnpm 11.25.0 workspaces, Biome, Docker Compose, Node >=22.12
- Version 0.16.0 (README badge); License: Sustainable Use License 1.0 (personal/non-commercial/internal use ok; commercial needs authorization). NOT "open source" in OSI sense: landing copy "open source e gratuito" should be checked against this

## 4c. V2 quick start (README.md, verbatim)
Prereq: "Tenha Git e Docker com o plugin Compose instalados."
Linux/macOS:
`curl -fsSL https://github.com/felipegcoutinho/openmonetis-v2/raw/refs/heads/main/install.sh | bash`
Windows (PowerShell, Docker Desktop running):
`irm https://github.com/felipegcoutinho/openmonetis-v2/raw/refs/heads/main/install.ps1 | iex`
"Abra http://localhost:7002 e crie sua conta." Pin version: `| OPENMONETIS_VERSION=0.12.0 bash` (Windows: `$env:OPENMONETIS_VERSION`). After first account set `DISABLE_SIGNUP=true`.
Dev (Node >=22.12):
```
git clone https://github.com/felipegcoutinho/openmonetis-v2.git
cd openmonetis-v2
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm docker:db
pnpm db:migrate
pnpm dev
```
Ports: web http://localhost:7002, API :7001, PostgreSQL 127.0.0.1:7000. Note V2 uses `pnpm db:migrate` (V1 manual tab used `db:push`, forbidden in V2).
Docs in V2 README: docs/production-deployment.md, docs/architecture.md, docs/environment-variables.md, CHANGELOG.md, CONTRIBUTING.md.

## 5. V2 URLs
- package.json homepage: https://github.com/felipegcoutinho/openmonetis-v2#readme
- repository: git+https://github.com/felipegcoutinho/openmonetis-v2.git
- bugs: https://github.com/felipegcoutinho/openmonetis-v2/issues
- This fork's origin: https://github.com/daniel-cabral/openmonetis-v2 (upstream = felipegcoutinho; use upstream URLs for public landing links as in README)
- Docs site: none (docs are markdown in repo, e.g. https://github.com/felipegcoutinho/openmonetis-v2/blob/main/docs/production-deployment.md)
- Companion URL in V2: none found; V1 landing uses https://github.com/felipegcoutinho/openmonetis-companion
- Production domain: none in V2 (V1 default https://openmonetis.com via PUBLIC_DOMAIN)
