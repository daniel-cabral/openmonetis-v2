import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import {
  CreateTripInputSchema,
  TripDetailOutputSchema,
  TripListItemOutputSchema,
  TripOutputSchema,
  TripParamsSchema,
  UpdateTripInputSchema,
} from "@openmonetis/validators/trips";
import type { TripsService } from "../services/trips.service";
import type { ApiVariables } from "../types/context";
import { errorResponse as error, validationHook } from "../utils/openapi";

const response = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema: z.object({ data: schema, error: z.null() }) } },
});

export function createTripsRoute(service: TripsService) {
  const route = new OpenAPIHono<{ Variables: ApiVariables }>({ defaultHook: validationHook });
  route.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Trips"],
      responses: {
        200: response(z.array(TripListItemOutputSchema), "List trips"),
        401: error("Authentication required"),
      },
    }),
    async (c) => c.json(ok(await service.list(c.get("userId"))), 200),
  );
  route.openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Trips"],
      request: {
        body: {
          required: true,
          content: { "application/json": { schema: CreateTripInputSchema } },
        },
      },
      responses: {
        201: response(TripOutputSchema, "Created trip"),
        400: error("Invalid request"),
        401: error("Authentication required"),
        409: error("Trip dates overlap another trip"),
      },
    }),
    async (c) => c.json(ok(await service.create(c.req.valid("json"), c.get("userId"))), 201),
  );
  route.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["Trips"],
      request: { params: TripParamsSchema },
      responses: {
        200: response(TripDetailOutputSchema, "Trip with cost summary and linked entries"),
        401: error("Authentication required"),
        404: error("Trip not found"),
      },
    }),
    async (c) => c.json(ok(await service.getDetail(c.req.valid("param").id, c.get("userId"))), 200),
  );
  route.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Trips"],
      request: {
        params: TripParamsSchema,
        body: {
          required: true,
          content: { "application/json": { schema: UpdateTripInputSchema } },
        },
      },
      responses: {
        200: response(TripOutputSchema, "Updated trip"),
        400: error("Invalid request"),
        401: error("Authentication required"),
        404: error("Trip not found"),
        409: error("Trip dates overlap another trip"),
      },
    }),
    async (c) =>
      c.json(
        ok(await service.update(c.req.valid("param").id, c.req.valid("json"), c.get("userId"))),
        200,
      ),
  );
  route.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["Trips"],
      request: { params: TripParamsSchema },
      responses: {
        200: response(z.object({ id: z.uuid() }), "Deleted trip; linked transactions are kept"),
        401: error("Authentication required"),
        404: error("Trip not found"),
      },
    }),
    async (c) => c.json(ok(await service.remove(c.req.valid("param").id, c.get("userId"))), 200),
  );
  return route;
}
