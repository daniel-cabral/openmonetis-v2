import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import {
  hasSessionCookie,
  isLandingPageEnabled,
} from "@/features/landing/landing.presentation";

export const getLandingSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();

    return {
      enabled: isLandingPageEnabled(process.env.LANDING_PAGE_ENABLED),
      origin: new URL(request.url).origin,
      hasSessionCookie: hasSessionCookie(getRequestHeader("cookie")),
    };
  },
);
