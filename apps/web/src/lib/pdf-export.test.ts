import assert from "node:assert/strict";
import test from "node:test";
import { buildBrandedPdf } from "./pdf-export";

test("branded PDF spans pages for long tables and renders without logos", async () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({
    cells: [{ text: `Lançamento ${index + 1}` }, { text: "R$ 10,00" }],
  }));

  const { blob, pageCount } = await buildBrandedPdf({
    title: "Lançamentos",
    periodLabel: "outubro 2026",
    generatedAt: "12/11/2026",
    branding: { color: [201, 106, 58], logos: null },
    columns: [{ header: "Nome" }, { header: "Valor", align: "right" }],
    rows,
  });

  assert.equal(await blob.slice(0, 4).text(), "%PDF");
  assert.ok(pageCount > 1);
});
