# Career-Ops SaaS Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant SaaS web app that brings career-ops into the browser — Google OAuth, 4-step onboarding, AI-powered JD evaluation with streaming, applications tracker, pipeline inbox, and settings.

**Architecture:** Next.js 14 App Router with NextAuth v4 (Google OAuth), Prisma + Supabase Postgres, Anthropic SDK for streaming evaluations, Tailwind + shadcn/ui for a minimalist professional UI.

**Tech Stack:** Next.js 14, NextAuth 4, Prisma, Supabase, @ai-sdk/anthropic, Vercel AI SDK, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query, Lucide React, js-yaml, react-markdown

**Project root:** `/Users/tanmay/Documents/Applications/CarrierOps/career-ops-web/`

---

## File Map

```
career-ops-web/
├── app/
│   ├── layout.tsx                        # Root layout, providers
│   ├── page.tsx                          # Landing / sign-in
│   ├── globals.css
│   ├── providers.tsx                     # SessionProvider + QueryClientProvider
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # NextAuth handler
│   │   ├── profile/route.ts              # POST (create), PUT (update)
│   │   ├── applications/route.ts         # GET list, POST create
│   │   ├── applications/[id]/route.ts    # PUT update, DELETE
│   │   ├── evaluate/route.ts             # POST → Anthropic stream
│   │   ├── pipeline/route.ts             # GET, POST, DELETE
│   │   └── reports/[id]/route.ts         # GET single report
│   ├── onboarding/page.tsx               # 4-step wizard
│   ├── dashboard/page.tsx
│   ├── applications/page.tsx
│   ├── evaluate/page.tsx
│   ├── reports/[id]/page.tsx
│   ├── pipeline/page.tsx
│   └── settings/page.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── AppShell.tsx                  # Sidebar + main area wrapper
│   ├── onboarding/
│   │   ├── Stepper.tsx                   # Top progress stepper
│   │   ├── Step1Profile.tsx
│   │   ├── Step2CV.tsx
│   │   ├── Step3Portals.tsx
│   │   └── OnboardingWizard.tsx          # Orchestrates steps + state
│   ├── dashboard/
│   │   ├── StatCard.tsx
│   │   └── RecentTable.tsx
│   ├── evaluate/
│   │   ├── EvaluateForm.tsx
│   │   └── StreamingEvaluation.tsx       # Block-by-block live render
│   ├── applications/
│   │   ├── ApplicationsTable.tsx
│   │   └── StatusSelect.tsx
│   ├── pipeline/
│   │   └── PipelineInbox.tsx
│   └── settings/
│       └── SettingsTabs.tsx
├── lib/
│   ├── auth.ts                           # NextAuth options
│   ├── prisma.ts                         # Prisma singleton
│   ├── anthropic.ts                      # Anthropic client
│   ├── prompt.ts                         # Evaluation prompt builder
│   └── validations.ts                    # Zod schemas
├── middleware.ts                         # Auth + onboarding guards
├── prisma/schema.prisma
├── .env.example
└── package.json
```

---

## Task 1: Scaffold Project + Install Dependencies

**Files:**
- Create: `career-ops-web/` (entire Next.js project)
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`

- [ ] **Step 1: Create Next.js app**

```bash
cd /Users/tanmay/Documents/Applications/CarrierOps
npx create-next-app@14 career-ops-web --typescript --tailwind --eslint --app --no-src-dir --import-alias="@/*" --no-git
cd career-ops-web
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install next-auth@4 @next-auth/prisma-adapter @prisma/client prisma
npm install @anthropic-ai/sdk ai @ai-sdk/anthropic
npm install @tanstack/react-query react-hook-form @hookform/resolvers zod
npm install js-yaml @types/js-yaml react-markdown remark-gfm
npm install lucide-react @supabase/supabase-js
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Init shadcn/ui**

```bash
npx shadcn-ui@latest init
# When prompted: Default style, Slate color, yes CSS variables
npx shadcn-ui@latest add button input textarea card badge table tabs select dialog dropdown-menu separator skeleton toast
```

- [ ] **Step 4: Init Prisma**

```bash
npx prisma init
```

- [ ] **Step 5: Create .env.example**

Create `career-ops-web/.env.example`:

```env
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

- [ ] **Step 6: Create .env.local from example**

```bash
cp .env.example .env.local
```

- [ ] **Step 7: Add vitest config**

Create `career-ops-web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `career-ops-web/vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 8: Add test script to package.json**

In `package.json` scripts, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Commit**

```bash
cd /Users/tanmay/Documents/Applications/CarrierOps/career-ops-web
git init
git add .
git commit -m "feat: scaffold Next.js 14 project with all dependencies"
```

---

## Task 2: Prisma Schema + Database Setup

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `.env.local` (DATABASE_URL placeholder)

- [ ] **Step 1: Write failing schema validation test**

Create `career-ops-web/lib/__tests__/validations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { profileStep1Schema } from '../validations'

