import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import {
  DetectReconciliationInputSchema,
  ReconciliationDetectionSchema,
  ReconciliationFileInputSchema,
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
          content: { "application/json": { schema: ReconciliationFileInputSchema } },
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

  return reconciliationsRoute;
}
