import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getStoryBank, getInterviewIntel } from "@/lib/db/queries/interview-prep";
import { InterviewPrepTabs } from "@/components/interview-prep/interview-prep-tabs";
import { AcademicCapIcon } from "@heroicons/react/24/outline";

export default async function InterviewPrepPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [stories, intel] = await Promise.all([
    getStoryBank(user.id),
    getInterviewIntel(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-800 flex items-center gap-2">
          <AcademicCapIcon className="h-5 w-5" />
          Interview Prep
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          STAR+R story bank and company-specific interview intel.
        </p>
      </div>

      <InterviewPrepTabs
        stories={JSON.parse(JSON.stringify(stories))}
        intel={JSON.parse(JSON.stringify(intel))}
      />
    </div>
  );
}
