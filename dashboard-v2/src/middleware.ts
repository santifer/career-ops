import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const publicPages = ["/login", "/signup", "/verify"]
  const isPublicPage = publicPages.includes(req.nextUrl.pathname)

  if (isPublicPage) {
    if (isLoggedIn) {
      return Response.redirect(new URL("/", req.nextUrl))
    }
    return undefined; // Do nothing, let them access public pages
  }

  if (!isLoggedIn) {
     return Response.redirect(new URL("/login", req.nextUrl))
  }
})

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.png).*)"],
}
