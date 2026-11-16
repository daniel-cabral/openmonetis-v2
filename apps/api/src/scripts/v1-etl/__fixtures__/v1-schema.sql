--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anexos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    chave_arquivo text NOT NULL,
    nome_arquivo text NOT NULL,
    tamanho_bytes integer NOT NULL,
    mime_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: anotacao_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anotacao_anexos (
    anotacao_id uuid NOT NULL,
    anexo_id uuid NOT NULL
);


--
-- Name: anotacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anotacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text,
    descricao text,
    tipo text DEFAULT 'nota'::text NOT NULL,
    tasks text,
    arquivada boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL
);


--
-- Name: antecipacoes_parcelas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.antecipacoes_parcelas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid NOT NULL,
    periodo_antecipacao text NOT NULL,
    data_antecipacao date NOT NULL,
    parcelas_antecipadas jsonb NOT NULL,
    valor_total numeric(12,2) NOT NULL,
    qtde_parcelas smallint NOT NULL,
    desconto numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    lancamento_id uuid NOT NULL,
    pagador_id uuid,
    categoria_id uuid,
    anotacao text,
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cartoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cartoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    dt_fechamento text NOT NULL,
    dt_vencimento text NOT NULL,
    anotacao text,
    limite numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    bandeira text,
    logo text,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL,
    conta_id uuid NOT NULL
);


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    icone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL
);


--
-- Name: compartilhamentos_pagador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compartilhamentos_pagador (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pagador_id uuid NOT NULL,
    shared_with_user_id text NOT NULL,
    permission text DEFAULT 'read'::text NOT NULL,
    created_by_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo_conta text NOT NULL,
    anotacao text,
    status text NOT NULL,
    logo text NOT NULL,
    saldo_inicial numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    excluir_do_saldo boolean DEFAULT false NOT NULL,
    excluir_saldo_inicial_receitas boolean DEFAULT false NOT NULL,
    user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dashboard_notification_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_notification_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    notification_key text NOT NULL,
    fingerprint text NOT NULL,
    read_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: establishment_logos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_logos (
    user_id text NOT NULL,
    name_key text NOT NULL,
    domain text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: faturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faturas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status_pagamento text,
    periodo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL,
    cartao_id uuid
);


--
-- Name: import_category_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_category_mappings (
    user_id text NOT NULL,
    description_key text NOT NULL,
    category_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subcategory_id uuid
);


--
-- Name: import_name_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_name_mappings (
    user_id text NOT NULL,
    description_key text NOT NULL,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: insights_salvos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insights_salvos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    period text NOT NULL,
    model_id text NOT NULL,
    data text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lancamento_anexos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamento_anexos (
    lancamento_id uuid NOT NULL,
    anexo_id uuid NOT NULL
);


--
-- Name: lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    condicao text NOT NULL,
    nome text NOT NULL,
    forma_pagamento text NOT NULL,
    anotacao text,
    valor numeric(12,2) NOT NULL,
    data_compra date NOT NULL,
    tipo_transacao text NOT NULL,
    qtde_parcela smallint,
    periodo text NOT NULL,
    parcela_atual smallint,
    qtde_recorrencia integer,
    data_vencimento date,
    dt_pagamento_boleto date,
    realizado boolean DEFAULT false,
    dividido boolean DEFAULT false,
    antecipado boolean DEFAULT false,
    antecipacao_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL,
    cartao_id uuid,
    conta_id uuid,
    categoria_id uuid,
    pagador_id uuid,
    series_id uuid,
    split_group_id uuid,
    transfer_id uuid,
    ofx_fit_id text,
    import_batch_id text,
    ofx_import_fingerprint text,
    viagem_id uuid,
    subcategoria_id uuid
);


--
-- Name: orcamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orcamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    valor numeric(10,2) NOT NULL,
    periodo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL,
    categoria_id uuid
);


