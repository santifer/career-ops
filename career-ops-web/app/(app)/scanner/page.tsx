import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPortalConfig, getScanHistory } from "@/lib/db/queries/scanner";
import { PortalConfigForm } from "@/components/scanner/portal-config-form";
import { CompanyList } from "@/components/scanner/company-list";
import { AddCompanyForm } from "@/components/scanner/add-company-form";
import { ScanHistoryTable } from "@/components/scanner/scan-history-table";
import {
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  BuildingOffice2Icon,
  ClockIcon,
} from "@heroicons/react/24/outline";

export default async function ScannerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [config, history] = await Promise.all([
    getPortalConfig(user.id),
    getScanHistory(user.id, 50),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800 flex items-center gap-2">
            <MagnifyingGlassIcon className="h-5 w-5" />
            Scanner
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Configure portal scanning filters and tracked companies.
          </p>
        </div>
      </div>

      {/* Two-column config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Portal Config */}
        <div className="card-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
            <AdjustmentsHorizontalIcon className="h-4 w-4" />
            Title Filters
          </h2>
          <PortalConfigForm
            titleFiltersPositive={config?.titleFiltersPositive ?? []}
            titleFiltersNegative={config?.titleFiltersNegative ?? []}
            seniorityBoost={config?.seniorityBoost ?? []}
          />
        </div>

        {/* Tracked Companies */}
        <div className="card-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
            <BuildingOffice2Icon className="h-4 w-4" />
            Tracked Companies
            {config?.companies && config.companies.length > 0 && (
              <span className="text-xs font-normal text-neutral-400 ml-1">
                ({config.companies.length})
              </span>
            )}
          </h2>
          <CompanyList companies={config?.companies ?? []} />
          <div className="pt-2 border-t border-neutral-100">
            <AddCompanyForm />
          </div>
        </div>
      </div>

      {/* Scan History */}
      <div className="card-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
          <ClockIcon className="h-4 w-4" />
          Recent Scans
          {history.length > 0 && (
            <span className="text-xs font-normal text-neutral-400 ml-1">
              ({history.length})
            </span>
          )}
        </h2>
        <ScanHistoryTable history={history} />
      </div>
    </div>
  );
}
