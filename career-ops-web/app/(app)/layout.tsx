import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { TopNav } from "@/components/layout/top-nav";
import { CommandBar } from "@/components/layout/command-bar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC]">
      <TopNav userName={user.name} userEmail={user.email} />
      <CommandBar />
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
