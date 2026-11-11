import assert from "node:assert/strict";
import test from "node:test";
import type { TripListItemOutput } from "@openmonetis/validators/trips";
import { ApiClientError } from "../../lib/api-client";
import { getTripErrorMessage } from "./trips.presentation";

const cachedLisboa: TripListItemOutput = {
  id: "7d1f0c4e-2b8a-4f6e-9a3d-1c2b3a4d5e6f",
  name: "Lisboa",
  startDate: "2026-05-12",
  endDate: "2026-05-22",
  note: null,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  linkedCount: 0,
  netCost: 0,
};

test("trip save errors map to PT-BR messages", () => {
  const draft = { startDate: "2026-05-20", endDate: "2026-05-25" };
  const cases = [
    {
      error: new ApiClientError("Trip dates overlap another trip", "TRIP_OVERLAP", 409),
      expected: 'As datas se sobrepõem à viagem "Lisboa" (12/05/2026 a 22/05/2026).',
    },
    {
      error: new ApiClientError("Internal error", "INTERNAL_ERROR", 500),
      expected: "Não foi possível salvar a viagem.",
    },
  ];

  for (const { error, expected } of cases) {
    assert.equal(getTripErrorMessage(error, [cachedLisboa], draft), expected);
  }
});
