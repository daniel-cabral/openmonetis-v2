import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtractedUser } from "../types";
import type { CatalogRefs } from "./catalog";
import { convertImportMappings } from "./side-data";

const SHARED_KEY = "chave-compartilhada";
const UPDATED_AT = new Date("2026-01-10T12:00:00.000Z");

function userWithMappings(v1UserId: string, v1CategoryId: string) {
  return {
    user: {
      id: v1UserId,
      name: "Usuario Sintetico",
      email: `${v1UserId}@example.test`,
      emailVerified: true,
      image: null,
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
    },
    categoryMappings: [
      {
        user_id: v1UserId,
        description_key: SHARED_KEY,
        category_id: v1CategoryId,
        subcategory_id: null,
        updated_at: UPDATED_AT,
      },
    ],
    nameMappings: [
      {
        user_id: v1UserId,
        description_key: SHARED_KEY,
        name: "Nome Sintetico",
        updated_at: UPDATED_AT,
      },
    ],
  } as Pick<ExtractedUser, "user" | "categoryMappings" | "nameMappings"> as ExtractedUser;
}

function refsFor(userId: string, categoryUuid: string, v1CategoryId: string): CatalogRefs {
  return {
    userId,
    adminPersonId: "00000000-0000-4000-8000-000000000002",
    personByPayer: new Map(),
    categoryByV1: new Map([[v1CategoryId, categoryUuid]]),
    childBySubcategory: new Map(),
    accountByV1: new Map(),
    cardByV1: new Map(),
    tripByV1: new Map(),
    systemCategory: () => "00000000-0000-4000-8000-000000000005",
  };
}

test("import mappings of two V1 users sharing a description_key get distinct id_map keys", () => {
  const first = convertImportMappings(
    userWithMappings("v1-user-a", "v1-category-a"),
    refsFor(
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000021",
      "v1-category-a",
    ),
    {},
  );
  const second = convertImportMappings(
    userWithMappings("v1-user-b", "v1-category-b"),
    refsFor(
      "00000000-0000-4000-8000-000000000012",
      "00000000-0000-4000-8000-000000000022",
      "v1-category-b",
    ),
    {},
  );

  const keys = [...first.idMap, ...second.idMap].map(
    (row) => `${row.v1Table}|${row.v1Id}|${row.role}`,
  );
  assert.equal(keys.length, 4);
  assert.equal(new Set(keys).size, 4);
});
