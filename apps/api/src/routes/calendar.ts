import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import { CalendarOutputSchema, CalendarQuerySchema } from "@openmonetis/validators/calendar";
import type { CalendarService } from "../services/calendar.service";
import type { ApiVariables } from "../types/context";
import { ErrorResponseSchema as ErrorSchema, validationHook } from "../utils/openapi";

const CalendarResponseSchema = z.object({
  data: CalendarOutputSchema,
  error: z.null(),
});

export function createCalendarRoute(service: CalendarService) {
  const route = new OpenAPIHono<{ Variables: ApiVariables }>({ defaultHook: validationHook });

  route.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Calendar"],
      request: { query: CalendarQuerySchema },
      responses: {
        200: {
          description: "Money events of the month grouped by day",
          content: { "application/json": { schema: CalendarResponseSchema } },
        },
        400: {
          description: "Invalid calendar period",
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
        ok(await service.getMonth(context.get("userId"), context.req.valid("query").period)),
        200,
      ),
  );

  return route;
}