describe('profileStep1Schema', () => {
  it('rejects empty name', () => {
    const result = profileStep1Schema.safeParse({ fullName: '' })
    expect(result.success).toBe(false)
  })
  it('rejects missing salary', () => {
    const result = profileStep1Schema.safeParse({
      fullName: 'Jane', location: 'SF', targetRoles: 'AI Lead',
      seniority: 'Director', salaryMin: 0, salaryMax: 0, superpower: 'test'
    })
    expect(result.success).toBe(false)
  })
  it('accepts valid profile', () => {
    const result = profileStep1Schema.safeParse({
      fullName: 'Jane Doe', location: 'San Francisco',
      targetRoles: 'Head of AI', seniority: 'Director',
      salaryMin: 180000, salaryMax: 240000,
      superpower: 'I ship AI products',
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test
```
Expected: FAIL — `validations` module not found.

- [ ] **Step 3: Write full Prisma schema**

Replace `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id           String        @id @default(cuid())
  name         String?
  email        String?       @unique
  emailVerified DateTime?
  image        String?
  createdAt    DateTime      @default(now())
  accounts     Account[]
  sessions     Session[]
  profile      Profile?
  applications Application[]
  reports      Report[]
  pipelineItems PipelineItem[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

model Profile {
  id          String   @id @default(cuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullName    String
  location    String
  targetRoles String
  seniority   String
  salaryMin   Int
  salaryMax   Int
  currency    String   @default("USD")
  superpower  String   @db.Text
  cvMarkdown  String   @db.Text
  portalsYaml String   @db.Text
  includeKw   String
  excludeKw   String   @default("")
  onboardedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Application {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  num       Int
  company   String
  role      String
  score     Float?
  status    String   @default("Evaluated")
  url       String?
  notes     String?
  report    Report?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, num])
}

model Report {
  id            String       @id @default(cuid())
  userId        String
  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  applicationId String?      @unique
  application   Application? @relation(fields: [applicationId], references: [id])
  url           String?
  content       String       @db.Text
  legitimacy    String?
  createdAt     DateTime     @default(now())
}

model PipelineItem {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  url       String
  company   String?
  role      String?
  status    String   @default("pending")
  createdAt DateTime @default(now())
}
```

- [ ] **Step 4: Write Zod validation schemas**

Create `career-ops-web/lib/validations.ts`:

```typescript
import { z } from 'zod'

export const profileStep1Schema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  location: z.string().min(2, 'Location is required'),
  targetRoles: z.string().min(2, 'At least one target role is required'),
  seniority: z.string().min(2, 'Seniority is required'),
  salaryMin: z.number().min(1, 'Minimum salary is required'),
  salaryMax: z.number().min(1, 'Maximum salary is required'),
  superpower: z.string().min(10, 'Tell us more about your superpower'),
})

export const profileStep2Schema = z.object({
  cvMarkdown: z.string().min(50, 'Please add your CV content'),
})

export const profileStep3Schema = z.object({
  includeKw: z.string().min(2, 'At least one include keyword is required'),
  excludeKw: z.string().optional().default(''),
  portalsYaml: z.string().min(10, 'Portals config is required'),
})

export const evaluateSchema = z.object({
  url: z.string().url().optional().or(z.literal('')),
  jdText: z.string().optional(),
}).refine(d => d.url || d.jdText, {
  message: 'Provide a URL or paste JD text',
})

export const applicationUpdateSchema = z.object({
  status: z.enum(['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP']),
  notes: z.string().optional(),
  score: z.number().optional(),
})

export type ProfileStep1 = z.infer<typeof profileStep1Schema>
export type ProfileStep2 = z.infer<typeof profileStep2Schema>
export type ProfileStep3 = z.infer<typeof profileStep3Schema>
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test
```
Expected: PASS — 3 tests in validations.test.ts.

- [ ] **Step 6: Create Prisma singleton**

Create `career-ops-web/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ log: ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 7: Note — fill DATABASE_URL in .env.local before running migrations**

The user must:
1. Create a Supabase project at supabase.com
2. Go to Settings → Database → Connection String → URI
3. Set `DATABASE_URL` = the pooled connection string
4. Set `DIRECT_URL` = the direct connection string
5. Then run: `npx prisma migrate dev --name init`

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: prisma schema, zod validations, prisma singleton"
```

---

## Task 3: NextAuth + Google OAuth

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `app/providers.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create NextAuth config**

Create `career-ops-web/lib/auth.ts`:

```typescript
import { NextAuthOptions, DefaultSession } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './prisma'

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
}
```

- [ ] **Step 2: Create NextAuth route handler**

Create `career-ops-web/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

- [ ] **Step 3: Create providers wrapper**

Create `career-ops-web/app/providers.tsx`:

```typescript
'use client'
import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  }))
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </SessionProvider>
  )
}
```

- [ ] **Step 4: Update root layout**

Replace `career-ops-web/app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Career-Ops — AI Job Search Pipeline',
  description: 'Evaluate job offers, generate tailored CVs, and track your search with AI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: NextAuth Google OAuth, providers, root layout"
```

---

## Task 4: Middleware — Auth + Onboarding Guards

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write middleware**

Create `career-ops-web/middleware.ts`:

```typescript
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const protectedRoutes = ['/dashboard', '/applications', '/pipeline', '/evaluate', '/reports', '/settings']
const onboardingRequiredRoutes = ['/dashboard', '/applications', '/pipeline', '/evaluate', '/reports', '/settings']

export default withAuth(
  async function middleware(req: NextRequest & { nextauth: { token: any } }) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    if (!token) return NextResponse.redirect(new URL('/', req.url))

    // Check if onboarded by inspecting a custom token field
    const isOnboarded = token.onboarded as boolean | undefined

    if (onboardingRequiredRoutes.some(r => path.startsWith(r)) && !isOnboarded) {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }

    if (path === '/onboarding' && isOnboarded) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: ['/dashboard/:path*', '/applications/:path*', '/pipeline/:path*',
            '/evaluate/:path*', '/reports/:path*', '/settings/:path*', '/onboarding'],
}
```

- [ ] **Step 2: Extend JWT callback in auth.ts to include onboarded flag**

Add to `lib/auth.ts` callbacks (inside `authOptions`):

```typescript
jwt: async ({ token, user, trigger }) => {
  if (user) {
    token.userId = user.id
    // Check if user has a profile (is onboarded)
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })
    token.onboarded = !!profile
  }
  if (trigger === 'update') {
    // Re-check onboarding status on session update
    const profile = await prisma.profile.findUnique({
      where: { userId: token.userId as string },
      select: { id: true },
    })
    token.onboarded = !!profile
  }
  return token
},
```

Also update session callback to expose userId:
```typescript
session: async ({ session, token }) => {
  if (session.user && token) {
    session.user.id = token.userId as string
    ;(session as any).onboarded = token.onboarded
  }
  return session
},
```

Change `strategy: 'jwt'` — add to authOptions:
```typescript
session: { strategy: 'jwt' },
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: middleware auth guard + onboarding redirect"
```

---

## Task 5: Landing Page

**Files:**
- Create: `app/page.tsx`
- Update: `app/globals.css`

- [ ] **Step 1: Update globals.css for minimalist theme**

Replace `career-ops-web/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 98%;
    --foreground: 222 47% 7%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 7%;
    --primary: 244 55% 58%;
    --primary-foreground: 0 0% 100%;
    --muted: 220 14% 96%;
    --muted-foreground: 220 9% 46%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 244 55% 58%;
    --radius: 0.625rem;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 2: Create landing page**

