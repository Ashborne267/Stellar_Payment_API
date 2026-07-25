/**
 * React Server Components Theme Engine
 * Issue #1145: Migrate component to React Server Components for Dark Mode Theme Engine
 *
 * This module provides server-side theme initialization and metadata for RSC.
 * The theme context is hydrated on the client while the theme metadata is set server-side.
 */

import { type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeRSCProviderProps {
  readonly children: ReactNode;
  readonly defaultTheme?: ThemeMode;
  readonly storageKey?: string;
  readonly forcedTheme?: ResolvedTheme;
}

/**
 * Server-side theme metadata generator
 * This runs on the server and provides initial theme data without hydration mismatch
 */
export function getInitialThemeMetadata(
  defaultTheme: ThemeMode = "system",
  forcedTheme?: ResolvedTheme
): {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colorScheme: string;
} {
  // On server, we default to light theme to avoid hydration mismatch
  // The client will override this with the actual user preference
  const resolvedTheme = forcedTheme || "light";

  return {
    theme: defaultTheme,
    resolvedTheme,
    colorScheme: resolvedTheme,
  };
}

/**
 * Server Component wrapper for theme provider
 * Handles server-side theme initialization before client hydration
 */
export async function ThemeRSCProvider({
  children,
  defaultTheme = "system",
  storageKey = "merchant-theme-preference",
  forcedTheme,
}: ThemeRSCProviderProps): Promise<JSX.Element> {
  const metadata = getInitialThemeMetadata(defaultTheme, forcedTheme);

  return (
    <>
      {/* Inject initial theme styles as critical CSS to prevent flash */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              color-scheme: ${metadata.colorScheme};
            }

            :root.dark {
              color-scheme: dark;
            }

            :root.light {
              color-scheme: light;
            }
          `,
        }}
        suppressHydrationWarning
      />

      {/* Inject script to read stored theme before React hydration */}
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                const stored = localStorage.getItem('${storageKey}');
                const themes = ['light', 'dark', 'system'];
                let theme = stored && themes.includes(stored) ? stored : '${defaultTheme}';

                if (theme === 'system') {
                  theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }

                const root = document.documentElement;
                root.classList.remove('light', 'dark');
                root.classList.add(theme);
                root.style.colorScheme = theme;
              } catch (e) {
                console.error('Theme initialization error:', e);
              }
            })();
          `,
        }}
      />

      {children}
    </>
  );
}
