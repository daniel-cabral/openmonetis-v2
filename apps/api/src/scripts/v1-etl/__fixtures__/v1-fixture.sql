-- Clean V1 conversion fixture (T027), applied on top of v1-schema.sql.
-- Synthetic data only: two users, one case per conversion, no blocker.
-- Id scheme: <table code>000000-0000-4000-8000-<sequence>. Table codes: 10 pagadores, 20 contas,
-- 30 cartoes, 40 categorias, 41 subcategorias, 50 viagens, 60 lancamentos, 61 series_id,
-- 62 split_group_id, 63 transfer_id, 64 antecipacoes_parcelas, 70 faturas, 80 anotacoes,
-- 81 anexos, 90 pre_lancamentos, a0 orcamentos, b0 notification states, c0 preferences,
-- d0 tokens_api, e0 compartilhamentos_pagador. Sequences 0x9x belong to user B.

INSERT INTO public."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") VALUES
  ('v1-user-a', 'Ana Fixture', 'ana@example.test', true, NULL, '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z'),
  ('v1-user-b', 'Bruno Fixture', 'bruno@example.test', true, NULL, '2026-01-01T11:00:00Z', '2026-01-01T11:00:00Z');

-- Credential with the scrypt hash of the literal test password "v1-fixture-password" (T003).
INSERT INTO public.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES
  ('v1-account-a', 'v1-user-a', 'credential', 'v1-user-a',
   'c41b0ec2d293555d0b9089ef0f5cc82f:28685a86ad6b70db750e48597c2911f0463e86539cdaf30f5cdaafe314e3718d9e37a781e879188110adb9d197ddf934aab0d0882278c195fd0f1d4a13ac8797',
   '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z'),
-- User B: a hash V2 cannot verify (fixable, password reset) and a Google sign-in.
  ('v1-account-b', 'v1-user-b', 'credential', 'v1-user-b', 'not-a-scrypt-hash', '2026-01-01T11:00:00Z', '2026-01-01T11:00:00Z'),
  ('v1-account-b-google', 'google-subject-b', 'google', 'v1-user-b', NULL, '2026-01-01T11:00:00Z', '2026-01-01T11:00:00Z');

