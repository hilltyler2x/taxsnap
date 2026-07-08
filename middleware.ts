import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isPublicRoute = createRouteMatcher(["/landing(.*)", "/explore(.*)", "/login(.*)", "/"])
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