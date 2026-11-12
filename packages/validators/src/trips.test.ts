import assert from "node:assert/strict";
import test from "node:test";
import { CreateTripInputSchema } from "./trips";

const validTrip = { name: "  Lisboa  ", startDate: "2026-05-12", endDate: "2026-05-12", note: "" };

test("trip input normalises name and note and rejects invalid trips with their field", () => {
  const parsed = CreateTripInputSchema.parse(validTrip);
  assert.equal(parsed.name, "Lisboa");
  assert.equal(parsed.note, null);

  const cases = [
    [{ endDate: "2026-05-11" }, "endDate"],
    [{ startDate: "2026-02-31", endDate: "2026-03-01" }, "startDate"],
    [{ startDate: "22/05/2026" }, "startDate"],
    [{ name: "   " }, "name"],
    [{ name: "a".repeat(61) }, "name"],
    [{ note: "a".repeat(501) }, "note"],
  ] as const;
  for (const [patch, field] of cases) {
    const result = CreateTripInputSchema.safeParse({ ...validTrip, ...patch });
    assert.equal(result.success, false, JSON.stringify(patch));
    if (!result.success)
      assert.equal(result.error.issues[0]?.path[0], field, JSON.stringify(patch));
  }
});