--
-- Name: pagadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagadores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    email text,
    avatar_url text,
    status text NOT NULL,
    anotacao text,
    role text,
    is_auto_send boolean DEFAULT false NOT NULL,
    share_code text NOT NULL,
    last_mail timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL
);


--
-- Name: passkey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkey (
    id text NOT NULL,
    name text,
    "publicKey" text NOT NULL,
    "userId" text NOT NULL,
    "credentialID" text NOT NULL,
    counter integer NOT NULL,
    "deviceType" text NOT NULL,
    "backedUp" boolean NOT NULL,
    transports text,
    aaguid text,
    "createdAt" timestamp with time zone
);


--
-- Name: pre_lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_lancamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    source_app text NOT NULL,
    source_app_name text,
    original_title text,
    original_text text NOT NULL,
    notification_timestamp timestamp with time zone NOT NULL,
    parsed_name text,
    parsed_amount numeric(12,2),
    status text DEFAULT 'pending'::text NOT NULL,
    lancamento_id uuid,
    processed_at timestamp with time zone,
    discarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: preferencias_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preferencias_usuario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    extrato_note_as_column boolean DEFAULT false NOT NULL,
    lancamentos_column_order jsonb,
    attachment_max_size_mb integer DEFAULT 50 NOT NULL,
    dashboard_widgets jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    mostrar_resumo_lancamento boolean DEFAULT true NOT NULL,
    agrupar_lancamentos_por_data boolean DEFAULT true NOT NULL,
    ocultar_parcelas_antecipadas boolean DEFAULT false NOT NULL
);


--
-- Name: reconciliation_ignores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_ignores (
    user_id text NOT NULL,
    fingerprint text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
);


--
-- Name: subcategorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    categoria_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text NOT NULL
);


--
-- Name: tokens_api; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens_api (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    last_used_at timestamp with time zone,
    last_used_ip text,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone
);


--
-- Name: viagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    nome text NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    anotacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: anexos anexos_chave_arquivo_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anexos
    ADD CONSTRAINT anexos_chave_arquivo_unique UNIQUE (chave_arquivo);


--
-- Name: anexos anexos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anexos
    ADD CONSTRAINT anexos_pkey PRIMARY KEY (id);


--
-- Name: anotacao_anexos anotacao_anexos_anotacao_id_anexo_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anotacao_anexos
    ADD CONSTRAINT anotacao_anexos_anotacao_id_anexo_id_pk PRIMARY KEY (anotacao_id, anexo_id);


--
-- Name: anotacoes anotacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anotacoes
    ADD CONSTRAINT anotacoes_pkey PRIMARY KEY (id);


--
-- Name: antecipacoes_parcelas antecipacoes_parcelas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecipacoes_parcelas
    ADD CONSTRAINT antecipacoes_parcelas_pkey PRIMARY KEY (id);


--
-- Name: cartoes cartoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: compartilhamentos_pagador compartilhamentos_pagador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compartilhamentos_pagador
    ADD CONSTRAINT compartilhamentos_pagador_pkey PRIMARY KEY (id);


--
-- Name: contas contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pkey PRIMARY KEY (id);


--
-- Name: dashboard_notification_states dashboard_notification_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_notification_states
    ADD CONSTRAINT dashboard_notification_states_pkey PRIMARY KEY (id);


--
-- Name: establishment_logos establishment_logos_user_id_name_key_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_logos
    ADD CONSTRAINT establishment_logos_user_id_name_key_pk PRIMARY KEY (user_id, name_key);


--
-- Name: faturas faturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_pkey PRIMARY KEY (id);


--
-- Name: import_category_mappings import_category_mappings_user_id_description_key_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_category_mappings
    ADD CONSTRAINT import_category_mappings_user_id_description_key_pk PRIMARY KEY (user_id, description_key);


--
-- Name: import_name_mappings import_name_mappings_user_id_description_key_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_name_mappings
    ADD CONSTRAINT import_name_mappings_user_id_description_key_pk PRIMARY KEY (user_id, description_key);