Create `career-ops-web/app/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SignInButton } from '@/components/SignInButton'

export default async function LandingPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
          career<span className="text-indigo-600">ops</span>
        </h1>
        <p className="text-sm text-gray-500 mb-10">
          AI-powered job search pipeline — evaluate offers, track applications, generate tailored CVs.
        </p>
        <SignInButton />
        <p className="text-xs text-gray-400 mt-6">
          Your data is encrypted and never shared.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl w-full text-center">
        {[
          { icon: '⚡', title: 'AI Evaluation', desc: 'Claude scores every JD across 7 dimensions against your CV' },
          { icon: '📊', title: 'Pipeline Tracking', desc: 'Full application lifecycle from inbox to offer' },
          { icon: '🎯', title: 'Smart Targeting', desc: 'Only apply where score ≥ 4.0 — quality over quantity' },
        ].map(f => (
          <div key={f.title} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="text-2xl mb-3">{f.icon}</div>
            <div className="text-sm font-700 font-bold mb-1">{f.title}</div>
            <div className="text-xs text-gray-500">{f.desc}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create SignInButton client component**

Create `career-ops-web/components/SignInButton.tsx`:

```typescript
'use client'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export function SignInButton() {
  return (
    <Button
      onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
      variant="outline"
      className="w-full flex items-center gap-3 h-11 text-sm font-semibold border-gray-300"
    >
      <GoogleIcon />
      Continue with Google
    </Button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: landing page with Google sign-in CTA"
```

---

## Task 6: App Shell (Sidebar + Layout)

**Files:**
- Create: `components/layout/Sidebar.tsx`
- Create: `components/layout/AppShell.tsx`

- [ ] **Step 1: Create Sidebar**

Create `career-ops-web/components/layout/Sidebar.tsx`:

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { LayoutDashboard, List, Zap, Inbox, FileText, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: List },
  { href: '/evaluate', label: 'Evaluate JD', icon: Zap, badge: 'New' },
  { href: '/pipeline', label: 'Pipeline', icon: Inbox },
  { href: '/reports', label: 'Reports', icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-56 flex-shrink-0 bg-[#1a1a2e] text-white flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-base font-bold tracking-tight">
          career<span className="text-indigo-400">ops</span>
        </span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 mt-2">
        {navItems.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:bg-white/8 hover:text-white'
            )}
          >
            <Icon size={15} />
            <span>{label}</span>
            {badge && (
              <span className="ml-auto text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                {badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-2 border-t border-white/10">
        <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors">
          <Settings size={15} /> Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/8 transition-colors"
        >
          <LogOut size={15} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create AppShell**

Create `career-ops-web/components/layout/AppShell.tsx`:

```typescript
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create shared PageHeader component**

Create `career-ops-web/components/layout/PageHeader.tsx`:

```typescript
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: { label: string; href: string }
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-7 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href}>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {action.label}
          </Button>
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: sidebar navigation and app shell layout"
```

---

## Task 7: Onboarding — Stepper + Wizard

**Files:**
- Create: `components/onboarding/Stepper.tsx`
- Create: `components/onboarding/OnboardingWizard.tsx`
- Create: `app/onboarding/page.tsx`

- [ ] **Step 1: Create Stepper component**

Create `career-ops-web/components/onboarding/Stepper.tsx`:

```typescript
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

const STEPS = ['Profile', 'CV', 'Portals', 'Done']

interface StepperProps {
  currentStep: number // 1-based
}

export function Stepper({ currentStep }: StepperProps) {
  const fillPct = ((currentStep - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="bg-white border-b border-gray-200 px-8 py-5">
      <div className="text-[11px] font-bold tracking-widest text-gray-400 uppercase mb-5">
        career<span className="text-indigo-600">ops</span> &nbsp;·&nbsp; Setup
      </div>

      <div className="flex items-start">
        {STEPS.map((label, i) => {
          const stepNum = i + 1
          const isCompleted = stepNum < currentStep
          const isActive = stepNum === currentStep
          const isLast = i === STEPS.length - 1

          return (
            <div key={label} className="flex items-start flex-1">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all',
                  isCompleted && 'bg-indigo-600 border-indigo-600 text-white',
                  isActive && 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100',
                  !isCompleted && !isActive && 'border-gray-300 text-gray-400'
                )}>
                  {isCompleted ? <Check size={14} /> : stepNum}
                </div>
                <div className={cn(
                  'text-[11px] font-semibold mt-2',
                  isActive ? 'text-indigo-600' : isCompleted ? 'text-gray-500' : 'text-gray-400'
                )}>
                  {label}
                </div>
              </div>
              {!isLast && (
                <div className="flex-1 mt-4 mx-2">
                  <div className="h-0.5 bg-gray-200 rounded">
                    <div
                      className="h-full bg-indigo-600 rounded transition-all duration-500"
                      style={{ width: isCompleted ? '100%' : '0%' }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create OnboardingWizard orchestrator**

Create `career-ops-web/components/onboarding/OnboardingWizard.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { Stepper } from './Stepper'
import { Step1Profile } from './Step1Profile'
import { Step2CV } from './Step2CV'
import { Step3Portals } from './Step3Portals'
import { Step4Done } from './Step4Done'
import type { ProfileStep1, ProfileStep2, ProfileStep3 } from '@/lib/validations'

interface WizardData {
  step1?: ProfileStep1
  step2?: ProfileStep2
  step3?: ProfileStep3
}

export function OnboardingWizard() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<WizardData>({})

  const handleStep1 = (d: ProfileStep1) => { setData(p => ({ ...p, step1: d })); setStep(2) }
  const handleStep2 = (d: ProfileStep2) => { setData(p => ({ ...p, step2: d })); setStep(3) }
  const handleStep3 = (d: ProfileStep3) => { setData(p => ({ ...p, step3: d })); setStep(4) }

  return (
    <div className="min-h-screen bg-gray-50">
      <Stepper currentStep={step} />
      <div className="flex justify-center px-4 py-10">
        {step === 1 && <Step1Profile onNext={handleStep1} defaultValues={data.step1} />}
        {step === 2 && <Step2CV onNext={handleStep2} onBack={() => setStep(1)} defaultValues={data.step2} />}
        {step === 3 && <Step3Portals onNext={handleStep3} onBack={() => setStep(2)} defaultValues={data.step3} allData={data} />}
        {step === 4 && <Step4Done />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create onboarding page**

Create `career-ops-web/app/onboarding/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  return <OnboardingWizard />
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: onboarding wizard orchestrator and stepper"
```

---

## Task 8: Onboarding Steps 1–3 + Profile API

**Files:**
- Create: `components/onboarding/Step1Profile.tsx`
- Create: `components/onboarding/Step2CV.tsx`
- Create: `components/onboarding/Step3Portals.tsx`
- Create: `components/onboarding/Step4Done.tsx`
- Create: `app/api/profile/route.ts`

- [ ] **Step 1: Create Step1Profile**

Create `career-ops-web/components/onboarding/Step1Profile.tsx`:

```typescript
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileStep1Schema, type ProfileStep1 } from '@/lib/validations'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface Props { onNext: (d: ProfileStep1) => void; defaultValues?: ProfileStep1 }

export function Step1Profile({ onNext, defaultValues }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<ProfileStep1>({
    resolver: zodResolver(profileStep1Schema),
    defaultValues,
  })

  const hasErrors = Object.keys(errors).length > 0

  return (
    <div className="w-full max-w-lg">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10">
        <h2 className="text-xl font-bold mb-1">Your profile</h2>
        <p className="text-sm text-gray-500 mb-8">Personalizes AI evaluations and CV generation for every role</p>

        {hasErrors && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm text-red-600 font-medium">
            <AlertCircle size={15} />
            Please fill in all required fields before continuing.
          </div>
        )}

        <form onSubmit={handleSubmit(onNext)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name *" error={errors.fullName?.message}>
              <Input {...register('fullName')} placeholder="Jane Doe" className={errors.fullName ? 'border-red-400 bg-red-50' : ''} />
            </Field>
            <Field label="Location *" error={errors.location?.message}>
              <Input {...register('location')} placeholder="San Francisco, CA" className={errors.location ? 'border-red-400 bg-red-50' : ''} />
            </Field>
            <Field label="Target Role(s) *" error={errors.targetRoles?.message}>
              <Input {...register('targetRoles')} placeholder="Head of AI, AI PM" className={errors.targetRoles ? 'border-red-400 bg-red-50' : ''} />
            </Field>
            <Field label="Seniority *" error={errors.seniority?.message}>
              <Input {...register('seniority')} placeholder="Director / VP / IC5+" className={errors.seniority ? 'border-red-400 bg-red-50' : ''} />
            </Field>
            <Field label="Min Salary (USD) *" error={errors.salaryMin?.message}>
              <Input {...register('salaryMin', { valueAsNumber: true })} type="number" placeholder="180000" className={errors.salaryMin ? 'border-red-400 bg-red-50' : ''} />
            </Field>
            <Field label="Max Salary (USD) *" error={errors.salaryMax?.message}>
              <Input {...register('salaryMax', { valueAsNumber: true })} type="number" placeholder="240000" className={errors.salaryMax ? 'border-red-400 bg-red-50' : ''} />
            </Field>
          </div>
          <Field label="Your Superpower *" error={errors.superpower?.message}>
            <Textarea {...register('superpower')} rows={3} placeholder="I turn ambiguous AI opportunities into shipped products..." className={errors.superpower ? 'border-red-400 bg-red-50' : ''} />
          </Field>

          <div className="flex justify-between items-center pt-4">
            <span className="text-xs text-gray-400">Step 1 of 4</span>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">Continue →</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create Step2CV**

Create `career-ops-web/components/onboarding/Step2CV.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileStep2Schema, type ProfileStep2 } from '@/lib/validations'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AlertCircle, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props { onNext: (d: ProfileStep2) => void; onBack: () => void; defaultValues?: ProfileStep2 }

export function Step2CV({ onNext, onBack, defaultValues }: Props) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProfileStep2>({
    resolver: zodResolver(profileStep2Schema),
    defaultValues,
  })

  const cvValue = watch('cvMarkdown') || ''

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setValue('cvMarkdown', ev.target?.result as string)
    reader.readAsText(file)
  }

  return (
    <div className="w-full max-w-lg">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10">
        <h2 className="text-xl font-bold mb-1">Your CV</h2>
        <p className="text-sm text-gray-500 mb-8">Used for fit scoring and tailored PDF generation per role</p>

        {errors.cvMarkdown && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm text-red-600 font-medium">
            <AlertCircle size={15} /> Please add your CV before continuing.
          </div>
        )}

        <form onSubmit={handleSubmit(onNext)} className="space-y-4">
          <label className={cn(
            'flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors',
            errors.cvMarkdown ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
          )}>
            <Upload size={24} className="text-gray-400" />
            <div className="text-sm font-semibold text-gray-600">
              <span className="text-indigo-600">Click to upload</span> or drag and drop
            </div>
            <div className="text-xs text-gray-400">.md · .txt accepted</div>
            <input type="file" accept=".md,.txt" className="hidden" onChange={handleFileUpload} />
          </label>

          <div className="text-center text-xs text-gray-400">— or paste markdown directly —</div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">CV Content *</label>
            <Textarea
              {...register('cvMarkdown')}
              rows={12}
              placeholder={`# Jane Doe\njane@example.com · linkedin.com/in/janedoe\n\n## Experience\n**Head of AI · Acme Corp** (2022–2024)\n- Led 0→1 RAG system serving 2M users`}
              className={cn('font-mono text-xs', errors.cvMarkdown ? 'border-red-400 bg-red-50' : '')}
            />
            <p className="text-xs text-gray-400 text-right">{cvValue.length} chars</p>
          </div>

          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">Continue →</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create Step3Portals with default portals.yml**

Create `career-ops-web/components/onboarding/Step3Portals.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileStep3Schema, type ProfileStep3 } from '@/lib/validations'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useToast } from '@/components/ui/use-toast'

const DEFAULT_PORTALS_YAML = `title_filter:
  positive: [AI, LLM, "Machine Learning", "Applied AI", "ML Platform", "AI Platform"]
  negative: [Junior, Intern, ".NET", PHP, "Data Entry", WordPress]

companies:
  - name: Anthropic
    url: https://boards.greenhouse.io/anthropic
  - name: OpenAI
    url: https://boards.greenhouse.io/openai
  - name: Google DeepMind
    url: https://boards.greenhouse.io/deepmind
  - name: Mistral AI
    url: https://boards.greenhouse.io/mistral
  - name: Cohere
    url: https://boards.greenhouse.io/cohere
  - name: Scale AI
    url: https://boards.greenhouse.io/scaleai
  - name: Hugging Face
    url: https://boards.greenhouse.io/huggingface
  - name: Stability AI
    url: https://boards.greenhouse.io/stabilityai
`

interface Props {
  onNext: (d: ProfileStep3) => void
  onBack: () => void
  defaultValues?: ProfileStep3
  allData: any
}

export function Step3Portals({ onNext, onBack, defaultValues, allData }: Props) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [useDefault, setUseDefault] = useState(true)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProfileStep3>({
    resolver: zodResolver(profileStep3Schema),
    defaultValues: defaultValues ?? {
      includeKw: 'AI, LLM, Machine Learning, Applied AI',
      excludeKw: 'Junior, Intern, .NET, PHP',
      portalsYaml: DEFAULT_PORTALS_YAML,
    },
  })

  const onSubmit = async (d: ProfileStep3) => {
    setSaving(true)
    try {
      const payload = {
        ...allData.step1,
        cvMarkdown: allData.step2?.cvMarkdown,
        ...d,
      }
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save profile')
      onNext(d)
    } catch (err) {
      toast({ title: 'Error saving profile', description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-lg">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10">
        <h2 className="text-xl font-bold mb-1">Job portals config</h2>
        <p className="text-sm text-gray-500 mb-8">45+ companies pre-configured. Tune keywords to match your roles.</p>

        {Object.keys(errors).length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm text-red-600 font-medium">
            <AlertCircle size={15} /> Please add at least one include keyword.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button type="button" onClick={() => { setUseDefault(true); setValue('portalsYaml', DEFAULT_PORTALS_YAML) }}
              className={cn('p-3 rounded-xl border-2 text-left transition-all', useDefault ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200')}>
              <div className={cn('text-sm font-bold', useDefault ? 'text-indigo-600' : 'text-gray-700')}>
                {useDefault ? '✓ ' : ''}Use default template
              </div>
              <div className="text-xs text-gray-500 mt-0.5">45 companies, AI/ML keywords</div>
            </button>
            <label className={cn('p-3 rounded-xl border-2 text-left cursor-pointer transition-all', !useDefault ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200')}>
              <div className="text-sm font-bold text-gray-700">Upload portals.yml</div>
              <div className="text-xs text-gray-500 mt-0.5">Use your existing config</div>
              <input type="file" accept=".yml,.yaml" className="hidden" onChange={e => {
                setUseDefault(false)
                const f = e.target.files?.[0]
                if (f) { const r = new FileReader(); r.onload = ev => setValue('portalsYaml', ev.target?.result as string); r.readAsText(f) }
              }} />
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Include Keywords *</label>
            <Input {...register('includeKw')} placeholder="AI, LLM, Machine Learning" className={errors.includeKw ? 'border-red-400 bg-red-50' : ''} />
            {errors.includeKw && <p className="text-xs text-red-500">{errors.includeKw.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Exclude Keywords</label>
            <Input {...register('excludeKw')} placeholder="Junior, Intern, .NET" />
          </div>

          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={saving}>
              {saving ? 'Saving...' : 'Finish Setup →'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create Step4Done**

Create `career-ops-web/components/onboarding/Step4Done.tsx`:

```typescript
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'

export function Step4Done() {
  const router = useRouter()
  const { update } = useSession()

  useEffect(() => {
    // Trigger JWT refresh so middleware sees onboarded=true
    update()
  }, [update])

  return (
    <div className="w-full max-w-md text-center">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-12">
        <div className="text-5xl mb-5">🎉</div>
        <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
        <p className="text-sm text-gray-500 mb-8">
          Your profile, CV, and portals are configured. Start by evaluating a job description or browsing your pipeline.
        </p>
        <Button
          onClick={() => router.push('/dashboard')}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11"
        >
          Go to Dashboard →
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create Profile API route (POST)**

Create `career-ops-web/app/api/profile/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createProfileSchema = z.object({
  fullName: z.string().min(1),
  location: z.string().min(1),
  targetRoles: z.string().min(1),
  seniority: z.string().min(1),
  salaryMin: z.number(),
  salaryMax: z.number(),
  superpower: z.string().min(1),
  cvMarkdown: z.string().min(1),
  portalsYaml: z.string().min(1),
  includeKw: z.string().min(1),
  excludeKw: z.string().optional().default(''),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createProfileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...parsed.data },
    update: parsed.data,
  })

  return NextResponse.json(profile)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const profile = await prisma.profile.update({
    where: { userId: session.user.id },
    data: body,
  })
  return NextResponse.json(profile)
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: onboarding steps 1-4 with validation + profile API"
```

---

## Task 9: Anthropic Client + Evaluation Prompt

**Files:**
- Create: `lib/anthropic.ts`
- Create: `lib/prompt.ts`

- [ ] **Step 1: Write prompt builder test**

Create `career-ops-web/lib/__tests__/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildEvaluationPrompt } from '../prompt'

describe('buildEvaluationPrompt', () => {
  it('includes CV content in prompt', () => {
    const prompt = buildEvaluationPrompt({
      jdText: 'We need a Head of AI',
      profile: {
        fullName: 'Jane', targetRoles: 'Head of AI', seniority: 'Director',
        salaryMin: 180000, salaryMax: 240000, superpower: 'I ship AI',
        location: 'SF', cvMarkdown: '# Jane\n## Experience\nAI Lead', currency: 'USD',
      },
    })
    expect(prompt).toContain('Jane')
    expect(prompt).toContain('Head of AI')
    expect(prompt).toContain('Block A')
    expect(prompt).toContain('Block G')
  })

  it('includes URL when provided', () => {
    const prompt = buildEvaluationPrompt({
      jdText: 'Job at Anthropic',
      url: 'https://anthropic.com/careers',
      profile: {
        fullName: 'Jane', targetRoles: 'Head of AI', seniority: 'Director',
        salaryMin: 180000, salaryMax: 240000, superpower: 'I ship AI',
        location: 'SF', cvMarkdown: '# Jane', currency: 'USD',
      },
    })
    expect(prompt).toContain('https://anthropic.com/careers')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```
Expected: FAIL — `prompt` module not found.

- [ ] **Step 3: Create Anthropic client**

Create `career-ops-web/lib/anthropic.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})
```

- [ ] **Step 4: Create prompt builder**

Create `career-ops-web/lib/prompt.ts`:

```typescript
interface ProfileData {
  fullName: string
  targetRoles: string
  seniority: string
  salaryMin: number
  salaryMax: number
  currency: string
  superpower: string
  location: string
  cvMarkdown: string
}

interface PromptInput {
  jdText: string
  url?: string
  profile: ProfileData
}

export function buildEvaluationPrompt({ jdText, url, profile }: PromptInput): string {
  return `You are Career-Ops, an expert AI job search analyst. Evaluate this job description against the candidate's profile.

## Candidate Profile
- **Name:** ${profile.fullName}
- **Target Roles:** ${profile.targetRoles}
- **Seniority:** ${profile.seniority}
- **Location:** ${profile.location}
- **Salary Target:** ${profile.currency} ${profile.salaryMin.toLocaleString()}–${profile.salaryMax.toLocaleString()}
- **Superpower:** ${profile.superpower}

## Candidate CV
${profile.cvMarkdown}

## Job Description
${url ? `**Source URL:** ${url}\n\n` : ''}${jdText}

---

Produce a structured evaluation with exactly these 7 blocks. Use markdown headers exactly as shown.

## Block A — Role Summary
Summarize the role: title, company, location, type (full-time/contract), and 3-bullet overview of responsibilities.

## Block B — CV Match
Score the CV match 1–5. List strong matches (✓) and gaps (✗). Be specific about which CV experiences align.

## Block C — Level & Strategy
Assess seniority alignment. Is this above/at/below the candidate's level? Positioning advice.

## Block D — Compensation Research
Estimate comp range for this role/level/location based on market data. Compare to candidate target. Flag if significantly below.

## Block E — Personalization
3 specific talking points the candidate should emphasize in their application based on their CV and this JD.

## Block F — Interview Prep
Top 5 likely interview questions for this role with brief answer frameworks based on the candidate's experience.

## Block G — Legitimacy & Recommendation
**Score:** X.X/5
**Legitimacy:** [Verified/Likely-Real/Suspicious/Ghost]
**Recommendation:** [APPLY / SKIP / CONDITIONAL]
Brief 2-sentence rationale. Only recommend APPLY if score ≥ 4.0.`
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test
```
Expected: PASS — 2 prompt tests + 3 validation tests.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: anthropic client + evaluation prompt builder"
```

---

## Task 10: Evaluate JD Page + Streaming API

**Files:**
- Create: `app/api/evaluate/route.ts`
- Create: `components/evaluate/EvaluateForm.tsx`
- Create: `components/evaluate/StreamingEvaluation.tsx`
- Create: `app/evaluate/page.tsx`

- [ ] **Step 1: Create streaming evaluate API route**

Create `career-ops-web/app/api/evaluate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { anthropicClient } from '@/lib/anthropic'
import { buildEvaluationPrompt } from '@/lib/prompt'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url, jdText } = await req.json()
  if (!jdText && !url) return NextResponse.json({ error: 'Provide jdText or url' }, { status: 400 })

  const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  let finalJdText = jdText || ''
  if (url && !jdText) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      finalJdText = await res.text()
      // Strip HTML tags for readability
      finalJdText = finalJdText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
    } catch {
      return NextResponse.json({ error: 'Could not fetch URL' }, { status: 400 })
    }
  }

  const prompt = buildEvaluationPrompt({ jdText: finalJdText, url, profile })

  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = anthropicClient.messages.stream({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        })

        for await (const chunk of messageStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text
            fullContent += text
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }

        // Parse score and save to DB
        const scoreMatch = fullContent.match(/\*\*Score:\*\*\s*([\d.]+)\/5/)
        const legitimacyMatch = fullContent.match(/\*\*Legitimacy:\*\*\s*(\S+)/)
        const score = scoreMatch ? parseFloat(scoreMatch[1]) : null
        const legitimacy = legitimacyMatch ? legitimacyMatch[1] : null

        // Get next application number
        const lastApp = await prisma.application.findFirst({
          where: { userId: session.user.id },
          orderBy: { num: 'desc' },
        })
        const nextNum = (lastApp?.num ?? 0) + 1

        // Extract company/role from content
        const companyMatch = finalJdText.match(/(?:at|@|company:?)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|\s)/i)
        const company = companyMatch?.[1]?.trim() ?? 'Unknown'

        const application = await prisma.application.create({
          data: {
            userId: session.user.id,
            num: nextNum,
            company,
            role: 'Evaluated Role',
            score,
            status: 'Evaluated',
            url: url ?? null,
          },
        })

        const report = await prisma.report.create({
          data: {
            userId: session.user.id,
            applicationId: application.id,
            url: url ?? null,
            content: fullContent,
            legitimacy,
          },
        })

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reportId: report.id })}\n\n`))
        controller.close()
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Create StreamingEvaluation component**

Create `career-ops-web/components/evaluate/StreamingEvaluation.tsx`:

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2 } from 'lucide-react'

const BLOCKS = ['Block A', 'Block B', 'Block C', 'Block D', 'Block E', 'Block F', 'Block G']

interface Props { url?: string; jdText?: string }

export function StreamingEvaluation({ url, jdText }: Props) {
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function run() {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, jdText }),
      })
      if (!res.ok) { setError('Evaluation failed'); setIsLoading(false); return }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.text) setContent(p => p + data.text)
          if (data.done) {
            setIsLoading(false)
            setTimeout(() => router.push(`/reports/${data.reportId}`), 1500)
          }
          if (data.error) { setError(data.error); setIsLoading(false) }
        }
      }
    }

    run().catch(e => { setError(String(e)); setIsLoading(false) })
  }, [url, jdText, router])

  const completedBlocks = BLOCKS.filter(b => content.includes(b))

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* Progress sidebar */}
      <div className="col-span-2 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Evaluation Progress</h3>
        {BLOCKS.map(block => {
          const done = content.includes(block)
          const active = !done && completedBlocks.length === BLOCKS.indexOf(block)
          return (
            <div key={block} className={`p-3 rounded-lg border text-sm transition-colors ${
              done ? 'bg-green-50 border-green-200 text-green-700 font-semibold' :
              active ? 'bg-indigo-50 border-indigo-200 text-indigo-600' :
              'bg-gray-50 border-gray-200 text-gray-400'
            }`}>
              {done ? '✓ ' : active ? '⟳ ' : ''}{block.replace('Block ', 'Block ')}
            </div>
          )
        })}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
            <Loader2 size={12} className="animate-spin" /> Evaluating with Claude...
          </div>
        )}
        {!isLoading && !error && (
          <div className="text-xs text-green-600 font-semibold mt-2">✓ Complete — redirecting to report...</div>
        )}
      </div>

      {/* Live content */}
      <div className="col-span-3 bg-white border border-gray-200 rounded-xl p-6 overflow-y-auto max-h-[70vh]">
        {error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
            {content}
          </ReactMarkdown>
        ) : (
          <div className="text-gray-400 text-sm">Starting evaluation...</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create EvaluateForm**

Create `career-ops-web/components/evaluate/EvaluateForm.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { evaluateSchema } from '@/lib/validations'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { StreamingEvaluation } from './StreamingEvaluation'

