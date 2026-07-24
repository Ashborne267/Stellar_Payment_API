import { useCallback, useEffect, useState } from "react";
import { useThemeState, useThemeActions } from "@/lib/theme-context";
import { useTranslations } from "next-intl";

export type LoadingState = "idle" | "loading" | "success" | "error";

export function useAccessibilityContrast() {
  const { theme, resolvedTheme, isMounted, isLoading, error } = useThemeState();
  const { toggleTheme, clearError } = useThemeActions();
  const t = useTranslations("accessibility");

  const [announcement, setAnnouncement] = useState<string>("");
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");

  const getNextTheme = useCallback((): string => {
    const themes = ["light", "dark", "system"];
    const currentIndex = theme ? themes.indexOf(theme) : 0;
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    return nextTheme === "system"
      ? t("systemTheme", { theme: resolvedTheme })
      : t(`theme.${nextTheme}`);
  }, [theme, resolvedTheme, t]);

  const handleContrastToggle = useCallback(async () => {
    if (error) {
      clearError();
      setLoadingState("idle");
      setAnnouncement(t("errorCleared"));
      return;
    }

    setLoadingState("loading");
    const nextTheme = getNextTheme();
    setAnnouncement(t("switchingTo", { theme: nextTheme }));

    try {
      await toggleTheme();
      setLoadingState("success");

      setTimeout(() => {
        setLoadingState("idle");
        setAnnouncement(t("themeChanged", { theme: nextTheme }));
      }, 500);
    } catch {
      setLoadingState("error");
      setAnnouncement(t("themeError"));
      setTimeout(() => setLoadingState("idle"), 2000);
    }
  }, [toggleTheme, error, clearError, t, getNextTheme]);

  useEffect(() => {
    if (isMounted && !isLoading && !error) {
      const currentThemeDesc = theme === "system"
        ? t("systemTheme", { theme: resolvedTheme })
        : t(`theme.${theme}`);
      setAnnouncement(t("currentTheme", { theme: currentThemeDesc }));
    }
  }, [theme, resolvedTheme, isMounted, isLoading, error, t]);

  const getAriaLabel = useCallback(() => {
    if (error) return t("ariaError");
    const currentThemeDesc = theme === "system"
      ? t("systemTheme", { theme: resolvedTheme })
      : t(`theme.${theme}`);
    return t("ariaLabel", { theme: currentThemeDesc });
  }, [error, theme, resolvedTheme, t]);

  const getTitle = useCallback(() => {
    if (error) return t("errorTitle", { error });
    if (theme === "system") return t("titleSystem", { theme: resolvedTheme });
    return t(`title.${theme}`);
  }, [error, theme, resolvedTheme, t]);

  return {
    theme,
    resolvedTheme,
    isMounted,
    isLoading,
    error,
    announcement,
    loadingState,
    getNextTheme,
    handleContrastToggle,
    getAriaLabel,
    getTitle,
  };
}
