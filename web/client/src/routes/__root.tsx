import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Columns3, Rss, Radio } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Applications", icon: LayoutDashboard },
  { to: "/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/feed", label: "Feed", icon: Rss },
  { to: "/sources", label: "Sources", icon: Radio },
] as const;

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-background">
      <aside className="w-56 border-r bg-card px-3 py-6 flex flex-col gap-1">
        <h1 className="text-lg font-semibold px-3 mb-6">career-ops</h1>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={item.to === "/" ? { exact: true } : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors [&.active]:bg-accent [&.active]:text-accent-foreground [&.active]:font-medium"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  ),
});
