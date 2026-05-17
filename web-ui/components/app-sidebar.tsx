"use client"

import * as React from "react"
import {
  IconBriefcase,
  IconChartBar,
  IconClipboardList,
  IconDashboard,
  IconMailForward,
  IconSchool,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Your Name",
    email: "your@email.com",
    avatar: "",
  },
  navMain: [
    { title: "Dashboard",      url: "/dashboard",            icon: IconDashboard },
    { title: "Tracker",        url: "/dashboard/tracker",    icon: IconClipboardList },
    { title: "Pipeline Inbox", url: "/dashboard/pipeline",   icon: IconBriefcase },
    { title: "Follow-ups",     url: "/dashboard/followups",  icon: IconMailForward },
    { title: "Interview Prep", url: "/dashboard/interview",  icon: IconSchool },
    { title: "Analytics",      url: "/dashboard/analytics",  icon: IconChartBar },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <a href="/dashboard">
                <div className="flex size-6 items-center justify-center rounded bg-foreground text-background text-xs font-bold">C</div>
                <span className="text-base font-semibold">career-ops</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
