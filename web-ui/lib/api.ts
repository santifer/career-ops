const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

export type CanonicalStatus =
  | "evaluated" | "applied" | "responded" | "interview"
  | "offer" | "rejected" | "discarded" | "skip"

export interface Application {
  number: number
  date: string
  company: string
  role: string
  score: number
  scoreRaw: string
  status: CanonicalStatus
  hasPDF: boolean
  reportNumber: string | null
  reportPath: string | null
  notes: string
  jobURL: string | null
  tldr: string | null
  remote: string | null
  compEstimate: string | null
  recommendation: string | null
}

export interface PipelineItem {
  url: string
  company: string
  role: string
  section: string
  done: boolean
}

export interface FollowUp {
  number: number
  company: string
  role: string
  appliedDate: string
  lastContact: string
  nextAction: string
  dueDate: string
  notes: string
}

export interface Profile {
  candidate?: { full_name?: string; email?: string; location?: string }
  target_roles?: { primary?: string[] }
  compensation?: { target_range?: string }
}

export const STATUS_LABELS: Record<CanonicalStatus, string> = {
  evaluated: "Evaluated", applied: "Applied", responded: "Responded",
  interview: "Interview", offer: "Offer", rejected: "Rejected",
  discarded: "Discarded", skip: "SKIP",
}

export const STATUS_COLORS: Record<CanonicalStatus, string> = {
  evaluated: "bg-blue-100 text-blue-800",
  applied: "bg-orange-100 text-orange-800",
  responded: "bg-teal-100 text-teal-800",
  interview: "bg-purple-100 text-purple-800",
  offer: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  discarded: "bg-gray-100 text-gray-500",
  skip: "bg-gray-100 text-gray-400",
}

export const ALL_STATUSES: CanonicalStatus[] = [
  "evaluated","applied","responded","interview","offer","rejected","discarded","skip"
]

export function scoreVariant(score: number): string {
  if (score >= 4.5) return "bg-green-100 text-green-800"
  if (score >= 4.0) return "bg-lime-100 text-lime-800"
  if (score >= 3.5) return "bg-yellow-100 text-yellow-800"
  if (score >= 3.0) return "bg-orange-100 text-orange-800"
  return "bg-red-100 text-red-800"
}

export async function getApplications(): Promise<Application[]> {
  const r = await fetch(`${BASE}/api/applications`, { cache: "no-store" })
  if (!r.ok) return []
  return r.json()
}

export async function getPipeline(): Promise<PipelineItem[]> {
  const r = await fetch(`${BASE}/api/pipeline`, { cache: "no-store" })
  if (!r.ok) return []
  return r.json()
}

export async function getFollowUps(): Promise<FollowUp[]> {
  const r = await fetch(`${BASE}/api/followups`, { cache: "no-store" })
  if (!r.ok) return []
  return r.json()
}

export async function getReport(num: string): Promise<{ content: string } | null> {
  const r = await fetch(`${BASE}/api/report/${num}`, { cache: "no-store" })
  if (!r.ok) return null
  return r.json()
}

export async function getProfile(): Promise<Profile> {
  const r = await fetch(`${BASE}/api/profile`, { cache: "no-store" })
  if (!r.ok) return {}
  return r.json()
}

export async function getStoryBank(): Promise<string> {
  const r = await fetch(`${BASE}/api/storybank`, { cache: "no-store" })
  if (!r.ok) return "# Story Bank\n\nNo stories yet."
  const d = await r.json()
  return d.content
}

export async function getInterviewFiles(): Promise<string[]> {
  const r = await fetch(`${BASE}/api/interview-files`, { cache: "no-store" })
  if (!r.ok) return []
  return r.json()
}
