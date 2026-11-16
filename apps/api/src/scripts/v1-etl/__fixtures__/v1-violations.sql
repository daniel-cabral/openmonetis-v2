-- Validator violations fixture (T014), applied on top of v1-schema.sql.
-- Synthetic data only: one row or case per catalog rule. User A carries most cases; user B shares
-- A's email up to case, has two admin payers and owns the category A references.
-- Id scheme as v1-fixture.sql: <table code>000000-0000-4000-8000-<sequence>; 0x9x belong to user B.
-- amount.precision is not seeded: lancamentos.valor is numeric(12,2).

-- schema.unmapped
CREATE TABLE public.tabela_nova (id text PRIMARY KEY);

-- user.email-case-duplicate
INSERT INTO public."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") VALUES
  ('v1-user-a', 'Ana Violacao', 'ana.violacao@example.test', true, NULL, '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z'),
  ('v1-user-b', 'Bia Violacao', 'ANA.Violacao@example.test', true, NULL, '2026-01-01T11:00:00Z', '2026-01-01T11:00:00Z');

-- credential.incompatible-hash
INSERT INTO public.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES
  ('v1-account-a', 'v1-user-a', 'credential', 'v1-user-a', 'not-a-scrypt-hash', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z');

-- passkey.duplicate-credential (each passkey also yields the informational passkey.rp-id-mismatch)
INSERT INTO public.passkey (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", transports, aaguid, "createdAt") VALUES
  ('v1-passkey-a', 'Fixture laptop', 'synthetic-public-key-a', 'v1-user-a', 'synthetic-shared-credential', 0, 'singleDevice', false, 'internal', NULL, '2026-01-01T10:05:00Z'),
  ('v1-passkey-b', 'Fixture phone', 'synthetic-public-key-b', 'v1-user-b', 'synthetic-shared-credential', 0, 'singleDevice', false, 'internal', NULL, '2026-01-01T11:05:00Z');

-- people.blank-name (A, payer 02); people.admin-cardinality (B, two admins)
INSERT INTO public.pagadores (id, nome, email, avatar_url, status, anotacao, role, is_auto_send, share_code, last_mail, created_at, user_id) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Ana Violacao', NULL, NULL, 'Ativo', NULL, 'admin', false, 'share-va-admin', NULL, '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('10000000-0000-4000-8000-000000000002', '   ', NULL, NULL, 'Ativo', NULL, 'terceiro', false, 'share-va-blank', NULL, '2026-01-01T10:10:00Z', 'v1-user-a'),
  ('10000000-0000-4000-8000-000000000091', 'Bia Violacao', NULL, NULL, 'Ativo', NULL, 'admin', false, 'share-vb-admin-1', NULL, '2026-01-01T11:00:00Z', 'v1-user-b'),
  ('10000000-0000-4000-8000-000000000092', 'Bia Segunda', NULL, NULL, 'Ativo', NULL, 'admin', false, 'share-vb-admin-2', NULL, '2026-01-01T11:10:00Z', 'v1-user-b');

-- account.unknown-type (account 02)
INSERT INTO public.contas (id, nome, tipo_conta, anotacao, status, logo, saldo_inicial, excluir_do_saldo, excluir_saldo_inicial_receitas, user_id, created_at) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Conta Principal', 'Conta Corrente', NULL, 'Ativa', 'bank.png', 0.00, false, false, 'v1-user-a', '2026-01-02T09:00:00Z'),
  ('20000000-0000-4000-8000-000000000002', 'Conta Rara', 'Conta Estranha', NULL, 'Ativa', 'bank.png', 0.00, false, false, 'v1-user-a', '2026-01-02T09:05:00Z'),
  ('20000000-0000-4000-8000-000000000091', 'Conta B', 'Conta Corrente', NULL, 'Ativa', 'bank.png', 0.00, false, false, 'v1-user-b', '2026-01-02T11:00:00Z');

-- card.day-out-of-range (card 03); card.unknown-brand (card 04)
INSERT INTO public.cartoes (id, nome, dt_fechamento, dt_vencimento, anotacao, limite, bandeira, logo, status, created_at, user_id, conta_id) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Cartao Azul', '08', '15', NULL, 5000.00, 'Mastercard', 'card.png', 'Ativo', '2026-01-03T09:00:00Z', 'v1-user-a', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', 'Cartao Branco', '08', '15', NULL, 5000.00, 'Visa', 'card.png', 'Ativo', '2026-01-03T09:05:00Z', 'v1-user-a', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000003', 'Cartao Torto', '35', '15', NULL, 5000.00, 'Mastercard', 'card.png', 'Ativo', '2026-01-03T09:10:00Z', 'v1-user-a', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000004', 'Cartao Raro', '08', '15', NULL, 5000.00, 'Desconhecida', 'card.png', 'Ativo', '2026-01-03T09:15:00Z', 'v1-user-a', '20000000-0000-4000-8000-000000000001');

-- category.system-parent ("Pagamentos" with a subcategory); "Bonus" is the receita parent of the
-- subcategory used by the category.subcategory-type-mismatch row; category 91 belongs to user B.
INSERT INTO public.categorias (id, nome, tipo, icone, created_at, user_id) VALUES
  ('40000000-0000-4000-8000-000000000001', 'Mercado Bairro', 'despesa', 'RiShoppingCartLine', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000002', 'Bonus Extra', 'receita', 'RiMoneyDollarCircleLine', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000003', 'Pagamentos', 'despesa', 'RiBillLine', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('40000000-0000-4000-8000-000000000091', 'Categoria B', 'despesa', 'RiPriceTag3Line', '2026-01-01T11:00:00Z', 'v1-user-b');

INSERT INTO public.subcategorias (id, nome, categoria_id, created_at, user_id) VALUES
  ('41000000-0000-4000-8000-000000000001', 'Premio', '40000000-0000-4000-8000-000000000002', '2026-01-01T10:00:00Z', 'v1-user-a'),
  ('41000000-0000-4000-8000-000000000002', 'Boletos', '40000000-0000-4000-8000-000000000003', '2026-01-01T10:00:00Z', 'v1-user-a');

-- trip.length (61 characters)
INSERT INTO public.viagens (id, user_id, nome, data_inicio, data_fim, anotacao, created_at) VALUES
  ('50000000-0000-4000-8000-000000000001', 'v1-user-a', repeat('V', 61), '2026-02-01', '2026-02-10', NULL, '2026-01-04T09:00:00Z');

-- Non-card rows keep periodo = month of data_compra unless the case is the mismatch itself.
INSERT INTO public.lancamentos (id, user_id, condicao, nome, forma_pagamento, anotacao, valor, data_compra, tipo_transacao, periodo, qtde_parcela, parcela_atual, realizado, cartao_id, conta_id, categoria_id, subcategoria_id, pagador_id, series_id, created_at) VALUES
  -- amount.zero
  ('60000000-0000-4000-8000-000000000001', 'v1-user-a', 'À vista', 'Valor zerado', 'Pix', NULL, 0.00, '2026-01-10', 'Despesa', '2026-01', NULL, NULL, true, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, '2026-01-10T12:00:00Z'),
  -- reference.dangling (category of user B)
  ('60000000-0000-4000-8000-000000000002', 'v1-user-a', 'À vista', 'Categoria alheia', 'Pix', NULL, -10.00, '2026-01-11', 'Despesa', '2026-01', NULL, NULL, true, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000091', NULL, '10000000-0000-4000-8000-000000000001', NULL, '2026-01-11T12:00:00Z'),
  -- text.too-long (161 characters)
  ('60000000-0000-4000-8000-000000000003', 'v1-user-a', 'À vista', repeat('N', 161), 'Pix', NULL, -10.00, '2026-01-12', 'Despesa', '2026-01', NULL, NULL, true, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, '2026-01-12T12:00:00Z'),
  -- transaction.period-date-mismatch
  ('60000000-0000-4000-8000-000000000004', 'v1-user-a', 'À vista', 'Periodo trocado', 'Pix', NULL, -10.00, '2026-09-08', 'Despesa', '2026-06', NULL, NULL, true, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, '2026-09-08T12:00:00Z'),
  -- category.subcategory-type-mismatch (despesa category, subcategory under a receita parent)
  ('60000000-0000-4000-8000-000000000005', 'v1-user-a', 'À vista', 'Tipo cruzado', 'Pix', NULL, -10.00, '2026-01-13', 'Despesa', '2026-01', NULL, NULL, true, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', NULL, '2026-01-13T12:00:00Z'),
  -- marker.missing-target (invoice marker of a card that does not exist)
  ('60000000-0000-4000-8000-000000000006', 'v1-user-a', 'À vista', 'Pagamento fatura - Cartao Sumido', 'Pix', 'AUTO_FATURA:30000000-0000-4000-8000-0000000000ff:2026-02', -10.00, '2026-01-14', 'Despesa', '2026-01', NULL, NULL, true, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', NULL, '2026-01-14T12:00:00Z'),
  -- installment.inconsistent-members (members on different cards)
  ('60000000-0000-4000-8000-000000000010', 'v1-user-a', 'Parcelado', 'Fone', 'Cartão de crédito', NULL, -50.00, '2026-01-20', 'Despesa', '2026-02', 2, 1, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '2026-01-20T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000011', 'v1-user-a', 'Parcelado', 'Fone', 'Cartão de crédito', NULL, -50.00, '2026-02-20', 'Despesa', '2026-03', 2, 2, false, '30000000-0000-4000-8000-000000000002', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '2026-01-20T13:00:00Z'),
  -- installment.count-out-of-range (61 installments)
  ('60000000-0000-4000-8000-000000000012', 'v1-user-a', 'Parcelado', 'Sofa', 'Cartão de crédito', NULL, -10.00, '2026-01-20', 'Despesa', '2026-02', 61, 1, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', '2026-01-20T13:05:00Z'),
  -- installment.duplicate-number (number 1 twice)
  ('60000000-0000-4000-8000-000000000013', 'v1-user-a', 'Parcelado', 'Mesa', 'Cartão de crédito', NULL, -30.00, '2026-01-21', 'Despesa', '2026-02', 2, 1, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', '2026-01-21T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000014', 'v1-user-a', 'Parcelado', 'Mesa', 'Cartão de crédito', NULL, -30.00, '2026-01-21', 'Despesa', '2026-02', 2, 1, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', '2026-01-21T13:00:00Z'),
  ('60000000-0000-4000-8000-000000000015', 'v1-user-a', 'Parcelado', 'Mesa', 'Cartão de crédito', NULL, -30.00, '2026-02-21', 'Despesa', '2026-03', 2, 2, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', '2026-01-21T13:00:00Z'),
  -- recurrence.not-reproducible (card closing day 08, purchases on day 20 kept in their own month)
  ('60000000-0000-4000-8000-000000000020', 'v1-user-a', 'Recorrente', 'Revista', 'Cartão de crédito', NULL, -20.00, '2026-01-20', 'Despesa', '2026-01', NULL, NULL, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000021', 'v1-user-a', 'Recorrente', 'Revista', 'Cartão de crédito', NULL, -20.00, '2026-02-20', 'Despesa', '2026-02', NULL, NULL, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000022', 'v1-user-a', 'Recorrente', 'Revista', 'Cartão de crédito', NULL, -20.00, '2026-03-20', 'Despesa', '2026-03', NULL, NULL, false, '30000000-0000-4000-8000-000000000001', NULL, '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000011', '2026-01-01T14:00:00Z'),
  -- recurrence.duplicate-occurrence (two rows in February)
  ('60000000-0000-4000-8000-000000000030', 'v1-user-a', 'Recorrente', 'Clube', 'Pix', NULL, -40.00, '2026-01-15', 'Despesa', '2026-01', NULL, NULL, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000031', 'v1-user-a', 'Recorrente', 'Clube', 'Pix', NULL, -40.00, '2026-02-15', 'Despesa', '2026-02', NULL, NULL, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000032', 'v1-user-a', 'Recorrente', 'Clube', 'Pix', NULL, -40.00, '2026-02-20', 'Despesa', '2026-02', NULL, NULL, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', '2026-01-01T14:00:00Z'),
  ('60000000-0000-4000-8000-000000000033', 'v1-user-a', 'Recorrente', 'Clube', 'Pix', NULL, -40.00, '2026-03-15', 'Despesa', '2026-03', NULL, NULL, false, NULL, '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000012', '2026-01-01T14:00:00Z');

-- invoice.without-card (01); invoice.paid-without-date (02, paid with no payment marker)
INSERT INTO public.faturas (id, status_pagamento, periodo, created_at, user_id, cartao_id) VALUES
  ('70000000-0000-4000-8000-000000000001', 'pendente', '2026-02', '2026-02-01T09:00:00Z', 'v1-user-a', NULL),
  ('70000000-0000-4000-8000-000000000002', 'pago', '2026-05', '2026-05-01T09:00:00Z', 'v1-user-a', '30000000-0000-4000-8000-000000000001');

-- note.missing-title (01); note.blank-content (02)
INSERT INTO public.anotacoes (id, titulo, descricao, tipo, tasks, arquivada, created_at, user_id) VALUES
  ('80000000-0000-4000-8000-000000000001', NULL, 'Texto sem titulo', 'nota', NULL, false, '2026-01-05T09:00:00Z', 'v1-user-a'),
  ('80000000-0000-4000-8000-000000000002', 'Nota vazia', '   ', 'nota', NULL, false, '2026-01-06T09:00:00Z', 'v1-user-a');

-- inbox.missing-identity (01, blank text); inbox.non-positive-amount (02)
INSERT INTO public.pre_lancamentos (id, user_id, source_app, source_app_name, original_title, original_text, notification_timestamp, parsed_name, parsed_amount, status, lancamento_id, processed_at, discarded_at, created_at, updated_at) VALUES
  ('90000000-0000-4000-8000-000000000001', 'v1-user-a', 'com.example.bank', 'Banco Exemplo', 'Compra aprovada', '   ', '2026-03-02T10:00:00Z', 'Cafe', 10.00, 'pending', NULL, NULL, NULL, '2026-03-02T10:00:05Z', '2026-03-02T10:00:05Z'),
  ('90000000-0000-4000-8000-000000000002', 'v1-user-a', 'com.example.bank', 'Banco Exemplo', 'Estorno', 'Estorno de R$ 1,00 em Loja', '2026-03-03T10:00:00Z', 'Loja', -1.00, 'pending', NULL, NULL, NULL, '2026-03-03T10:00:05Z', '2026-03-03T10:00:05Z');

-- budget.without-category (01); budget.non-positive-amount (02)
INSERT INTO public.orcamentos (id, valor, periodo, created_at, user_id, categoria_id) VALUES
  ('a0000000-0000-4000-8000-000000000001', 100.00, '2026-03', '2026-02-25T09:00:00Z', 'v1-user-a', NULL),
  ('a0000000-0000-4000-8000-000000000002', 0.00, '2026-03', '2026-02-25T09:05:00Z', 'v1-user-a', '40000000-0000-4000-8000-000000000001');
