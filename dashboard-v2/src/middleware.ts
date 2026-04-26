import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const publicPages = ["/", "/login", "/signup", "/verify", "/forgot-password", "/reset-password", "/auth/continue", "/docs", "/privacy", "/status"]
  const isPublicPage = publicPages.includes(req.nextUrl.pathname)

  if (isPublicPage) {
    // If logged in and trying to access login/signup/verify, redirect to dashboard
    if (isLoggedIn && req.nextUrl.pathname !== "/") {
      return Response.redirect(new URL("/", req.nextUrl))
    }
    return undefined; // Let them access root or other public pages
  }

  if (!isLoggedIn) {
     return Response.redirect(new URL("/login", req.nextUrl))
  }
})

export const config = {
  matcher: ["/((?!api/auth|api/register|api/verify|api/password|_next/static|_next/image|favicon.ico|icon.png).*)"],
}