--
-- Name: insights_salvos insights_salvos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insights_salvos
    ADD CONSTRAINT insights_salvos_pkey PRIMARY KEY (id);


--
-- Name: lancamento_anexos lancamento_anexos_lancamento_id_anexo_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamento_anexos
    ADD CONSTRAINT lancamento_anexos_lancamento_id_anexo_id_pk PRIMARY KEY (lancamento_id, anexo_id);


--
-- Name: lancamentos lancamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_pkey PRIMARY KEY (id);


--
-- Name: orcamentos orcamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_pkey PRIMARY KEY (id);


--
-- Name: pagadores pagadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagadores
    ADD CONSTRAINT pagadores_pkey PRIMARY KEY (id);


--
-- Name: passkey passkey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey
    ADD CONSTRAINT passkey_pkey PRIMARY KEY (id);


--
-- Name: pre_lancamentos pre_lancamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_lancamentos
    ADD CONSTRAINT pre_lancamentos_pkey PRIMARY KEY (id);


--
-- Name: preferencias_usuario preferencias_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_usuario
    ADD CONSTRAINT preferencias_usuario_pkey PRIMARY KEY (id);


--
-- Name: preferencias_usuario preferencias_usuario_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_usuario
    ADD CONSTRAINT preferencias_usuario_user_id_unique UNIQUE (user_id);


--
-- Name: reconciliation_ignores reconciliation_ignores_user_id_fingerprint_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_ignores
    ADD CONSTRAINT reconciliation_ignores_user_id_fingerprint_pk PRIMARY KEY (user_id, fingerprint);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);


--
-- Name: subcategorias subcategorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_pkey PRIMARY KEY (id);


--
-- Name: tokens_api tokens_api_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_api
    ADD CONSTRAINT tokens_api_pkey PRIMARY KEY (id);


--
-- Name: user user_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_unique UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: viagens viagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagens
    ADD CONSTRAINT viagens_pkey PRIMARY KEY (id);


--
-- Name: account_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_user_id_idx ON public.account USING btree ("userId");


--
-- Name: anexos_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anexos_user_id_idx ON public.anexos USING btree (user_id);


--
-- Name: anotacao_anexos_anexo_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anotacao_anexos_anexo_id_idx ON public.anotacao_anexos USING btree (anexo_id);


--
-- Name: anotacoes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anotacoes_user_id_idx ON public.anotacoes USING btree (user_id);


--
-- Name: antecipacoes_parcelas_categoria_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX antecipacoes_parcelas_categoria_id_idx ON public.antecipacoes_parcelas USING btree (categoria_id);


--
-- Name: antecipacoes_parcelas_lancamento_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX antecipacoes_parcelas_lancamento_id_idx ON public.antecipacoes_parcelas USING btree (lancamento_id);


--
-- Name: antecipacoes_parcelas_pagador_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX antecipacoes_parcelas_pagador_id_idx ON public.antecipacoes_parcelas USING btree (pagador_id);


--
-- Name: antecipacoes_parcelas_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX antecipacoes_parcelas_user_id_idx ON public.antecipacoes_parcelas USING btree (user_id);


--
-- Name: cartoes_conta_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cartoes_conta_id_idx ON public.cartoes USING btree (conta_id);


--
-- Name: categorias_user_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categorias_user_id_type_idx ON public.categorias USING btree (user_id, tipo);


--
-- Name: compartilhamentos_pagador_created_by_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compartilhamentos_pagador_created_by_user_id_idx ON public.compartilhamentos_pagador USING btree (created_by_user_id);


--
-- Name: compartilhamentos_pagador_shared_with_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compartilhamentos_pagador_shared_with_user_id_idx ON public.compartilhamentos_pagador USING btree (shared_with_user_id);


--
-- Name: compartilhamentos_pagador_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX compartilhamentos_pagador_unique ON public.compartilhamentos_pagador USING btree (pagador_id, shared_with_user_id);


