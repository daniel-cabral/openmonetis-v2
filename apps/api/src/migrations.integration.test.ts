import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { withIntegrationDatabase } from "./test-support/integration-database";

test("upgrading the previous release preserves financial data and incrementally migrates due-date rules", {
  skip: process.env.MIGRATIONS_INTEGRATION_TEST !== "1",
}, async (t) => {
  const source = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));
  const temporary = mkdtempSync(join(tmpdir(), "openmonetis-migrations-"));
  const journal = JSON.parse(readFileSync(join(source, "meta/_journal.json"), "utf8"));
  function history(last: number) {
    const directory = join(temporary, String(last));
    mkdirSync(join(directory, "meta"), { recursive: true });
    const entries = journal.entries.slice(0, last + 1);
    writeFileSync(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      copyFileSync(join(source, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
    return directory;
  }
  const previous = history(10);
  const intermediate = history(16);
  try {
    await withIntegrationDatabase(
      async () => {
        const { db, pool } = await import("@openmonetis/db");
        const ids = Object.fromEntries(
          [
            "user",
            "admin",
            "guest",
            "account",
            "category",
            "transaction",
            "series",
            "rule",
            "occurrence",
          ].map((key) => [key, randomUUID()]),
        );
        await pool.query('insert into "user" (id, name, email) values ($1, $2, $3)', [
          ids.user,
          "Legacy",
          "legacy@example.test",
        ]);
        await pool.query(
          "insert into people (id, user_id, name, role) values ($1, $2, 'Admin', 'admin'), ($3, $2, 'Guest', 'external')",
          [ids.admin, ids.user, ids.guest],
        );
        await pool.query(
          "insert into financial_accounts (id, user_id, name, type) values ($1, $2, 'Legacy account', 'checking')",
          [ids.account, ids.user],
        );
        await pool.query(
          "insert into categories (id, user_id, name, type) values ($1, $2, 'Legacy category', 'expense')",
          [ids.category, ids.user],
        );
        await pool.query(
          "insert into transactions (id, user_id, person_id, type, condition, payment_method, name, amount, purchase_date, period, account_id, category_id, is_settled) values ($1, $2, $3, 'expense', 'single', 'pix', 'Legacy expense', -10.01, '2020-01-10', '2020-01', $4, $5, true)",
          [ids.transaction, ids.user, ids.admin, ids.account, ids.category],
        );
        await pool.query(
          "insert into transaction_splits (user_id, transaction_id, person_id, amount) values ($1, $2, $3, -6), ($1, $2, $4, -4.01)",
          [ids.user, ids.transaction, ids.admin, ids.guest],
        );
        await pool.query("insert into recurring_transaction_series (id, user_id) values ($1, $2)", [
          ids.series,
          ids.user,
        ]);
        await pool.query(
          "insert into recurring_transaction_rules (id, user_id, series_id, person_id, type, payment_method, name, amount, start_date, anchor_date, frequency, account_id, category_id, is_settled) values ($1, $2, $3, $4, 'expense', 'pix', 'Legacy recurring', -12.34, '2020-01-31', '2020-01-31', 'monthly', $5, $6, false)",
          [ids.rule, ids.user, ids.series, ids.admin, ids.account, ids.category],
        );
        await pool.query(
          "insert into recurring_transaction_occurrences (id, user_id, recurring_rule_id, recurring_series_id, purchase_date, is_settled, account_id) values ($1, $2, $3, $4, '2020-01-31', true, $5)",
          [ids.occurrence, ids.user, ids.rule, ids.series, ids.account],
        );
        const oldRows = (
          await pool.query(
            "select id, user_id, person_id, amount, period, account_id, category_id, is_settled from transactions order by id",
          )
        ).rows;
        const oldSplits = (
          await pool.query(
            "select transaction_id, person_id, amount from transaction_splits order by person_id",
          )
        ).rows;
        await t.test(
          "migrations preserve monetary values, ownership and allocations without inventing historical settlement dates",
          async () => {
            await migrate(db, { migrationsFolder: intermediate });
            assert.deepEqual(
              (
                await pool.query(
                  "select id, user_id, person_id, amount, period, account_id, category_id, is_settled from transactions order by id",
                )
              ).rows,
              oldRows,
            );
            assert.deepEqual(
              (
                await pool.query(
                  "select transaction_id, person_id, amount from transaction_splits order by person_id",
                )
              ).rows,
              oldSplits,
            );
            const [row] = (
              await pool.query(
                "select settled_amount, settled_date from transactions where id=$1",
                [ids.transaction],
              )
            ).rows;
            assert.equal(row.settled_amount, null);
            assert.equal(row.settled_date, null);
            const [rule] = (
              await pool.query(
                "select amount, anchor_date::text, recurrence_end_date from recurring_transaction_rules where id=$1",
                [ids.rule],
              )
            ).rows;
            assert.equal(rule.amount, "-12.34");
            assert.equal(rule.anchor_date, "2020-01-31");
            assert.equal(rule.recurrence_end_date, null);
            assert.equal(
              (
                await pool.query(
                  "select is_settled from recurring_transaction_occurrences where id=$1",
                  [ids.occurrence],
                )
              ).rows[0].is_settled,
              true,
            );
          },
        );
        await t.test(
          "payable-target migration preserves calendar, selection, order and revision history",
          async () => {
            const calendar = {
              country: "BR",
              excludedNationalHolidays: [],
              additionalHolidays: ["2020-01-15"],
            };
            const rules = [
              {
                id: "selected",
                target: "boleto",
                adjustment: "previousBusinessDay",
                transactionIds: [ids.transaction],
              },
              { id: "invoice", target: "invoice", adjustment: "nextBusinessDay", cardIds: [] },
            ];
            await pool.query(
              "insert into due_date_rule_versions (user_id, revision, effective_from, calendar, rules) values ($1, 1, '2020-01-01', $2, $3)",
              [ids.user, JSON.stringify(calendar), JSON.stringify(rules)],
            );
            await migrate(db, { migrationsFolder: source });
            const [version] = (
              await pool.query(
                "select revision, calendar, rules from due_date_rule_versions where user_id=$1",
                [ids.user],
              )
            ).rows;
            assert.equal(version.revision, 1);
            assert.deepEqual(version.calendar, calendar);
            assert.deepEqual(version.rules, [{ ...rules[0], target: "payable" }, rules[1]]);
          },
        );
        await t.test(
          "reapplying migrations is idempotent and retains the full migration journal",
          async () => {
            const before = (
              await pool.query("select * from drizzle.__drizzle_migrations order by id")
            ).rows;
            assert.equal(before.length, journal.entries.length);
            await migrate(db, { migrationsFolder: source });
            assert.deepEqual(
              (await pool.query("select * from drizzle.__drizzle_migrations order by id")).rows,
              before,
            );
            assert.deepEqual(
              (
                await pool.query(
                  "select id, user_id, person_id, amount, period, account_id, category_id, is_settled from transactions order by id",
                )
              ).rows,
              oldRows,
            );
          },
        );
      },
      { migrationsFolder: previous },
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
