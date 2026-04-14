import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // If onboarding is complete, redirect to home
  if (user.profile?.onboardingCompleted) {
    redirect("/home");
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC]">
      <div className="mx-auto max-w-xl px-6 py-12">{children}</div>
    </div>
  );
}