INSERT INTO public.passkey (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", transports, aaguid, "createdAt") VALUES
  ('v1-passkey-a', 'Fixture laptop', 'synthetic-public-key', 'v1-user-a', 'synthetic-credential-id', 0, 'singleDevice', false, 'internal', NULL, '2026-01-01T10:05:00Z');

INSERT INTO public.session (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId") VALUES
  ('v1-session-a', '2026-12-31T00:00:00Z', 'synthetic-session-token', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z', NULL, NULL, 'v1-user-a');

INSERT INTO public.pagadores (id, nome, email, avatar_url, status, anotacao, role, is_auto_send, share_code, last_mail, created_at, user_id) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Ana Fixture', 'ana@example.test', NULL, 'Ativo', NULL, 'admin', false, 'share-a-admin', NULL, '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('10000000-0000-4000-8000-000000000002', 'Carla Fixture', 'carla@example.test', NULL, 'Ativo', NULL, 'terceiro', true, 'share-a-ext', '2026-01-20T09:00:00Z', '2026-01-01T10:10:00Z', 'v1-user-a'),
  ('10000000-0000-4000-8000-000000000091', 'Bruno Fixture', 'bruno@example.test', NULL, 'Ativo', NULL, 'admin', false, 'share-b-admin', NULL, '2026-01-01T11:00:00Z', 'v1-user-b');

INSERT INTO public.compartilhamentos_pagador (id, pagador_id, shared_with_user_id, permission, created_by_user_id, created_at) VALUES
  ('e0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'v1-user-b', 'read', 'v1-user-a', '2026-01-02T10:00:00Z');

INSERT INTO public.tokens_api (id, user_id, name, token_hash, token_prefix, last_used_at, last_used_ip, expires_at, revoked_at, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'v1-user-a', 'Companion', 'synthetic-token-hash', 'omsyn', NULL, NULL, NULL, NULL, '2026-01-02T10:00:00Z');

-- Every V1 account type; account 01 keeps the initial balance as income, account 02 excludes it.
INSERT INTO public.contas (id, nome, tipo_conta, anotacao, status, logo, saldo_inicial, excluir_do_saldo, excluir_saldo_inicial_receitas, user_id, created_at) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Conta Principal', 'Conta Corrente', NULL, 'Ativa', 'bank.png', 1000.00, false, false, 'v1-user-a', '2026-01-02T09:00:00Z'),
  ('20000000-0000-4000-8000-000000000002', 'Reserva', 'Conta Poupança', NULL, 'Ativa', 'bank.png', 500.00, false, true, 'v1-user-a', '2026-01-02T09:05:00Z'),
  ('20000000-0000-4000-8000-000000000003', 'Carteira App', 'Carteira Digital', NULL, 'Ativa', 'wallet.png', 0.00, false, false, 'v1-user-a', '2026-01-02T09:10:00Z'),
  ('20000000-0000-4000-8000-000000000004', 'Investimentos', 'Conta Investimento', NULL, 'Ativa', 'chart.png', 0.00, true, false, 'v1-user-a', '2026-01-02T09:15:00Z'),
  ('20000000-0000-4000-8000-000000000005', 'Dinheiro Vivo', 'Dinheiro', NULL, 'Ativa', 'cash.png', 0.00, false, false, 'v1-user-a', '2026-01-02T09:20:00Z'),
  ('20000000-0000-4000-8000-000000000006', 'Vale Refeicao', 'Pré-Pago | VR/VA', NULL, 'Ativa', 'card.png', 0.00, false, false, 'v1-user-a', '2026-01-02T09:25:00Z'),
  ('20000000-0000-4000-8000-000000000007', 'Conta Antiga', 'Outros', NULL, 'Inativa', 'bank.png', 0.00, false, false, 'v1-user-a', '2026-01-02T09:30:00Z'),
  ('20000000-0000-4000-8000-000000000091', 'Conta B', 'Conta Corrente', NULL, 'Ativa', 'bank.png', 0.00, false, false, 'v1-user-b', '2026-01-02T11:00:00Z');

INSERT INTO public.cartoes (id, nome, dt_fechamento, dt_vencimento, anotacao, limite, bandeira, logo, status, created_at, user_id, conta_id) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Cartao Azul', '08', '15', NULL, 5000.00, 'Mastercard', 'card.png', 'Ativo', '2026-01-03T09:00:00Z', 'v1-user-a', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', 'Cartao Verde', '08', '15', NULL, 1500.00, 'Desconhecida', 'card.png', 'Ativo', '2026-01-03T09:05:00Z', 'v1-user-a', '20000000-0000-4000-8000-000000000001');

-- "Alimentação", "Reembolso", "Pagamentos" and "Transferência interna" merge onto V2 defaults
-- (none has subcategories); "Casa" is a new non-system parent of the subcategory "Aluguel".
INSERT INTO public.categorias (id, nome, tipo, icone, created_at, user_id) VALUES
  ('40000000-0000-4000-8000-000000000001', 'Alimentação', 'despesa', 'RiRestaurantLine', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000002', 'Casa', 'despesa', 'RiHomeLine', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000003', 'Saldo inicial', 'receita', 'RiWallet2Line', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000004', 'Transferência interna', 'receita', 'RiArrowLeftRightLine', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000005', 'Pagamentos', 'despesa', 'RiBillLine', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000006', 'Reembolso', 'receita', 'RiRefundLine', '2026-01-01T10:00:00Z', 'v1-user-a');

INSERT INTO public.subcategorias (id, nome, categoria_id, created_at, user_id) VALUES
  ('41000000-0000-4000-8000-000000000001', 'Aluguel', '40000000-0000-4000-8000-000000000002', '2026-01-01T10:00:00Z', 'v1-user-a');

INSERT INTO public.viagens (id, user_id, nome, data_inicio, data_fim, anotacao, created_at) VALUES
  ('50000000-0000-4000-8000-000000000001', 'v1-user-a', 'Viagem Serra', '2026-02-01', '2026-02-20', 'Ferias curtas', '2026-01-04T09:00:00Z');

-- Transactions. Card rows keep periods consistent with closing day 08 (purchases on the
-- closing day go to the next invoice); non-card rows keep periodo = month of data_compra
-- (boletos: month of data_vencimento).
INSERT INTO public.lancamentos (id, user_id, condicao, nome, forma_pagamento, anotacao, valor, data_compra, tipo_transacao, periodo, qtde_parcela, parcela_atual, data_vencimento, dt_pagamento_boleto, realizado, dividido, antecipado, cartao_id, conta_id, categoria_id, subcategoria_id, pagador_id, series_id, split_group_id, transfer_id, viagem_id, created_at) VALUES
  -- Initial balance rows (note "saldo inicial"), one per flag value.
  ('60000000-0000-4000-8000-000000000001', 'v1-user-a', 'À vista', 'Saldo inicial - Conta Principal', 'Pix', 'saldo inicial', 1000.00, '2026-01-02', 'Receita', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-02T09:00:00Z'),
  ('60000000-0000-4000-8000-000000000002', 'v1-user-a', 'À vista', 'Saldo inicial - Reserva', 'Pix', 'saldo inicial', 500.00, '2026-01-02', 'Receita', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-02T09:05:00Z'),
  -- Singles, one per payment method.
  ('60000000-0000-4000-8000-000000000010', 'v1-user-a', 'À vista', 'Mercado Central', 'Cartão de crédito', NULL, -150.00, '2026-01-20', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-20T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000011', 'v1-user-a', 'À vista', 'Padaria Sol', 'Cartão de débito', NULL, -25.50, '2026-01-12', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-12T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000012', 'v1-user-a', 'À vista', 'Feira Livre', 'Pix', 'Frutas da semana', -40.00, '2026-01-14', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-14T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000013', 'v1-user-a', 'À vista', 'Lanche', 'Dinheiro', NULL, -12.00, '2026-01-15', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-15T12:00:00Z'),
  -- The boleto below is paid in the month after its period (reconcile: boleto-posting-month).
  ('60000000-0000-4000-8000-000000000014', 'v1-user-a', 'À vista', 'Condominio', 'Boleto', NULL, -300.00, '2026-01-05', 'Despesa', '2026-01', NULL, NULL, '2026-01-10', '2026-02-03', true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-05T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000015', 'v1-user-a', 'À vista', 'Restaurante Vale', 'Pré-Pago | VR/VA', NULL, -45.00, '2026-01-16', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-16T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000016', 'v1-user-a', 'À vista', 'Pousada Serra', 'Transferência bancária', NULL, -600.00, '2026-02-03', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, '50000000-0000-4000-8000-000000000001', '2026-02-03T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000017', 'v1-user-a', 'À vista', 'Loja do Bairro', 'Cartão de crédito', NULL, -80.00, '2026-02-20', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000002', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-02-20T12:00:00Z'),
  -- Transfer pair: source side negative, destination side positive, shared transfer_id.
  ('60000000-0000-4000-8000-000000000020', 'v1-user-a', 'À vista', 'Saída - Transf. entre contas', 'Transferência bancária', 'de Conta Principal -> Reserva', -100.00, '2026-01-18', 'Transferência', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, '63000000-0000-4000-8000-000000000001', NULL, '2026-01-18T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000021', 'v1-user-a', 'À vista', 'Entrada - Transf. entre contas', 'Transferência bancária', 'de Conta Principal -> Reserva', 100.00, '2026-01-18', 'Transferência', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, '63000000-0000-4000-8000-000000000001', NULL, '2026-01-18T12:00:00Z'),
  -- Split group of 2 persons (admin owner plus the external payer).
  ('60000000-0000-4000-8000-000000000030', 'v1-user-a', 'À vista', 'Jantar', 'Pix', NULL, -60.00, '2026-01-22', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, true, true, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, '62000000-0000-4000-8000-000000000001', NULL, NULL, '2026-01-22T12:00:00Z'),
  ('60000000-0000-4000-8000-000000000031', 'v1-user-a', 'À vista', 'Jantar', 'Pix', NULL, -40.00, '2026-01-22', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, true, true, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000002', NULL, '62000000-0000-4000-8000-000000000001', NULL, NULL, '2026-01-22T12:00:00Z'),
  -- Installment series of 3, all present (card).
  ('60000000-0000-4000-8000-000000000040', 'v1-user-a', 'Parcelado', 'Notebook', 'Cartão de crédito', NULL, -100.00, '2026-01-20', 'Despesa', '2026-02', 3, 1, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', NULL, NULL, NULL, '2026-01-20T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000041', 'v1-user-a', 'Parcelado', 'Notebook', 'Cartão de crédito', NULL, -100.00, '2026-02-20', 'Despesa', '2026-03', 3, 2, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', NULL, NULL, NULL, '2026-01-20T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000042', 'v1-user-a', 'Parcelado', 'Notebook', 'Cartão de crédito', NULL, -100.00, '2026-03-20', 'Despesa', '2026-04', 3, 3, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', NULL, NULL, NULL, '2026-01-20T13:00:00Z'),
  -- Installment series of 3 with number 2 missing (installment.gap, account).
  ('60000000-0000-4000-8000-000000000043', 'v1-user-a', 'Parcelado', 'Curso Online', 'Pix', NULL, -90.00, '2026-01-10', 'Despesa', '2026-01', 3, 1, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', NULL, NULL, NULL, '2026-01-10T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000044', 'v1-user-a', 'Parcelado', 'Curso Online', 'Pix', NULL, -90.00, '2026-03-10', 'Despesa', '2026-03', 3, 3, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', NULL, NULL, NULL, '2026-01-10T13:00:00Z'),
  -- Installment series of 4 whose installments 3 and 4 are anticipated (card).
  ('60000000-0000-4000-8000-000000000045', 'v1-user-a', 'Parcelado', 'Celular', 'Cartão de crédito', NULL, -50.00, '2026-01-25', 'Despesa', '2026-02', 4, 1, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', NULL, NULL, NULL, '2026-01-25T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000046', 'v1-user-a', 'Parcelado', 'Celular', 'Cartão de crédito', NULL, -50.00, '2026-02-25', 'Despesa', '2026-03', 4, 2, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', NULL, NULL, NULL, '2026-01-25T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000047', 'v1-user-a', 'Parcelado', 'Celular', 'Cartão de crédito', NULL, -50.00, '2026-03-25', 'Despesa', '2026-04', 4, 3, NULL, NULL, false, false, true, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', NULL, NULL, NULL, '2026-01-25T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000048', 'v1-user-a', 'Parcelado', 'Celular', 'Cartão de crédito', NULL, -50.00, '2026-04-25', 'Despesa', '2026-05', 4, 4, NULL, NULL, false, false, true, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', NULL, NULL, NULL, '2026-01-25T13:00:00Z'),
  -- Anticipation adjustment row (installments 3 and 4 with a 5.00 discount).
  ('60000000-0000-4000-8000-000000000049', 'v1-user-a', 'À vista', 'Celular (antecipacao de 2 parcelas)', 'Cartão de crédito', 'Antecipacao de parcelas', -95.00, '2026-02-15', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-02-15T13:00:00Z'),
  -- Markers: full invoice payment, partial invoice payment, invoice credit line, refund.
  ('60000000-0000-4000-8000-000000000060', 'v1-user-a', 'À vista', 'Pagamento fatura - Cartao Azul', 'Pix', 'AUTO_FATURA:30000000-0000-4000-8000-000000000001:2026-02', -370.00, '2026-02-14', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-02-14T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000061', 'v1-user-a', 'À vista', 'Pagamento fatura - Cartao Azul', 'Pix', 'AUTO_FATURA:30000000-0000-4000-8000-000000000001:2026-03:a1b2c3d4', -100.00, '2026-03-10', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-03-10T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000062', 'v1-user-a', 'À vista', 'Credito na fatura', 'Cartão de crédito', 'AUTO_FATURA:CREDITO:30000000-0000-4000-8000-000000000001:2026-03:["ofx-credit-0001"]', 20.00, '2026-02-18', 'Receita', '2026-03', NULL, NULL, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000006', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-02-18T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000063', 'v1-user-a', 'À vista', 'Estorno Mercado Central', 'Cartão de crédito', 'AUTO_REEMBOLSO:60000000-0000-4000-8000-000000000010', 30.00, '2026-01-22', 'Receita', '2026-02', NULL, NULL, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000006', NULL, '10000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, '2026-01-22T13:00:00Z'),
  -- Recurring (a): amount change holding to the end.
  ('60000000-0000-4000-8000-000000000101', 'v1-user-a', 'Recorrente', 'Aluguel Garagem', 'Pix', NULL, -100.00, '2026-01-15', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000102', 'v1-user-a', 'Recorrente', 'Aluguel Garagem', 'Pix', NULL, -100.00, '2026-02-15', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000103', 'v1-user-a', 'Recorrente', 'Aluguel Garagem', 'Pix', NULL, -100.00, '2026-03-15', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000104', 'v1-user-a', 'Recorrente', 'Aluguel Garagem', 'Pix', NULL, -120.00, '2026-04-15', 'Despesa', '2026-04', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000105', 'v1-user-a', 'Recorrente', 'Aluguel Garagem', 'Pix', NULL, -120.00, '2026-05-15', 'Despesa', '2026-05', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  -- Recurring (b): isolated amount deviation (February) and isolated day deviation (April, day 10).
  ('60000000-0000-4000-8000-000000000111', 'v1-user-a', 'Recorrente', 'Academia', 'Pix', NULL, -100.00, '2026-01-15', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000112', 'v1-user-a', 'Recorrente', 'Academia', 'Pix', NULL, -150.00, '2026-02-15', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000113', 'v1-user-a', 'Recorrente', 'Academia', 'Pix', NULL, -100.00, '2026-03-15', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000114', 'v1-user-a', 'Recorrente', 'Academia', 'Pix', NULL, -100.00, '2026-04-10', 'Despesa', '2026-04', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000115', 'v1-user-a', 'Recorrente', 'Academia', 'Pix', NULL, -100.00, '2026-05-15', 'Despesa', '2026-05', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000116', 'v1-user-a', 'Recorrente', 'Academia', 'Pix', NULL, -100.00, '2026-06-15', 'Despesa', '2026-06', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  -- Recurring (c): two gaps (March and May missing); the February occurrence is linked to the trip.
  ('60000000-0000-4000-8000-000000000121', 'v1-user-a', 'Recorrente', 'Streaming', 'Pix', NULL, -100.00, '2026-01-15', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000013', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000122', 'v1-user-a', 'Recorrente', 'Streaming', 'Pix', NULL, -100.00, '2026-02-15', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000013', NULL, NULL, '50000000-0000-4000-8000-000000000001', '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000124', 'v1-user-a', 'Recorrente', 'Streaming', 'Pix', NULL, -100.00, '2026-04-15', 'Despesa', '2026-04', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000013', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000126', 'v1-user-a', 'Recorrente', 'Streaming', 'Pix', NULL, -100.00, '2026-06-15', 'Despesa', '2026-06', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000013', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  -- Recurring (d): zero-amount occurrence in March becomes a gap.
  ('60000000-0000-4000-8000-000000000131', 'v1-user-a', 'Recorrente', 'Seguro Residencial', 'Pix', NULL, -100.00, '2026-01-15', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000014', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000132', 'v1-user-a', 'Recorrente', 'Seguro Residencial', 'Pix', NULL, -100.00, '2026-02-15', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000014', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000133', 'v1-user-a', 'Recorrente', 'Seguro Residencial', 'Pix', NULL, 0.00, '2026-03-15', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000014', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000134', 'v1-user-a', 'Recorrente', 'Seguro Residencial', 'Pix', NULL, -100.00, '2026-04-15', 'Despesa', '2026-04', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000014', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  -- Recurring (e): card series on closing day 08, V1 period is the next month.
  ('60000000-0000-4000-8000-000000000141', 'v1-user-a', 'Recorrente', 'Assinatura Musica', 'Cartão de crédito', NULL, -100.00, '2026-01-08', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, true, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000015', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000142', 'v1-user-a', 'Recorrente', 'Assinatura Musica', 'Cartão de crédito', NULL, -100.00, '2026-02-08', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000015', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000143', 'v1-user-a', 'Recorrente', 'Assinatura Musica', 'Cartão de crédito', NULL, -100.00, '2026-03-08', 'Despesa', '2026-04', NULL, NULL, NULL, NULL, false, false, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000015', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  -- Recurring (f): boleto due 5 days after purchase; the deadline is the last due date.
  ('60000000-0000-4000-8000-000000000151', 'v1-user-a', 'Recorrente', 'Escola Idiomas', 'Boleto', NULL, -100.00, '2026-01-10', 'Despesa', '2026-01', NULL, NULL, '2026-01-15', '2026-01-14', true, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000016', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000152', 'v1-user-a', 'Recorrente', 'Escola Idiomas', 'Boleto', NULL, -100.00, '2026-02-10', 'Despesa', '2026-02', NULL, NULL, '2026-02-15', NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000016', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000153', 'v1-user-a', 'Recorrente', 'Escola Idiomas', 'Boleto', NULL, -100.00, '2026-03-10', 'Despesa', '2026-03', NULL, NULL, '2026-03-15', NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000016', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  -- Recurring (h): two rows in February; the one dated 2026-02-20 is detached as a single.
  ('60000000-0000-4000-8000-000000000171', 'v1-user-a', 'Recorrente', 'Internet Casa', 'Pix', NULL, -100.00, '2026-01-15', 'Despesa', '2026-01', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000017', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000172', 'v1-user-a', 'Recorrente', 'Internet Casa', 'Pix', NULL, -100.00, '2026-02-15', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000017', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000173', 'v1-user-a', 'Recorrente', 'Internet Casa', 'Pix', NULL, -100.00, '2026-02-20', 'Despesa', '2026-02', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000017', NULL, NULL, NULL, '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000174', 'v1-user-a', 'Recorrente', 'Internet Casa', 'Pix', NULL, -100.00, '2026-03-15', 'Despesa', '2026-03', NULL, NULL, NULL, NULL, false, false, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000017', NULL, NULL, NULL, '2026-01-01T14:00:00Z');

-- Reconciliation stamps on one single (stamp.dropped).
UPDATE public.lancamentos
SET ofx_fit_id = 'fit-0001', import_batch_id = 'batch-0001', ofx_import_fingerprint = 'ofx-fingerprint-0001'
WHERE id = '60000000-0000-4000-8000-000000000011';

INSERT INTO public.antecipacoes_parcelas (id, series_id, periodo_antecipacao, data_antecipacao, parcelas_antecipadas, valor_total, qtde_parcelas, desconto, lancamento_id, pagador_id, categoria_id, anotacao, user_id, created_at) VALUES
  ('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', '2026-03', '2026-02-15',
   '["60000000-0000-4000-8000-000000000047", "60000000-0000-4000-8000-000000000048"]',
   100.00, 2, 5.00, '60000000-0000-4000-8000-000000000049', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', NULL, 'v1-user-a', '2026-02-15T13:00:00Z');

UPDATE public.lancamentos
SET antecipacao_id = '64000000-0000-4000-8000-000000000001'
WHERE id IN ('60000000-0000-4000-8000-000000000047', '60000000-0000-4000-8000-000000000048');

-- Invoices: 2026-02 paid (full payment 060), 2026-03 pending with the partial payment 061.
INSERT INTO public.faturas (id, status_pagamento, periodo, created_at, user_id, cartao_id) VALUES
  ('70000000-0000-4000-8000-000000000001', 'pago', '2026-02', '2026-02-01T09:00:00Z', 'v1-user-a', '30000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002', 'pendente', '2026-03', '2026-03-01T09:00:00Z', 'v1-user-a', '30000000-0000-4000-8000-000000000001');

INSERT INTO public.anotacoes (id, titulo, descricao, tipo, tasks, arquivada, created_at, user_id) VALUES
  ('80000000-0000-4000-8000-000000000001', 'Lista de compras', 'Comprar frutas e pao', 'nota', NULL, false, '2026-01-05T09:00:00Z', 'v1-user-a'),
  ('80000000-0000-4000-8000-000000000002', 'Tarefas da casa', 'Organizar a garagem', 'tarefa',
   '[{"id":"t1","text":"Pagar conta de luz","completed":true},{"id":"t2","text":"Trocar lampada","completed":false}]',
   false, '2026-01-06T09:00:00Z', 'v1-user-a');

INSERT INTO public.anexos (id, user_id, chave_arquivo, nome_arquivo, tamanho_bytes, mime_type, created_at) VALUES
  ('81000000-0000-4000-8000-000000000001', 'v1-user-a', 'v1-fixture/receipt-0001.pdf', 'recibo.pdf', 2048, 'application/pdf', '2026-01-20T12:30:00Z'),
  ('81000000-0000-4000-8000-000000000002', 'v1-user-a', 'v1-fixture/note-0001.png', 'lista.png', 4096, 'image/png', '2026-01-05T09:30:00Z');

INSERT INTO public.lancamento_anexos (lancamento_id, anexo_id) VALUES
  ('60000000-0000-4000-8000-000000000010', '81000000-0000-4000-8000-000000000001');

INSERT INTO public.anotacao_anexos (anotacao_id, anexo_id) VALUES
  ('80000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002');

INSERT INTO public.pre_lancamentos (id, user_id, source_app, source_app_name, original_title, original_text, notification_timestamp, parsed_name, parsed_amount, status, lancamento_id, processed_at, discarded_at, created_at, updated_at) VALUES
  ('90000000-0000-4000-8000-000000000001', 'v1-user-a', 'com.example.bank', 'Banco Exemplo', 'Compra aprovada', 'Compra de R$ 18,90 em Cafe Central', '2026-03-02T10:00:00Z', 'Cafe Central', 18.90, 'pending', NULL, NULL, NULL, '2026-03-02T10:00:05Z', '2026-03-02T10:00:05Z'),
  ('90000000-0000-4000-8000-000000000002', 'v1-user-a', 'com.example.bank', 'Banco Exemplo', 'Pix enviado', 'Pix de R$ 40,00 para Feira Livre', '2026-01-14T11:00:00Z', 'Feira Livre', 40.00, 'processed', '60000000-0000-4000-8000-000000000012', '2026-01-14T12:00:00Z', NULL, '2026-01-14T11:00:05Z', '2026-01-14T12:00:00Z'),
  ('90000000-0000-4000-8000-000000000003', 'v1-user-a', 'com.example.bank', 'Banco Exemplo', 'Compra aprovada', 'Compra de R$ 9,99 em App Store', '2026-02-05T08:00:00Z', 'App Store', 9.99, 'discarded', NULL, NULL, '2026-02-05T09:00:00Z', '2026-02-05T08:00:05Z', '2026-02-05T09:00:00Z');

INSERT INTO public.dashboard_notification_states (id, user_id, notification_key, fingerprint, read_at, archived_at, created_at, updated_at) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'v1-user-a', 'invoice-due:cartao-azul:2026-03', 'fp-invoice-0001', '2026-03-05T09:00:00Z', NULL, '2026-03-01T09:00:00Z', '2026-03-05T09:00:00Z');

INSERT INTO public.establishment_logos (user_id, name_key, domain, updated_at) VALUES
  ('v1-user-a', 'mercado central', 'mercado-central.example.test', '2026-01-20T12:00:00Z');

INSERT INTO public.orcamentos (id, valor, periodo, created_at, user_id, categoria_id) VALUES
  ('a0000000-0000-4000-8000-000000000001', 800.00, '2026-03', '2026-02-25T09:00:00Z', 'v1-user-a', '40000000-0000-4000-8000-000000000001');

INSERT INTO public.preferencias_usuario (id, user_id, extrato_note_as_column, lancamentos_column_order, attachment_max_size_mb, dashboard_widgets, created_at, updated_at, mostrar_resumo_lancamento, agrupar_lancamentos_por_data, ocultar_parcelas_antecipadas) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'v1-user-a', true, NULL, 25,
   '{"order": ["accounts", "invoices", "attention"], "hidden": ["goals"], "myAccountsShowExcluded": false}',
   '2026-01-01T10:00:00Z', '2026-01-10T10:00:00Z', false, true, true);

INSERT INTO public.import_category_mappings (user_id, description_key, category_id, updated_at, subcategory_id) VALUES
  ('v1-user-a', 'mercado central', '40000000-0000-4000-8000-000000000001', '2026-01-20T12:00:00Z', NULL),
  ('v1-user-a', 'condominio', '40000000-0000-4000-8000-000000000002', '2026-01-05T12:00:00Z', '41000000-0000-4000-8000-000000000001');

INSERT INTO public.import_name_mappings (user_id, description_key, name, updated_at) VALUES
  ('v1-user-a', 'padaria sol centro', 'Padaria Sol', '2026-01-12T12:00:00Z');
