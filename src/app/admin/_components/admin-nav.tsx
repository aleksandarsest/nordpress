"use client";

import {
  BadgeCheck,
  ChartColumn,
  ClipboardList,
  File,
  Gauge,
  Image,
  Inbox,
  MessageSquare,
  Paintbrush,
  Pin,
  Plug,
  Settings,
  ShoppingBag,
  Sparkles,
  User,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

const ICONS = {
  dashboard: Gauge,
  assistant: Sparkles,
  inbox: Inbox,
  insights: ChartColumn,
  posts: Pin,
  media: Image,
  pages: File,
  comments: MessageSquare,
  forms: ClipboardList,
  shop: ShoppingBag,
  members: BadgeCheck,
  appearance: Paintbrush,
  plugins: Plug,
  tools: Wrench,
  users: Users,
  profile: User,
  settings: Settings,
};

// Matches a nav href against the current location. Hrefs with a query
// (e.g. "?type=page") must match it exactly; plain hrefs don't claim URLs
// that carry a different content type.
function isActive(pathname: string, type: string | null, href: string) {
  const [base, query] = href.split("?");
  const pathMatches =
    base === "/admin" ? pathname === base : pathname.startsWith(base);
  if (!pathMatches) return false;
  const wanted = new URLSearchParams(query).get("type");
  return wanted ? wanted === type : !type || type === "post";
}

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const type = useSearchParams().get("type");

  return (
    <nav className="grid gap-1 text-sm">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active =
          isActive(pathname, type, item.href) ||
          !!item.children?.some((c) => isActive(pathname, type, c.href));
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent",
                active && "bg-sidebar-accent font-medium",
              )}
            >
              <Icon className="size-4" />
              {item.label}
              {item.badge ? (
                <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {item.badge}
                  <span className="sr-only"> pending</span>
                </span>
              ) : null}
            </Link>
            {active && item.children && (
              <div className="mt-1 ml-6 grid gap-0.5">
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={cn(
                      "rounded-md px-2 py-1 text-muted-foreground hover:text-foreground",
                      pathname === child.href.split("?")[0] &&
                        isActive(pathname, type, child.href) &&
                        "text-foreground",
                    )}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
