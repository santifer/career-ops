import { Fragment } from "react";
import Link from "next/link";

import { ScrollArea } from "@/components/ui/scroll-area";
import { page_routes } from "@/lib/routes-config";
import Anchor from "../anchor";
import Logo from "./logo";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Icon from "../icon";
import { ChevronDown } from "lucide-react";
import { Badge } from "../ui/badge";

type SidebarNavLinkProps = {
  item: {
    title: string;
    href: string;
    icon?: string;
    isComing?: boolean;
  };
};

export const SidebarNavLink: React.FC<SidebarNavLinkProps> = ({ item }: SidebarNavLinkProps) => {
  return (
    <Anchor
      href={item.href}
      key={item.title + item.href}
      activeClassName="!bg-primary text-primary-foreground">
      {item.icon && <Icon name={item.icon} className="h-4 w-4" />}
      {item.title}
      {item.isComing && (
        <Badge className="ms-auto opacity-50" variant="outline">
          Coming
        </Badge>
      )}
    </Anchor>
  );
};

export default function Sidebar() {
  return (
    <div className="fixed hidden h-screen lg:block">
      <ScrollArea className="h-full w-[--sidebar-width] border-r bg-background px-4">
        <Logo />
        {page_routes.map((route) => (
          <Fragment key={route.title}>
            <div className="px-2 py-4 font-medium">{route.title}</div>
            <div className="*:flex *:items-center *:gap-3 *:rounded-lg *:px-3 *:py-2 *:transition-all hover:*:bg-muted">
              {route.items.map((item, key) => {
                return (
                  <Fragment key={item.title}>
                    {item.items?.length ? (
                      <Collapsible className="group !block transition-all hover:data-[state=open]:bg-transparent">
                        <CollapsibleTrigger className="flex w-full items-center gap-3">
                          {item.icon && <Icon name={item.icon} className="h-4 w-4" />}
                          {item.title}
                          <ChevronDown className="ms-auto h-4 w-4 transition-transform group-data-[state=closed]:rotate-90" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                          <div className="py-2 *:flex *:items-center *:gap-3 *:rounded-lg *:px-7 *:py-2 *:transition-all hover:*:bg-muted">
                            {item.items.map((item, key) => (
                              <SidebarNavLink key={key} item={item} />
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <SidebarNavLink key={key} item={item} />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </Fragment>
        ))}
      </ScrollArea>
    </div>
  );
}