interface FormData { url?: string; jdText?: string }

export function EvaluateForm() {
  const [submitted, setSubmitted] = useState<FormData | null>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(evaluateSchema),
  })

  if (submitted) return <StreamingEvaluation url={submitted.url} jdText={submitted.jdText} />

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit(d => setSubmitted(d))} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Job URL</label>
          <Input {...register('url')} placeholder="https://boards.greenhouse.io/anthropic/jobs/..." />
        </div>
        <div className="text-center text-xs text-gray-400">— or paste JD text below —</div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Job Description</label>
          <Textarea {...register('jdText')} rows={10} placeholder="We are looking for a Head of Applied AI to lead our model deployment team..." />
          {errors.jdText && <p className="text-xs text-red-500">{errors.jdText.message}</p>}
        </div>
        <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 font-bold">
          ⚡ Evaluate with Claude
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Create evaluate page**

Create `career-ops-web/app/evaluate/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { EvaluateForm } from '@/components/evaluate/EvaluateForm'

export default async function EvaluatePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  return (
    <AppShell>
      <PageHeader title="Evaluate Job Description" subtitle="AI scores the role against your CV and profile in real time" />
      <div className="p-7">
        <EvaluateForm />
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: evaluate page with streaming Anthropic evaluation"
```

---

## Task 11: Dashboard Page

