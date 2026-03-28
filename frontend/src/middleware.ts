import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/:locale(pt|en|es)",
  "/:locale(pt|en|es)/privacy(.*)",
  "/:locale(pt|en|es)/terms(.*)",
  "/:locale(pt|en|es)/dpa(.*)",
  "/:locale(pt|en|es)/docs(.*)",
  "/:locale(pt|en|es)/pricing(.*)",
  "/:locale(pt|en|es)/accept-invite(.*)",
]);

const isAuthPage = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  // sign-in/sign-up are outside locale routing — don't run intl middleware
  if (isAuthPage(req)) {
    return;
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
