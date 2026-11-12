import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import {
  SpendingOverviewOutputSchema,
  SpendingOverviewQuerySchema,
} from "@openmonetis/validators/spending-overview";
import type { SpendingOverviewService } from "../services/spending-overview.service";
import type { ApiVariables } from "../types/context";
import { ErrorResponseSchema as ErrorSchema, validationHook } from "../utils/openapi";

const SpendingOverviewResponseSchema = z.object({
  data: SpendingOverviewOutputSchema,
  error: z.null(),
});

export function createSpendingOverviewRoute(service: SpendingOverviewService) {
  const route = new OpenAPIHono<{ Variables: ApiVariables }>({ defaultHook: validationHook });

  route.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Dashboard"],
      request: { query: SpendingOverviewQuerySchema },
      responses: {
        200: {
          description: "Largest expenses and most frequent establishments for a monthly period",
          content: { "application/json": { schema: SpendingOverviewResponseSchema } },
        },
        400: {
          description: "Invalid report period",
          content: { "application/json": { schema: ErrorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: ErrorSchema } },
        },
      },
    }),
    async (context) =>
      context.json(
        ok(await service.getSpendingOverview(context.get("userId"), context.req.valid("query"))),
        200,
      ),
  );

  return route;
}
