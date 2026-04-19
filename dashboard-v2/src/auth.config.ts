import GitHub from "next-auth/providers/github"
import Credentials from "next-auth/providers/credentials"
import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    Credentials({
      name: "Admin Backdoor (Dev Only)",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@career-ops.local" },
        password: { label: "Password", type: "password", placeholder: "career2026" }
      },
      async authorize(credentials) {
        // This is a placeholder for the edge-compatible config
        // The actual verification happens in the full auth.ts which has DB access
        if (credentials.email === "admin@career-ops.local" && credentials.password === "career2026") {
          return { id: "1", name: "Admin", email: "admin@career-ops.local" };
        }
        return null;
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    }
  },
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
} satisfies NextAuthConfig;
