# Anexos em anotações

Anotações do tipo texto aceitam anexos PDF e imagem (JPEG, PNG, WebP), com o mesmo limite de
tamanho, a mesma validação de conteúdo e o mesmo armazenamento privado usados nos anexos de
lançamentos. Checklists e tarefas não aceitam anexos.

## Contrato da API

Todas as rotas exigem sessão e respondem com `Cache-Control: private, no-store`.

| Método | Caminho | Resultado |
| --- | --- | --- |
| POST | `/attachments/note/prepare` | `{ uploadId, uploadUrl }` |
| POST | `/attachments/note/confirm` | `AttachmentOutput` (201) |
| GET | `/attachments/note/{noteId}` | Lista de anexos, do mais antigo para o mais novo |
| DELETE | `/attachments/note/{noteId}/{attachmentId}` | `{ id, noteId, deleted }` |

O download continua em `GET /attachments/{id}/download-url`.

Erros: `note_not_found` (404, inclusive para notas de outro usuário), `note_attachments_not_allowed`
(400, nota que não é de texto), `attachment_upload_not_found` (404), além dos códigos de validação
já usados nos lançamentos.

`GET /notes` e `GET /notes/{id}` retornam `attachmentCount`, que conta somente anexos confirmados.

## Regras

- Um anexo pertence a um único pai: um lançamento ou uma anotação. A tabela `note_attachments` tem
  `attachment_id` único; confirmar um anexo de lançamento em uma nota (ou o inverso) é recusado.
- Trocar o tipo de uma nota ou arquivá-la mantém os anexos. Adicionar exige nota de texto ativa no
  tipo texto; remover e listar exigem apenas ownership.
- A biblioteca de anexos (`GET /attachments` e `/attachments/summary`) mostra somente anexos de
  lançamentos.
- Excluir um lançamento não remove anexos de notas: todas as varreduras de órfãos ignoram vínculos
  de nota.
- Excluir uma nota remove os vínculos por cascata e executa a limpeza de órfãos, que apaga os
  objetos no armazenamento.

## Banco de dados

Migration `0035_note_attachments`: nova tabela `note_attachments` com chave primária composta
`(note_id, attachment_id)`, índice único em `attachment_id`, índice em `user_id` e chaves estrangeiras
compostas com `user_id` (cascade), que impedem vínculos entre usuários.

## Testes

- `pnpm test:note-attachments:integration` cobre o fluxo HTTP, o banco e o armazenamento S3 (requer o
  mock S3 de `compose.test.yml`).
- `packages/domain/src/notes.test.ts` cobre a regra `canAttachToNote`.
