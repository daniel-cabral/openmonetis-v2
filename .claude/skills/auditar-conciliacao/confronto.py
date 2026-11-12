#!/usr/bin/env python3
"""Compare OpenMonetis account transactions with a C6 bank statement, by value and name.

    python confronto.py <app-export.csv> <c6-statement.csv> <MM/YYYY>

App export: Transações, filter the account and the period, Exportar, CSV
(GET /transactions/export?format=csv). The export has no Data Contábil column:
the bank side is filtered by Data Contábil in MM/YYYY, the app side is taken as
exported, and the dates printed for the app side are Data da baixa (or Data).

The script matches by value and count only to show candidates. The decision is
always made by name AND value, because repeated values in one month are normal.

Output: totals on both sides, the app outflows with no bank counterpart, and the
bank outflows with no app counterpart.
"""

import csv
import io
import re
import sys
from collections import Counter

NAME_FORMULA_GUARD = re.compile(r"^'(?=[\s=+\-@\t\r\n])")


def parse_app_money(raw):
    """'-1234,56' -> -1234.56, or None when the cell is not a value.

    The app export uses a decimal comma and no thousands separator. The regex
    keeps only the characters a number can contain, so stray spaces are harmless.
    """
    text = re.sub(r"[^0-9,.\-]", "", raw or "").replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def clean_name(raw):
    """Drop the apostrophe the export adds before cells that start like a formula."""
    return NAME_FORMULA_GUARD.sub("", (raw or "").strip())


def read_app(path):
    """App export: returns outflows by value, rows by value, total out and total in."""
    outflows, rows_by_value = Counter(), {}
    total_out, total_in = 0.0, 0.0
    with io.open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            value = parse_app_money(row.get("Valor (R$)"))
            if value is None:
                continue
            if value < 0:
                key = round(-value, 2)
                total_out += -value
                outflows[key] += 1
                date = row.get("Data da baixa") or row.get("Data", "")
                rows_by_value.setdefault(key, []).append(
                    (date, clean_name(row.get("Descrição")), row.get("Situação", ""))
                )
            else:
                total_in += value
    return outflows, rows_by_value, total_out, total_in


def read_bank(path, month):
    """C6 statement (','), keeping the rows whose Data Contábil is in MM/YYYY."""
    outflows, rows_by_value = Counter(), {}
    total_out, total_in = 0.0, 0.0
    with io.open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f, delimiter=","):
            if len(row) < 7 or row[1][3:] != month:
                continue
            try:
                inflow, outflow = float(row[4] or 0), float(row[5] or 0)
            except ValueError:
                continue  # bank header or footer line
            if outflow:
                key = round(outflow, 2)
                total_out += outflow
                outflows[key] += 1
                name = " - ".join(part for part in (row[2].strip(), row[3].strip()) if part)
                rows_by_value.setdefault(key, []).append((row[1], name, ""))
            total_in += inflow
    return outflows, rows_by_value, total_out, total_in


def show(title, diff, rows_by_value):
    print(f"\n=== {title} ===")
    total = 0.0
    for value, count in sorted(diff.items(), key=lambda item: -item[0] * item[1]):
        total += value * count
        for date, name, note in rows_by_value.get(value, [])[:count]:
            suffix = f"  [{note}]" if note else ""
            print(f"  R$ {value:>10.2f}  {date}  {name[:60]}{suffix}")
    print(f"  TOTAL: R$ {total:.2f}")
    return total


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 1
    app_csv, statement_csv, month = sys.argv[1:4]

    app_out, app_rows, app_total_out, app_total_in = read_app(app_csv)
    bank_out, bank_rows, bank_total_out, bank_total_in = read_bank(statement_csv, month)

    print(f"APP   {month}: entradas {app_total_in:>11.2f} | saídas {app_total_out:>11.2f}")
    print(f"BANCO {month}: entradas {bank_total_in:>11.2f} | saídas {bank_total_out:>11.2f}")
    print(f"diferença de entradas: {app_total_in - bank_total_in:>11.2f}")
    print(f"diferença de saídas:   {app_total_out - bank_total_out:>11.2f}")

    app_extra = show("SAÍDAS no APP sem contrapartida no BANCO", app_out - bank_out, app_rows)
    bank_extra = show("SAÍDAS no BANCO sem contrapartida no APP", bank_out - app_out, bank_rows)
    print(f"\nlíquido (sobra - falta): R$ {app_extra - bank_extra:.2f}")
    print("\n'Em aberto' no APP é esperado não existir no banco ainda.")
    print("Confira cada linha por NOME antes de concluir: valores repetidos")
    print("no mês são normais e o casamento por valor pode apontar o par errado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