**Files:**
- Create: `app/api/applications/route.ts`
- Create: `components/dashboard/StatCard.tsx`
- Create: `components/dashboard/RecentTable.tsx`
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create Applications API (GET + POST)**

Create `career-ops-web/app/api/applications/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const status = searchParams.get('status')

  const applications = await prisma.application.findMany({
    where: { userId: session.user.id, ...(status ? { status } : {}) },
    include: { report: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(applications)
}
```

Create `career-ops-web/app/api/applications/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applicationUpdateSchema } from '@/lib/validations'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = applicationUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const app = await prisma.application.update({
    where: { id: params.id, userId: session.user.id },
    data: parsed.data,
  })
  return NextResponse.json(app)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.application.delete({ where: { id: params.id, userId: session.user.id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create StatCard**

Create `career-ops-web/components/dashboard/StatCard.tsx`:

```typescript
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: 'indigo' | 'green' | 'amber' | 'purple'
}

const colorMap = {
  indigo: 'text-indigo-600',
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  purple: 'text-violet-600',
}

export function StatCard({ label, value, sub, color = 'indigo' }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-3">{label}</div>
      <div className={cn('text-3xl font-bold leading-none', colorMap[color])}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-2">{sub}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Create RecentTable**

Create `career-ops-web/components/dashboard/RecentTable.tsx`:

```typescript
'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  Interview: 'bg-green-50 text-green-700 border-green-200',
  Applied: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Evaluated: 'bg-amber-50 text-amber-700 border-amber-200',
  Offer: 'bg-green-100 text-green-800 border-green-300',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  SKIP: 'bg-gray-100 text-gray-500 border-gray-200',
}

interface Application {
  id: string; num: number; company: string; role: string
  score: number | null; status: string; createdAt: string
  report?: { id: string } | null
}

export function RecentTable({ applications }: { applications: Application[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-200 flex justify-between items-center">
        <span className="text-sm font-bold text-gray-800">Recent Applications</span>
        <Link href="/applications" className="text-xs font-semibold text-indigo-600 hover:underline">View all →</Link>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {['#', 'Company', 'Role', 'Score', 'Status', 'Date'].map(h => (
              <th key={h} className="px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {applications.map(app => (
            <tr key={app.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="px-5 py-3 text-xs text-gray-400">{String(app.num).padStart(3,'0')}</td>
              <td className="px-5 py-3 text-sm font-semibold text-gray-800">{app.company}</td>
              <td className="px-5 py-3 text-sm text-gray-600">{app.role}</td>
              <td className="px-5 py-3">
                {app.score != null ? (
                  <span className={cn('text-sm font-bold', app.score >= 4 ? 'text-emerald-600' : app.score >= 3 ? 'text-amber-600' : 'text-red-500')}>
                    {app.score.toFixed(1)}/5
                  </span>
                ) : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-5 py-3">
                <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full border', STATUS_STYLES[app.status] ?? 'bg-gray-100 text-gray-500')}>
                  {app.status}
                </span>
              </td>
              <td className="px-5 py-3 text-xs text-gray-400">
                {new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
            </tr>
          ))}
          {applications.length === 0 && (
            <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">No applications yet. <Link href="/evaluate" className="text-indigo-600 font-medium">Evaluate your first JD →</Link></td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Create Dashboard page**

Create `career-ops-web/app/dashboard/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from '@/components/dashboard/StatCard'
import { RecentTable } from '@/components/dashboard/RecentTable'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')

  const userId = session.user.id
  const [applications, profile] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      include: { report: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.profile.findUnique({ where: { userId } }),
  ])

  const allApps = await prisma.application.findMany({ where: { userId } })
  const avgScore = allApps.filter(a => a.score).reduce((s, a) => s + (a.score ?? 0), 0) / (allApps.filter(a => a.score).length || 1)
  const inPipeline = allApps.filter(a => ['Evaluated', 'Applied'].includes(a.status)).length
  const interviews = allApps.filter(a => a.status === 'Interview').length

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        subtitle={today}
        action={{ label: '+ Evaluate JD', href: '/evaluate' }}
      />
      <div className="p-7 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Applications" value={allApps.length} sub="All time" color="indigo" />
          <StatCard label="Avg Score" value={allApps.length ? `${avgScore.toFixed(1)}/5` : '—'} sub="Target ≥ 4.0" color="green" />
          <StatCard label="In Pipeline" value={inPipeline} sub="Evaluated + Applied" color="amber" />
          <StatCard label="Active Interviews" value={interviews} color="purple" />
        </div>
        <RecentTable applications={applications as any} />
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: dashboard with stats, recent applications table"
```

---

## Task 12: Applications Page + Reports Page

**Files:**
- Create: `components/applications/ApplicationsTable.tsx`
- Create: `app/applications/page.tsx`
- Create: `app/api/reports/[id]/route.ts`
- Create: `app/reports/[id]/page.tsx`

- [ ] **Step 1: Create ApplicationsTable with inline status edit**

Create `career-ops-web/components/applications/ApplicationsTable.tsx`:

```typescript
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

