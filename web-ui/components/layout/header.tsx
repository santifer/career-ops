import { LockIcon, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Search from "./search";
import Logo from "./logo";
import { SidebarNavLink } from "./sidebar";
import { page_routes } from "@/lib/routes-config";
import { Fragment } from "react";
import Link from "next/link";

export default function Header() {
  return (
    <div className="sticky top-0 z-50 flex flex-col">
      <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px]">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col overflow-auto">
            <Logo className="px-0" />
            <nav className="grid gap-2 text-lg font-medium">
              {page_routes.map((route) => (
                <Fragment key={route.title}>
                  <div className="px-2 py-4 font-medium">{route.title}</div>
                  <nav className="*:flex *:items-center *:gap-3 *:rounded-lg *:px-3 *:py-2 *:transition-all hover:*:bg-muted">
                    {route.items.map((item, key) => (
                      <SidebarNavLink key={key} item={item} />
                    ))}
                  </nav>
                </Fragment>
              ))}
            </nav>
            <div className="mt-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Get Shadcn UI Kit Pro</CardTitle>
                  <CardDescription>
                    Need more pages and components? Then you can get the pro.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    size="sm"
                    className="w-full items-center bg-gradient-to-r from-indigo-700 via-purple-500 to-pink-700 hover:opacity-90"
                    asChild>
                    <Link href="https://shadcnuikit.com/pricing" target="_blank">
                      <LockIcon className="me-2 h-4 w-4" /> Get Pro
                    </Link>
                  </Button>
                  <Button size="sm" className="w-full" variant="outline" asChild>
                    <Link href="https://shadcnuikit.com/" target="_blank">
                      Learn More
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </SheetContent>
        </Sheet>
        <div className="w-full flex-1">
          <Search />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <figure className="cursor-pointer">
              <img src={`/images/avatars/1.png`} className="h-10 w-10" alt="..." />
            </figure>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </div>
  );
}
