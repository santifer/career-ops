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
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Note: For Edge compatibility, we use a separate fetch or 
        // a subset of DB logic if required. For now, this is Node-compatible.
        const pg = require("pg");
        const pool = new pg.Pool({ 
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
        });
        const bcrypt = require("bcryptjs");

        try {
          const res = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [credentials.email]);
          const user = res.rows[0];

          if (user && user.password) {
            if (!user.email_verified && credentials.email !== "admin@career-ops.local") {
              throw new Error("Please verify your email before logging in.");
            }
            const isMatch = await bcrypt.compare(credentials.password, user.password);
            if (isMatch) {
              return { id: user.id.toString(), name: user.name, email: user.email };
            }
          }
          
          // Legacy Admin Fallback (Optional)
          if (credentials.email === "admin@career-ops.local" && credentials.password === "career2026") {
            return { id: "1", name: "Admin", email: "admin@career-ops.local" };
          }

          return null;
        } catch (error) {
          console.error("Auth Error:", error);
          return null;
        } finally {
          await pool.end();
        }
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
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET,
} satisfies NextAuthConfig;
