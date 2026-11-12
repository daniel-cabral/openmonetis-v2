import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import {
  EstablishmentsReportOutputSchema,
  ListEstablishmentsReportQuerySchema,
} from "@openmonetis/validators/establishments-report";
import type { EstablishmentsReportService } from "../services/establishments-report.service";
import type { ApiVariables } from "../types/context";
import { ErrorResponseSchema as ErrorSchema, validationHook } from "../utils/openapi";

const EstablishmentsReportResponseSchema = z.object({
  data: EstablishmentsReportOutputSchema,
  error: z.null(),
});

export function createEstablishmentsReportRoute(service: EstablishmentsReportService) {
  const route = new OpenAPIHono<{ Variables: ApiVariables }>({ defaultHook: validationHook });

  route.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Reports"],
      request: { query: ListEstablishmentsReportQuerySchema },
      responses: {
        200: {
          description: "Establishments ranked by purchases over a monthly window",
          content: { "application/json": { schema: EstablishmentsReportResponseSchema } },
        },
        400: {
          description: "Invalid report period, window or trip filter",
          content: { "application/json": { schema: ErrorSchema } },
        },
        401: {
          description: "Authentication required",
          content: { "application/json": { schema: ErrorSchema } },
        },
      },
    }),
    async (context) =>
      context.json(ok(await service.list(context.get("userId"), context.req.valid("query"))), 200),
  );

  return route;
}
