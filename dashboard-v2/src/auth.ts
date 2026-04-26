import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { authConfig } from "./auth.config"
import pg from "pg"

// Strip channel_binding which is unsupported by the pg Node.js library
const cleanDbUrl = (process.env.DATABASE_URL || '')
  .replace('&channel_binding=require', '')
  .replace('?channel_binding=require&', '?')
  .replace('?channel_binding=require', '')

const pool = new pg.Pool({
  connectionString: cleanDbUrl,
  ssl: { rejectUnauthorized: false },
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // NO adapter with JWT strategy - handle GitHub user creation in signIn callback
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // For GitHub OAuth: auto-create or find user in DB
      if (account?.provider === 'github' && user.email) {
        try {
          const client = await pool.connect();
          try {
            // Check if user exists
            const existing = await client.query(
              'SELECT id FROM users WHERE email = $1',
              [user.email]
            );
            if (existing.rows.length === 0) {
              // Create new user from GitHub
              await client.query(
                `INSERT INTO users (name, email, email_verified, image) 
                 VALUES ($1, $2, NOW(), $3) ON CONFLICT (email) DO NOTHING`,
                [user.name, user.email, user.image]
              );
            }
            // Get user id and attach to user object
            const userRow = await client.query('SELECT id FROM users WHERE email = $1', [user.email]);
            if (userRow.rows[0]) {
              user.id = userRow.rows[0].id.toString();
            }
          } finally {
            client.release();
          }
        } catch (err) {
          console.error('GitHub signIn DB error:', err);
          // Still allow sign in even if DB write fails
        }
      }
      return true;
    },
  },
})
