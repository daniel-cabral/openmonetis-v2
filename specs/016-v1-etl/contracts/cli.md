# CLI Contract: `etl:v1` (016)

Operator tool, fork-only. Entry `apps/api/src/scripts/v1-etl/cli.ts`, run from the repository root:

```bash
pnpm etl:v1 <command> [options]
# alias of: pnpm --filter @openmonetis/api etl:v1 (tsx --env-file-if-exists=../../.env)
```

## Commands

| Command | Reads | Writes | Purpose |
|---|---|---|---|
| `validate` | V1 | report files only | pre-flight findings and V1 counts (US1) |
| `load` | V1, target | target (`public` + `v1_etl`) | rehearsal load (US2, US4, US5, US6) |
| `reconcile` | V1, target | report files only | per-user V1 vs V2 figures (US3) |
| `rehearse` | V1, target | as `load` | `validate`, then `load` if no unresolved blocker, then `reconcile` |

## Options

| Option | Commands | Required | Meaning |
|---|---|---|---|
| `--v1-url <url>` | all | yes (or `V1_DATABASE_URL`) | V1 connection; opened read-only |
| `--target-url <url>` | load, reconcile, rehearse | yes | V2 scratch database; never read from `.env` implicitly |
| `--scratch` | load, rehearse | yes | operator states the target is a scratch database |
| `--confirm-production=<db name>` | load, rehearse | no | only way past the production guard; must equal the target database name (cutover is out of scope) |
| `--resolutions <file>` | load, rehearse | when blockers exist | operator resolution file ([data-model.md](../data-model.md)) |
| `--v1-rp-id <host>` | load, rehearse | no | V1 passkey relying-party host; passkeys load only when it equals the target `WEB_URL` host (otherwise informational, listed as not loaded) |
| `--out <dir>` | all | no | report directory; default `.v1-etl/<fingerprint 12 chars>/` |
| `--user <v1 user id>` | validate, reconcile | no | restrict to one user (diagnosis) |
| `--check-bucket` | validate | no | HEAD each attachment key in the configured S3 bucket; report missing files |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success: no blocker (validate), every user loaded (load), every figure passes (reconcile) |
| 1 | findings: unresolved blockers, a user failed and was rolled back, or a reconciliation mismatch |
| 2 | refused by a guard: non-scratch or production target, unmigrated target, foreign users, different dump fingerprint, resolution for another fingerprint, V1 equals target |
| 3 | usage or connection error |

## Guarantees

- V1: one `REPEATABLE READ READ ONLY` transaction per command, `default_transaction_read_only = on`.
- Target: one transaction per user; users sequential; pool size 1. The writer builds its own client
  from `--target-url` (never the `@openmonetis/db` singleton); `reconcile` refuses when the
  singleton's resolved URL differs from `--target-url`.
- No email, notification, Companion, AI or S3 write call. `--check-bucket` only issues HEAD requests.
- Stdout: the text summary; files: `<out>/<command>.json` and `<out>/<command>.txt`
  ([output-formats.md](output-formats.md)). No password hash, token, note text or file content in any output.