--
-- Name: dashboard_notification_states_user_id_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dashboard_notification_states_user_id_key_unique ON public.dashboard_notification_states USING btree (user_id, notification_key);


--
-- Name: faturas_cartao_id_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faturas_cartao_id_period_idx ON public.faturas USING btree (cartao_id, periodo);


--
-- Name: faturas_user_id_cartao_id_periodo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX faturas_user_id_cartao_id_periodo_key ON public.faturas USING btree (user_id, cartao_id, periodo);


--
-- Name: faturas_user_id_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faturas_user_id_period_idx ON public.faturas USING btree (user_id, periodo);


--
-- Name: import_category_mappings_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_category_mappings_category_id_idx ON public.import_category_mappings USING btree (category_id);


--
-- Name: insights_salvos_user_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX insights_salvos_user_period_idx ON public.insights_salvos USING btree (user_id, period);


--
-- Name: lancamento_anexos_anexo_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamento_anexos_anexo_id_idx ON public.lancamento_anexos USING btree (anexo_id);


--
-- Name: lancamentos_antecipacao_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_antecipacao_id_idx ON public.lancamentos USING btree (antecipacao_id);


--
-- Name: lancamentos_cartao_id_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_cartao_id_period_idx ON public.lancamentos USING btree (cartao_id, periodo);


--
-- Name: lancamentos_categoria_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_categoria_id_idx ON public.lancamentos USING btree (categoria_id);


--
-- Name: lancamentos_conta_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_conta_id_idx ON public.lancamentos USING btree (conta_id);


--
-- Name: lancamentos_ofx_import_fingerprint_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lancamentos_ofx_import_fingerprint_user_id_idx ON public.lancamentos USING btree (user_id, ofx_import_fingerprint) WHERE (ofx_import_fingerprint IS NOT NULL);


--
-- Name: lancamentos_pagador_id_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_pagador_id_period_idx ON public.lancamentos USING btree (pagador_id, periodo);


--
-- Name: lancamentos_series_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_series_id_idx ON public.lancamentos USING btree (series_id);


--
-- Name: lancamentos_subcategoria_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_subcategoria_id_idx ON public.lancamentos USING btree (subcategoria_id);


--
-- Name: lancamentos_transfer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_transfer_id_idx ON public.lancamentos USING btree (transfer_id);


--
-- Name: lancamentos_user_id_condition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_user_id_condition_idx ON public.lancamentos USING btree (user_id, condicao);


--
-- Name: lancamentos_user_id_pagador_id_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_user_id_pagador_id_period_idx ON public.lancamentos USING btree (user_id, pagador_id, periodo);


--
-- Name: lancamentos_user_id_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_user_id_period_idx ON public.lancamentos USING btree (user_id, periodo);


--
-- Name: lancamentos_user_id_period_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_user_id_period_type_idx ON public.lancamentos USING btree (user_id, periodo, tipo_transacao);


--
-- Name: lancamentos_user_id_purchase_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_user_id_purchase_date_idx ON public.lancamentos USING btree (user_id, data_compra);


--
-- Name: lancamentos_user_id_split_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_user_id_split_group_id_idx ON public.lancamentos USING btree (user_id, split_group_id);


--
-- Name: lancamentos_user_id_viagem_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lancamentos_user_id_viagem_id_idx ON public.lancamentos USING btree (user_id, viagem_id);


--
-- Name: orcamentos_categoria_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orcamentos_categoria_id_idx ON public.orcamentos USING btree (categoria_id);


--
-- Name: orcamentos_user_id_categoria_id_periodo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orcamentos_user_id_categoria_id_periodo_key ON public.orcamentos USING btree (user_id, categoria_id, periodo);


--
-- Name: orcamentos_user_id_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orcamentos_user_id_period_idx ON public.orcamentos USING btree (user_id, periodo);


--
-- Name: pagadores_share_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pagadores_share_code_key ON public.pagadores USING btree (share_code);


--
-- Name: passkey_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passkey_user_id_idx ON public.passkey USING btree ("userId");


