"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

type MobileItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
  icon: JSX.Element;
};

export default function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations("breadcrumbs.segments");

  const navItems: MobileItem[] = [
    {
      href: "/dashboard",
      label: t("dashboard"),
      isActive: (currentPath) => {
        return currentPath === "/dashboard" || (currentPath.startsWith("/dashboard/") && !currentPath.startsWith("/dashboard/create"));
      },
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-8 9 8M5 10v10h14V10" />
        </svg>
      )
    },
    {
      href: "/payments",
      label: t("payments"),
      isActive: (currentPath) => currentPath.startsWith("/payments"),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      href: "/dashboard/create",
      label: t("create"),
      isActive: (currentPath) => currentPath.startsWith("/dashboard/create"),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      )
    },
    {
      href: "/settings",
      label: t("settings"),
      isActive: (currentPath) => currentPath.startsWith("/settings"),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.983 5.5a1 1 0 011.934 0l.354 1.278a1 1 0 00.95.735h1.334a1 1 0 01.83 1.555l-.82 1.22a1 1 0 000 1.114l.82 1.22a1 1 0 01-.83 1.555h-1.334a1 1 0 00-.95.735l-.354 1.278a1 1 0 01-1.934 0l-.354-1.278a1 1 0 00-.95-.735H8.74a1 1 0 01-.83-1.555l.82-1.22a1 1 0 000-1.114l-.82-1.22A1 1 0 018.74 8.013h1.334a1 1 0 00.95-.735l.354-1.278z" />
          <circle cx="12" cy="12" r="2.5" strokeWidth={2} />
        </svg>
      )
    }
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/80 pb-[max(env(safe-area-inset-bottom),0.4rem)] backdrop-blur-md lg:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {navItems.map((item) => {
          const active = item.isActive(pathname);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex h-full flex-col items-center justify-center gap-1 transition-colors ${
                  active ? "text-mint" : "text-slate-400 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.icon}
                <span className="text-[10px] uppercase tracking-wider">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
