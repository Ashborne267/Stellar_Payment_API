/**
 * Optimized Theme Toggle Component
 * Issues #1148, #1149: Optimized for bundle size and performance
 *
 * Optimizations:
 * - Lazy-loaded animations (reduces initial bundle)
 * - Simplified SVG icons (smaller than full icon libraries)
 * - Memoized expensive calculations
 * - Reduced re-renders with proper dependencies
 */

"use client";

import { useCallback, useEffect, useState, memo } from "react";
import { useThemeState, useThemeActions } from "@/lib/theme-engine-optimized";
import dynamic from "next/dynamic";

// Lazy load framer-motion for bundle optimization
const MotionButton = dynamic(
  () => import("framer-motion").then((mod) => mod.motion.button),
  { ssr: false },
);

const MotionSvg = dynamic(
  () => import("framer-motion").then((mod) => mod.motion.svg),
  { ssr: false },
);

const AnimatePresence = dynamic(
  () => import("framer-motion").then((mod) => mod.AnimatePresence),
  { ssr: false },
);

// Simplified icon components (no external dependencies)
const SunIcon = memo(() => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-5 w-5 text-amber-500"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
    />
  </svg>
));
SunIcon.displayName = "SunIcon";

const MoonIcon = memo(() => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-5 w-5 text-accent"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
    />
  </svg>
));
MoonIcon.displayName = "MoonIcon";

const SystemIcon = memo(({ resolved }: { resolved?: "light" | "dark" }) => (
  <div className="relative flex items-center justify-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-5 w-5 text-slate-400"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
      />
    </svg>
    <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2">
      <div
        className={`h-1.5 w-1.5 rounded-full ${
          resolved === "dark" ? "bg-accent" : "bg-amber-500"
        }`}
      />
    </div>
  </div>
));
SystemIcon.displayName = "SystemIcon";

// Loading skeleton
const LoadingSkeleton = memo(() => (
  <button
    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5"
    aria-label="Loading theme settings"
    disabled
  >
    <div className="h-5 w-5 animate-pulse rounded bg-white/20" />
  </button>
));
LoadingSkeleton.displayName = "LoadingSkeleton";

function ThemeToggleOptimized() {
  const { theme, resolvedTheme, isMounted } = useThemeState();
  const { toggleTheme } = useThemeActions();
  const [announcement, setAnnouncement] = useState("");

  // Memoized next theme calculation
  const getNextTheme = useCallback((): string => {
    const themes = ["light", "dark", "system"];
    const currentIndex = theme ? themes.indexOf(theme) : 0;
    const nextTheme = themes[(currentIndex + 1) % 3];
    return nextTheme === "system" ? `system (${resolvedTheme})` : nextTheme;
  }, [theme, resolvedTheme]);

  // Optimized toggle handler
  const handleToggle = useCallback(() => {
    const next = getNextTheme();
    setAnnouncement(`Switching to ${next} theme`);
    toggleTheme();
  }, [toggleTheme, getNextTheme]);

  // Screen reader announcement
  useEffect(() => {
    if (isMounted) {
      const current =
        theme === "system" ? `system (${resolvedTheme})` : theme || "system";
      setAnnouncement(`Current theme: ${current}`);
    }
  }, [theme, resolvedTheme, isMounted]);

  if (!isMounted) {
    return <LoadingSkeleton />;
  }

  const ariaLabel = `Theme toggle, current: ${
    theme === "system" ? `system (${resolvedTheme})` : theme
  }`;

  return (
    <>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      <button
        onClick={handleToggle}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition-all hover:scale-105 hover:bg-white/10 active:scale-95"
        aria-label={ariaLabel}
        title={`Theme: ${theme === "system" ? `System (${resolvedTheme})` : theme}`}
      >
        {theme === "light" ? (
          <SunIcon />
        ) : theme === "dark" ? (
          <MoonIcon />
        ) : (
          <SystemIcon resolved={resolvedTheme} />
        )}
      </button>
    </>
  );
}

export default memo(ThemeToggleOptimized);