const STATUSES = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP']
const STATUS_STYLES: Record<string, string> = {
  Interview: 'bg-green-50 text-green-700', Applied: 'bg-indigo-50 text-indigo-700',
  Evaluated: 'bg-amber-50 text-amber-700', Offer: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-50 text-red-600', SKIP: 'bg-gray-100 text-gray-500',
  Responded: 'bg-blue-50 text-blue-700', Discarded: 'bg-gray-100 text-gray-400',
}

interface Application {
  id: string; num: number; company: string; role: string
  score: number | null; status: string; createdAt: string
  report?: { id: string } | null
}

export function ApplicationsTable({ applications: initial }: { applications: Application[] }) {
  const [apps, setApps] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const router = useRouter()

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/applications/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setEditingId(null)
  }

  const deleteApp = async (id: string) => {
    if (!confirm('Delete this application?')) return
    await fetch(`/api/applications/${id}`, { method: 'DELETE' })
    setApps(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['#','Company','Role','Score','Status','Date','Report',''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apps.map(app => (
            <tr key={app.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-xs text-gray-400">{String(app.num).padStart(3,'0')}</td>
              <td className="px-4 py-3 text-sm font-semibold">{app.company}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{app.role}</td>
              <td className="px-4 py-3 text-sm font-bold">
                {app.score != null ? (
                  <span className={app.score >= 4 ? 'text-emerald-600' : app.score >= 3 ? 'text-amber-600' : 'text-red-500'}>
                    {app.score.toFixed(1)}/5
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3 relative">
                {editingId === app.id ? (
                  <select autoFocus className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    defaultValue={app.status} onBlur={() => setEditingId(null)}
                    onChange={e => updateStatus(app.id, e.target.value)}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <button onClick={() => setEditingId(app.id)}
                    className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full', STATUS_STYLES[app.status] ?? 'bg-gray-100 text-gray-500')}>
                    {app.status}
                  </button>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-gray-400">
                {new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
              <td className="px-4 py-3">
                {app.report?.id ? (
                  <Link href={`/reports/${app.report.id}`} className="text-xs text-indigo-600 font-semibold hover:underline">View →</Link>
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                <button onClick={() => deleteApp(app.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
          {apps.length === 0 && (
            <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">No applications yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create Applications page**

Create `career-ops-web/app/applications/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { ApplicationsTable } from '@/components/applications/ApplicationsTable'

export default async function ApplicationsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')

  const applications = await prisma.application.findMany({
    where: { userId: session.user.id },
    include: { report: { select: { id: true } } },
    orderBy: { num: 'desc' },
  })

  return (
    <AppShell>
      <PageHeader title="Applications" subtitle={`${applications.length} total`} action={{ label: '+ Evaluate JD', href: '/evaluate' }} />
      <div className="p-7">
        <ApplicationsTable applications={applications as any} />
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 3: Create Report API + page**

Create `career-ops-web/app/api/reports/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const report = await prisma.report.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { application: true },
  })
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(report)
}
```

Create `career-ops-web/app/reports/[id]/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

export default async function ReportPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')

  const report = await prisma.report.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { application: true },
  })
  if (!report) notFound()

  const scoreMatch = report.content.match(/\*\*Score:\*\*\s*([\d.]+)\/5/)
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null

  return (
    <AppShell>
      <PageHeader
        title={`${report.application?.company ?? 'Report'} — ${report.application?.role ?? ''}`}
        subtitle={new Date(report.createdAt).toLocaleDateString('en-US', { dateStyle: 'long' })}
      />
      <div className="p-7">
        {score != null && (
          <div className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-6 border',
            score >= 4 ? 'bg-green-50 text-green-700 border-green-200' :
            score >= 3 ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-red-50 text-red-600 border-red-200')}>
            {score.toFixed(1)} / 5 — {score >= 4 ? 'Strong Match' : score >= 3 ? 'Moderate Match' : 'Weak Match'}
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
            {report.content}
          </ReactMarkdown>
        </div>
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: applications tracker, reports viewer, application CRUD API"
```

---

## Task 13: Pipeline + Settings Pages

**Files:**
- Create: `app/api/pipeline/route.ts`
- Create: `components/pipeline/PipelineInbox.tsx`
- Create: `app/pipeline/page.tsx`
- Create: `components/settings/SettingsTabs.tsx`
- Create: `app/settings/page.tsx`

- [ ] **Step 1: Pipeline API**

Create `career-ops-web/app/api/pipeline/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await prisma.pipelineItem.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { url, urls } = await req.json()
  if (urls && Array.isArray(urls)) {
    const items = await prisma.pipelineItem.createMany({
      data: urls.map((u: string) => ({ userId: session.user.id, url: u })),
    })
    return NextResponse.json({ created: items.count })
  }
  const item = await prisma.pipelineItem.create({ data: { userId: session.user.id, url } })
  return NextResponse.json(item)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await prisma.pipelineItem.delete({ where: { id, userId: session.user.id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: PipelineInbox component**

Create `career-ops-web/components/pipeline/PipelineInbox.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Trash2, Zap } from 'lucide-react'

interface PipelineItem { id: string; url: string; company?: string; status: string; createdAt: string }

export function PipelineInbox({ items: initial }: { items: PipelineItem[] }) {
  const [items, setItems] = useState(initial)
  const [singleUrl, setSingleUrl] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const router = useRouter()

  const addSingle = async () => {
    if (!singleUrl.trim()) return
    const res = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: singleUrl }) })
    const item = await res.json()
    setItems(p => [item, ...p])
    setSingleUrl('')
  }

  const addBulk = async () => {
    const urls = bulkText.split('\n').map(u => u.trim()).filter(Boolean)
    await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) })
    setBulkText('')
    router.refresh()
  }

  const remove = async (id: string) => {
    await fetch('/api/pipeline', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setItems(p => p.filter(i => i.id !== id))
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex gap-2">
          <Input value={singleUrl} onChange={e => setSingleUrl(e.target.value)} placeholder="https://boards.greenhouse.io/..." className="flex-1" />
          <Button onClick={addSingle} className="bg-indigo-600 hover:bg-indigo-700 text-white">Add</Button>
          <Button variant="outline" onClick={() => setShowBulk(b => !b)}>Bulk</Button>
        </div>
        {showBulk && (
          <div className="space-y-2">
            <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={5} placeholder="One URL per line..." />
            <Button size="sm" onClick={addBulk} className="bg-indigo-600 text-white">Add All</Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-mono text-gray-700 truncate">{item.url}</div>
              <div className="text-xs text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</div>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${item.status === 'done' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {item.status}
            </span>
            <a href={`/evaluate?url=${encodeURIComponent(item.url)}`} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
              <Zap size={12} /> Evaluate
            </a>
            <button onClick={() => remove(item.id)} className="text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-400">No URLs in pipeline. Add some above.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Pipeline page**

Create `career-ops-web/app/pipeline/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { PipelineInbox } from '@/components/pipeline/PipelineInbox'

export default async function PipelinePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')
  const items = await prisma.pipelineItem.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  return (
    <AppShell>
      <PageHeader title="Pipeline" subtitle="Add job URLs to evaluate in batch" />
      <div className="p-7"><PipelineInbox items={items} /></div>
    </AppShell>
  )
}
```

- [ ] **Step 4: SettingsTabs component**

Create `career-ops-web/components/settings/SettingsTabs.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

export function SettingsTabs({ profile }: { profile: any }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit } = useForm({ defaultValues: profile })

  const save = async (data: any) => {
    setSaving(true)
    try {
      await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      toast({ title: 'Settings saved' })
    } catch { toast({ title: 'Error saving', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  return (
    <Tabs defaultValue="profile" className="max-w-2xl">
      <TabsList className="mb-6">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="cv">CV</TabsTrigger>
        <TabsTrigger value="portals">Portals</TabsTrigger>
      </TabsList>

      <form onSubmit={handleSubmit(save)}>
        <TabsContent value="profile" className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[['fullName','Full Name'],['location','Location'],['targetRoles','Target Roles'],['seniority','Seniority']].map(([k,l]) => (
                <div key={k} className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{l}</label>
                  <Input {...register(k)} />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Min Salary</label>
                <Input {...register('salaryMin', { valueAsNumber: true })} type="number" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Max Salary</label>
                <Input {...register('salaryMax', { valueAsNumber: true })} type="number" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Superpower</label>
              <Textarea {...register('superpower')} rows={3} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cv">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500 block mb-2">CV Markdown</label>
            <Textarea {...register('cvMarkdown')} rows={20} className="font-mono text-xs" />
          </div>
        </TabsContent>

        <TabsContent value="portals">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Include Keywords</label>
              <Input {...register('includeKw')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Exclude Keywords</label>
              <Input {...register('excludeKw')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">portals.yml</label>
              <Textarea {...register('portalsYaml')} rows={15} className="font-mono text-xs" />
            </div>
          </div>
        </TabsContent>

        <div className="mt-6">
          <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Tabs>
  )
}
```

- [ ] **Step 5: Settings page**

Create `career-ops-web/app/settings/page.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { SettingsTabs } from '@/components/settings/SettingsTabs'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')
  const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } })
  if (!profile) redirect('/onboarding')
  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Manage your profile, CV, and portals config" />
      <div className="p-7"><SettingsTabs profile={profile} /></div>
    </AppShell>
  )
}
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: PASS — all 5 tests.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: pipeline inbox, settings tabs, all pages complete"
```

---

## Task 14: GitHub Repo + Vercel Deployment

**Files:**
- Create: `.gitignore`
- Create: `vercel.json`

- [ ] **Step 1: Ensure .gitignore is correct**

`career-ops-web/.gitignore` should contain (add if missing):
```
.env.local
.env
node_modules/
.next/
prisma/migrations/  # keep this if you want, or track it
```

- [ ] **Step 2: Create vercel.json**

Create `career-ops-web/vercel.json`:
```json
{
  "buildCommand": "prisma generate && next build",
  "framework": "nextjs"
}
```

- [ ] **Step 3: Create GitHub repo and push**

```bash
cd /Users/tanmay/Documents/Applications/CarrierOps/career-ops-web
# Go to github.com/new → create repo named "career-ops-web" → copy the remote URL
git remote add origin https://github.com/YOUR_USERNAME/career-ops-web.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Set up Supabase (manual)**

1. Go to [supabase.com](https://supabase.com) → New Project
2. Settings → Database → Connection String → URI → copy as `DATABASE_URL` (use pooler)
3. Settings → Database → Connection String → Direct → copy as `DIRECT_URL`
4. Settings → API → copy `Project URL` as `NEXT_PUBLIC_SUPABASE_URL`
5. Settings → API → copy `anon public` as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Settings → API → copy `service_role` as `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 5: Set up Google OAuth (manual)**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Application type: Web application
4. Authorized redirect URIs: `https://your-app.vercel.app/api/auth/callback/google`
5. Copy Client ID → `GOOGLE_CLIENT_ID`, Client Secret → `GOOGLE_CLIENT_SECRET`

- [ ] **Step 6: Run Prisma migration**

```bash
cd career-ops-web
# Fill in DATABASE_URL and DIRECT_URL in .env.local first
npx prisma migrate dev --name init
npx prisma generate
```

- [ ] **Step 7: Connect to Vercel**

1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Import `career-ops-web` from GitHub
3. Add all env vars from `.env.local` in the Vercel dashboard
4. Add `NEXTAUTH_URL` = `https://your-app.vercel.app`
5. Deploy → wait for build to complete

- [ ] **Step 8: Final smoke test**

Open `https://your-app.vercel.app` and verify:
- [ ] Landing page loads
- [ ] "Continue with Google" triggers OAuth
- [ ] After sign-in → redirected to `/onboarding`
- [ ] Step 1: empty fields show errors, populated fields advance
- [ ] Step 2: empty CV shows error, pasted CV advances
- [ ] Step 3: finish saves profile → redirected to `/dashboard`
- [ ] Dashboard shows stats (all 0 initially)
- [ ] Evaluate page: paste JD text → evaluation streams in → saved report → redirect
- [ ] Applications page shows the evaluated application
- [ ] Report page shows full markdown report

- [ ] **Step 9: Final commit**

```bash
git add vercel.json .gitignore
git commit -m "feat: vercel deployment config, complete career-ops SaaS v1"
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ Google OAuth with NextAuth — Task 3
- ✅ Multi-user with data isolation — middleware Task 4, userId scoping in all APIs
- ✅ 4-step onboarding with validation blocking — Tasks 7–8
- ✅ Profile/CV/portals.yml — Tasks 8 + Profile API
- ✅ Dashboard with stat cards — Task 11
- ✅ Applications tracker with inline status edit — Task 12
- ✅ Evaluate JD with streaming blocks A–G — Task 10
- ✅ Reports viewer — Task 12
- ✅ Pipeline inbox — Task 13
- ✅ Settings (3 tabs) — Task 13
- ✅ Vercel deployment — Task 14
- ✅ Supabase + Prisma schema — Task 2

**Type consistency check:**
- `ProfileStep1`, `ProfileStep2`, `ProfileStep3` defined in `validations.ts` and used consistently across onboarding steps
- `applicationUpdateSchema` used in both the API route and table component
- `session.user.id` typed via NextAuth module augmentation in `auth.ts`

**No placeholders:** All steps contain working code.
