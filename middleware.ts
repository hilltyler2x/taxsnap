import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

// /native/* and the email connect/callback routes are also reached from the phone app's
// system browser, which has no session; those routes check who the user is themselves.
const isPublicRoute = createRouteMatcher([
  "/landing(.*)", "/explore(.*)", "/login(.*)", "/privacy(.*)", "/native(.*)", "/",
  "/api/email/connect(.*)", "/api/email/callback(.*)",
])
const isApiRoute = createRouteMatcher(["/api(.*)"])

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return
  if (isApiRoute(request)) {
    await auth.protect()
    return
  }
  await auth.protect({ unauthenticatedUrl: new URL("/login", request.url).toString() })
})

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
}