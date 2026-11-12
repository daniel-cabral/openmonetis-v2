import { createFileRoute } from "@tanstack/react-router";
import {
  buildRobotsTxt,
  isLandingPageEnabled,
} from "@/features/landing/landing.presentation";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const body = buildRobotsTxt(
          isLandingPageEnabled(process.env.LANDING_PAGE_ENABLED),
        );

        return new Response(body, {
          headers: {
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      },
    },
  },
});