--
-- Name: pre_lancamentos_lancamento_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pre_lancamentos_lancamento_id_idx ON public.pre_lancamentos USING btree (lancamento_id);


--
-- Name: pre_lancamentos_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pre_lancamentos_user_id_created_at_idx ON public.pre_lancamentos USING btree (user_id, created_at);


--
-- Name: pre_lancamentos_user_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pre_lancamentos_user_id_status_idx ON public.pre_lancamentos USING btree (user_id, status);


--
-- Name: session_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_user_id_idx ON public.session USING btree ("userId");


--
-- Name: subcategorias_user_id_categoria_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subcategorias_user_id_categoria_id_idx ON public.subcategorias USING btree (user_id, categoria_id);


--
-- Name: tokens_api_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tokens_api_token_hash_idx ON public.tokens_api USING btree (token_hash);


--
-- Name: viagens_user_id_data_inicio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viagens_user_id_data_inicio_idx ON public.viagens USING btree (user_id, data_inicio);


--
-- Name: account account_userId_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: anexos anexos_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anexos
    ADD CONSTRAINT anexos_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: anotacao_anexos anotacao_anexos_anexo_id_anexos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anotacao_anexos
    ADD CONSTRAINT anotacao_anexos_anexo_id_anexos_id_fk FOREIGN KEY (anexo_id) REFERENCES public.anexos(id) ON DELETE CASCADE;


--
-- Name: anotacao_anexos anotacao_anexos_anotacao_id_anotacoes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anotacao_anexos
    ADD CONSTRAINT anotacao_anexos_anotacao_id_anotacoes_id_fk FOREIGN KEY (anotacao_id) REFERENCES public.anotacoes(id) ON DELETE CASCADE;


--
-- Name: anotacoes anotacoes_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anotacoes
    ADD CONSTRAINT anotacoes_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: antecipacoes_parcelas antecipacoes_parcelas_categoria_id_categorias_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecipacoes_parcelas
    ADD CONSTRAINT antecipacoes_parcelas_categoria_id_categorias_id_fk FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE;


--
-- Name: antecipacoes_parcelas antecipacoes_parcelas_lancamento_id_lancamentos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecipacoes_parcelas
    ADD CONSTRAINT antecipacoes_parcelas_lancamento_id_lancamentos_id_fk FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id) ON DELETE CASCADE;


--
-- Name: antecipacoes_parcelas antecipacoes_parcelas_pagador_id_pagadores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecipacoes_parcelas
    ADD CONSTRAINT antecipacoes_parcelas_pagador_id_pagadores_id_fk FOREIGN KEY (pagador_id) REFERENCES public.pagadores(id) ON DELETE CASCADE;


--
-- Name: antecipacoes_parcelas antecipacoes_parcelas_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.antecipacoes_parcelas
    ADD CONSTRAINT antecipacoes_parcelas_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: cartoes cartoes_conta_id_contas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_conta_id_contas_id_fk FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cartoes cartoes_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: categorias categorias_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: compartilhamentos_pagador compartilhamentos_pagador_created_by_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compartilhamentos_pagador
    ADD CONSTRAINT compartilhamentos_pagador_created_by_user_id_user_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: compartilhamentos_pagador compartilhamentos_pagador_pagador_id_pagadores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compartilhamentos_pagador
    ADD CONSTRAINT compartilhamentos_pagador_pagador_id_pagadores_id_fk FOREIGN KEY (pagador_id) REFERENCES public.pagadores(id) ON DELETE CASCADE;


