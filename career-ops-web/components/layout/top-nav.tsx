"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mainLinks = [
  { name: "Home", path: "/home" },
  { name: "Applications", path: "/applications" },
  { name: "Pipeline", path: "/pipeline" },
  { name: "Reports", path: "/reports" },
  { name: "Chat", path: "/chat" },
];

const moreLinks = [
  { name: "Scanner", path: "/scanner" },
  { name: "Follow-ups", path: "/follow-ups" },
  { name: "Interview Prep", path: "/interview-prep" },
  { name: "Analytics", path: "/analytics" },
  { name: "Settings", path: "/settings" },
];

interface TopNavProps {
  userName: string | null;
  userEmail: string;
}

export function TopNav({ userName, userEmail }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(path + "/");
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-neutral-200">
      <div className="flex h-12 items-center justify-between px-6">
        {/* Left: Logo + Nav Links */}
        <div className="flex items-center gap-8">
          <Link
            href="/home"
            className="text-base font-semibold text-neutral-800"
          >
            Career-Ops
          </Link>

          <nav className="flex items-center gap-1">
            {mainLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  isActive(link.path)
                    ? "text-neutral-800 bg-neutral-100 font-medium"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50",
                )}
              >
                {link.name}
              </Link>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors",
                  moreLinks.some((l) => isActive(l.path))
                    ? "text-neutral-800 bg-neutral-100 font-medium"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50",
                )}
              >
                More
                <ChevronDownIcon className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {moreLinks.map((link) => (
                  <DropdownMenuItem
                    key={link.path}
                    onClick={() => router.push(link.path)}
                  >
                    {link.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        {/* Right: Command bar hint + User menu */}
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true }),
              )
            }
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-400 bg-neutral-100 rounded-md hover:bg-neutral-200 transition-colors"
          >
            <span>&#8984;K</span>
          </button>
          <UserMenu name={userName} email={userEmail} />
        </div>
      </div>
    </header>
  );
}
