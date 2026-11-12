import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import {
  CardUsageReportOutputSchema,
  ListCardUsageReportQuerySchema,
} from "@openmonetis/validators/card-usage-report";
import type { CardUsageReportService } from "../services/card-usage-report.service";
import type { ApiVariables } from "../types/context";
import { ErrorResponseSchema as ErrorSchema, validationHook } from "../utils/openapi";

const CardUsageReportResponseSchema = z.object({
  data: CardUsageReportOutputSchema,
  error: z.null(),
});

export function createCardUsageReportRoute(service: CardUsageReportService) {
  const route = new OpenAPIHono<{ Variables: ApiVariables }>({ defaultHook: validationHook });

  route.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Reports"],
      request: { query: ListCardUsageReportQuerySchema },
      responses: {
        200: {
          description: "Monthly limit usage of active cards, with the selected card's detail",
          content: { "application/json": { schema: CardUsageReportResponseSchema } },
        },
        400: {
          description: "Invalid report period or card",
          content: { "application/json": { schema: ErrorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: ErrorSchema } },
        },
      },
    }),
    async (context) =>
      context.json(ok(await service.get(context.get("userId"), context.req.valid("query"))), 200),
  );

  return route;
}
