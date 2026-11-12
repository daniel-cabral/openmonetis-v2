import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import {
  ApplyReconciliationInputSchema,
  DetectReconciliationInputSchema,
  ReconciliationApplyResultSchema,
  ReconciliationBatchParamsSchema,
  ReconciliationDetectionSchema,
  ReconciliationFileBaseSchema,
  ReconciliationPreviewSchema,
} from "@openmonetis/validators/reconciliations";
import { ErrorResponseSchema as errorSchema, validationHook } from "../utils/openapi";
import type { ReconciliationsService } from "../services/reconciliations.service";
import type { ApiVariables } from "../types/context";

export function createReconciliationsRoute(service: ReconciliationsService) {
  const reconciliationsRoute = new OpenAPIHono<{ Variables: ApiVariables }>({
    defaultHook: validationHook,
  });

  reconciliationsRoute.openapi(
    createRoute({
      method: "post",
      path: "/detect",
      tags: ["Reconciliations"],
      request: {
        body: {
          required: true,
          content: { "application/json": { schema: DetectReconciliationInputSchema } },
        },
      },
      responses: {
        200: {
          description: "Import profile detected for the file and the suggested account",
          content: {
            "application/json": {
              schema: z.object({ data: ReconciliationDetectionSchema, error: z.null() }),
            },
          },
        },
        400: {
          description: "Invalid statement file",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) =>
      c.json(
        ok(await service.detectReconciliation(c.req.valid("json"), c.get("userId"))),
        200,
      ),
  );

  reconciliationsRoute.openapi(
    createRoute({
      method: "post",
      path: "/preview",
      tags: ["Reconciliations"],
      request: {
        body: {
          required: true,
          content: { "application/json": { schema: ReconciliationFileBaseSchema } },
        },
      },
      responses: {
        200: {
          description: "Statement lines classified against the app entries, nothing written",
          content: {
            "application/json": {
              schema: z.object({ data: ReconciliationPreviewSchema, error: z.null() }),
            },
          },
        },
        400: {
          description: "Invalid statement or missing invoice period",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Account or card not found",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) =>
      c.json(ok(await service.previewReconciliation(c.req.valid("json"), c.get("userId"))), 200),
  );

  reconciliationsRoute.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Reconciliations"],
      request: {
        body: {
          required: true,
          content: { "application/json": { schema: ApplyReconciliationInputSchema } },
        },
      },
      responses: {
        201: {
          description: "Applied the reviewed decisions as one undoable batch",
          content: {
            "application/json": {
              schema: z.object({ data: ReconciliationApplyResultSchema, error: z.null() }),
            },
          },
        },
        400: {
          description: "Nothing to apply, invalid decision, or paid invoice period",
          content: { "application/json": { schema: errorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Person, category, account or card not found",
          content: { "application/json": { schema: errorSchema } },
        },
        409: {
          description: "The file no longer matches the reviewed classification",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) =>
      c.json(ok(await service.applyReconciliation(c.req.valid("json"), c.get("userId"))), 201),
  );

  reconciliationsRoute.openapi(
    createRoute({
      method: "delete",
      path: "/{batchId}",
      tags: ["Reconciliations"],
      request: { params: ReconciliationBatchParamsSchema },
      responses: {
        200: {
          description: "Undid a reconciliation batch",
          content: {
            "application/json": {
              schema: z.object({
                data: z.object({ batchId: z.uuid(), undone: z.literal(true) }),
                error: z.null(),
              }),
            },
          },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: errorSchema } },
        },
        404: {
          description: "Reconciliation batch not found or already undone",
          content: { "application/json": { schema: errorSchema } },
        },
      },
    }),
    async (c) =>
      c.json(
        ok(await service.undoReconciliation(c.req.valid("param").batchId, c.get("userId"))),
        200,
      ),
  );

  return reconciliationsRoute;
}