--
-- Name: compartilhamentos_pagador compartilhamentos_pagador_shared_with_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compartilhamentos_pagador
    ADD CONSTRAINT compartilhamentos_pagador_shared_with_user_id_user_id_fk FOREIGN KEY (shared_with_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: contas contas_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: dashboard_notification_states dashboard_notification_states_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_notification_states
    ADD CONSTRAINT dashboard_notification_states_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: establishment_logos establishment_logos_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_logos
    ADD CONSTRAINT establishment_logos_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: faturas faturas_cartao_id_cartoes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_cartao_id_cartoes_id_fk FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faturas faturas_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: import_category_mappings import_category_mappings_category_id_categorias_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_category_mappings
    ADD CONSTRAINT import_category_mappings_category_id_categorias_id_fk FOREIGN KEY (category_id) REFERENCES public.categorias(id) ON DELETE CASCADE;


--
-- Name: import_category_mappings import_category_mappings_subcategory_id_subcategorias_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_category_mappings
    ADD CONSTRAINT import_category_mappings_subcategory_id_subcategorias_id_fk FOREIGN KEY (subcategory_id) REFERENCES public.subcategorias(id) ON DELETE SET NULL;


--
-- Name: import_category_mappings import_category_mappings_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_category_mappings
    ADD CONSTRAINT import_category_mappings_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: import_name_mappings import_name_mappings_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_name_mappings
    ADD CONSTRAINT import_name_mappings_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: insights_salvos insights_salvos_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insights_salvos
    ADD CONSTRAINT insights_salvos_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: lancamento_anexos lancamento_anexos_anexo_id_anexos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamento_anexos
    ADD CONSTRAINT lancamento_anexos_anexo_id_anexos_id_fk FOREIGN KEY (anexo_id) REFERENCES public.anexos(id) ON DELETE CASCADE;


--
-- Name: lancamento_anexos lancamento_anexos_lancamento_id_lancamentos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamento_anexos
    ADD CONSTRAINT lancamento_anexos_lancamento_id_lancamentos_id_fk FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id) ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_antecipacao_id_antecipacoes_parcelas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_antecipacao_id_antecipacoes_parcelas_id_fk FOREIGN KEY (antecipacao_id) REFERENCES public.antecipacoes_parcelas(id) ON DELETE SET NULL;


--
-- Name: lancamentos lancamentos_cartao_id_cartoes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_cartao_id_cartoes_id_fk FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_categoria_id_categorias_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_categoria_id_categorias_id_fk FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_conta_id_contas_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_conta_id_contas_id_fk FOREIGN KEY (conta_id) REFERENCES public.contas(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_pagador_id_pagadores_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_pagador_id_pagadores_id_fk FOREIGN KEY (pagador_id) REFERENCES public.pagadores(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_subcategoria_id_subcategorias_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_subcategoria_id_subcategorias_id_fk FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id) ON DELETE SET NULL;


--
-- Name: lancamentos lancamentos_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: lancamentos lancamentos_viagem_id_viagens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_viagem_id_viagens_id_fk FOREIGN KEY (viagem_id) REFERENCES public.viagens(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_categoria_id_categorias_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_categoria_id_categorias_id_fk FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: orcamentos orcamentos_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: pagadores pagadores_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagadores
    ADD CONSTRAINT pagadores_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: passkey passkey_userId_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey
    ADD CONSTRAINT "passkey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: pre_lancamentos pre_lancamentos_lancamento_id_lancamentos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_lancamentos
    ADD CONSTRAINT pre_lancamentos_lancamento_id_lancamentos_id_fk FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id) ON DELETE SET NULL;


--
-- Name: pre_lancamentos pre_lancamentos_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_lancamentos
    ADD CONSTRAINT pre_lancamentos_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: preferencias_usuario preferencias_usuario_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_usuario
    ADD CONSTRAINT preferencias_usuario_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: reconciliation_ignores reconciliation_ignores_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_ignores
    ADD CONSTRAINT reconciliation_ignores_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: session session_userId_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: subcategorias subcategorias_categoria_id_categorias_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_categoria_id_categorias_id_fk FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE;


--
-- Name: subcategorias subcategorias_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: tokens_api tokens_api_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_api
    ADD CONSTRAINT tokens_api_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: viagens viagens_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viagens
    ADD CONSTRAINT viagens_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


