"use client";

/**
 * NetworkStatusIndicator
 *
 * Displays the live health of the Stellar/Horizon network with rich
 * interactive loading states:
 *
 * States handled:
 *   "unknown"        — initial, never polled yet → skeleton-like pulse dot
 *   "checking"       — in-flight request → spinning dot + translucent badge
 *   "operational"    — green dot, fast latency
 *   "degraded"       — amber dot, elevated latency
 *   "partial_outage" — orange dot, some services down
 *   "major_outage"   — red dot, critical services down
 *   "offline"        — red dot + error banner with retry + dismiss
 *
 * Variants:
 *   compact  — pill badge for nav/sidebar (dot + text only)
 *   full     — card with latency, ledger, last-checked, and expand/collapse
 *
 * Accessibility:
 *   - role="status" aria-live="polite" for health change announcements
 *   - aria-busy during in-flight checks
 *   - All interactive elements have translated aria-labels
 *   - Reduced-motion: spinner and pulse animations disabled
 */

import React, { memo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useNetworkStatus, type UseNetworkStatusOptions } from "@/hooks/useNetworkStatus";
import {
  healthToColor,
  type NetworkHealth,
} from "@/lib/network-status";

// ── Sub-components ────────────────────────────────────────────────────────────

/** Animated status dot — CSS-only, no framer-motion. */
const StatusDot = memo(function StatusDot({
  health,
  dotClass,
  prefersReducedMotion,
}: {
  health: NetworkHealth;
  dotClass: string;
  prefersReducedMotion: boolean;
}) {
  const isPulse = health === "operational" && !prefersReducedMotion;
  const isSpin  = health === "checking"    && !prefersReducedMotion;

  return (
    <span className="relative inline-flex h-2.5 w-2.5 flex-shrink-0" aria-hidden="true">
      {isPulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotClass}`}
        />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass} ${
          isSpin ? "animate-spin opacity-80" : ""
        }`}
      />
    </span>
  );
});

/** Translated status label string. */
function useStatusLabel(
  health: NetworkHealth,
  t: (key: string) => string,
): string {
  switch (health) {
    case "operational":    return t("statusOperational");
    case "degraded":       return t("statusDegraded");
    case "partial_outage": return t("statusPartialOutage");
    case "major_outage":   return t("statusMajorOutage");
    case "offline":        return t("statusOffline");
    case "checking":       return t("statusChecking");
    default:               return t("statusUnknown");
  }
}

/** Translated tooltip string. */
function useTooltip(health: NetworkHealth, t: (key: string) => string): string {
  switch (health) {
    case "operational":    return t("tooltipOperational");
    case "degraded":       return t("tooltipDegraded");
    case "partial_outage": return t("tooltipPartialOutage");
    case "major_outage":   return t("tooltipMajorOutage");
    case "offline":        return t("tooltipOffline");
    case "checking":       return t("tooltipChecking");
    default:               return t("tooltipChecking");
  }
}

/** Inline spinner for the manual-check button. */
const Spinner = memo(function Spinner({ size = "h-3.5 w-3.5" }: { size?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-current border-t-transparent ${size} animate-spin`}
      aria-hidden="true"
    />
  );
});

// ── Props ─────────────────────────────────────────────────────────────────────

export interface NetworkStatusIndicatorProps extends UseNetworkStatusOptions {
  /** Compact pill variant for nav/sidebar. Default: false. */
  compact?: boolean;
  /** Show the expand/collapse details panel. Default: true (full variant). */
  showDetails?: boolean;
  /** Extra className on the root element. */
  className?: string;
  /** Override the Horizon URL label shown in the details panel. */
  networkName?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export const NetworkStatusIndicator = memo(function NetworkStatusIndicator({
  compact = false,
  showDetails = true,
  className = "",
  networkName,
  ...hookOptions
}: NetworkStatusIndicatorProps) {
  const t = useTranslations("networkStatus");

  const {
    health,
    lastResult,
    errorMessage,
    isLoading,
    hasError,
    isManualCheck,
    isPolling,
    consecutiveErrors,
    lastCheckedLabel,
    checkNow,
    dismissError,
    pausePolling,
    resumePolling,
    announcement,
  } = useNetworkStatus(hookOptions);

  const [isExpanded, setIsExpanded] = useState(false);
  const [prefersReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  const colors     = healthToColor(health);
  const statusLabel = useStatusLabel(health, t as (key: string) => string);
  const tooltip     = useTooltip(health, t as (key: string) => string);
  const displayName = networkName ??
    (hookOptions.horizonUrl?.includes("testnet") ? t("testnet") : t("mainnet"));

  const toggleExpand = useCallback(
    () => setIsExpanded((v) => !v),
    [],
  );

  // ── Compact pill variant ──────────────────────────────────────────────────

  if (compact) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        {/* sr-only live region */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        <button
          type="button"
          onClick={checkNow}
          disabled={isLoading}
          aria-label={t("ariaLabel")}
          aria-busy={isLoading}
          title={tooltip}
          className={`
            inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
            text-xs font-semibold transition-colors duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400
            focus-visible:ring-offset-2
            ${colors.badge} ${colors.border} ${colors.text}
            disabled:cursor-wait
          `}
          data-testid="network-status-compact"
        >
          <StatusDot
            health={health}
            dotClass={colors.dot}
            prefersReducedMotion={prefersReducedMotion}
          />
          <span>
            {isLoading && isManualCheck ? t("checking") : statusLabel}
          </span>
          {isLoading && isManualCheck && (
            <Spinner size="h-3 w-3" />
          )}
        </button>
      </div>
    );
  }

  // ── Full card variant ─────────────────────────────────────────────────────

  return (
    <div
      className={`w-full rounded-2xl border transition-colors duration-300 ${colors.border}
        bg-white dark:bg-pluto-900/80
        shadow-[0_4px_16px_rgba(13,27,46,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.25)]
        ${className}`}
      data-testid="network-status-card"
    >
      {/* sr-only live region */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="sr-announcement"
      >
        {announcement}
      </div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 p-4">
        {/* Left: dot + label */}
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusDot
            health={health}
            dotClass={colors.dot}
            prefersReducedMotion={prefersReducedMotion}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0A0A0A] dark:text-pluto-50 truncate">
              {t("label")}
            </p>
            <p className={`text-xs font-medium truncate ${colors.text}`}>
              {isLoading && !isManualCheck ? t("loading") : statusLabel}
            </p>
          </div>
        </div>

        {/* Right: network badge + expand button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`hidden sm:inline-flex items-center rounded-full border px-2 py-0.5
              text-[0.65rem] font-bold uppercase tracking-wide
              ${colors.badge} ${colors.border} ${colors.text}`}
            aria-hidden="true"
          >
            {displayName}
          </span>

          {showDetails && (
            <button
              type="button"
              onClick={toggleExpand}
              aria-label={isExpanded ? t("collapsePanel") : t("expandPanel")}
              aria-expanded={isExpanded}
              className="rounded-lg p-1 text-[#6B6B6B] transition-colors hover:bg-pluto-50
                hover:text-pluto-700 dark:hover:bg-pluto-800/50 dark:hover:text-pluto-200
                focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400"
              data-testid="expand-button"
            >
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {hasError && errorMessage && (
        <div
          className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-red-200
            bg-red-50 p-3 dark:border-red-800/50 dark:bg-red-950/40"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          data-testid="error-banner"
        >
          <svg
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500 dark:text-red-400"
            fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"
          >
            <path fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-red-800 dark:text-red-300">
              {t("errorHeading")}
            </p>
            <p className="mt-0.5 text-xs text-red-700 dark:text-red-400 break-words">
              {errorMessage}
            </p>
            {consecutiveErrors > 1 && (
              <p className="mt-0.5 text-xs text-red-500" data-testid="retry-count">
                {t("retryCount", { count: consecutiveErrors })}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={checkNow}
              disabled={isLoading}
              className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-semibold
                text-red-700 transition-colors hover:bg-red-50 focus:outline-none
                focus-visible:ring-2 focus-visible:ring-red-400
                dark:border-red-700/60 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/30
                disabled:cursor-wait disabled:opacity-60"
              data-testid="retry-button"
            >
              {isLoading ? <Spinner /> : t("retry")}
            </button>
            <button
              type="button"
              onClick={dismissError}
              aria-label={t("dismiss")}
              className="rounded-md p-1 text-red-400 transition-colors hover:bg-red-100
                hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400
                dark:hover:bg-red-900/30"
              data-testid="dismiss-button"
            >
              <svg
                className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2} aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-4 pb-3 text-xs">
        {/* Left: latency + ledger */}
        <div className="flex items-center gap-3 text-[#6B6B6B] dark:text-pluto-400">
          {lastResult?.latencyMs != null && (
            <span
              aria-label={t("latencyLabel", { ms: lastResult.latencyMs })}
              data-testid="latency-value"
            >
              {t("latency", { ms: lastResult.latencyMs })}
            </span>
          )}
          {lastResult?.ledgerSequence != null && (
            <span
              aria-label={t("ledgerLabel", { sequence: lastResult.ledgerSequence })}
              data-testid="ledger-value"
            >
              {t("ledger", { sequence: lastResult.ledgerSequence })}
            </span>
          )}
          {isLoading && !lastResult && (
            <span className="flex items-center gap-1" aria-live="polite">
              <Spinner size="h-3 w-3" />
              <span className="text-pluto-500 dark:text-pluto-300">{t("loading")}</span>
            </span>
          )}
        </div>

        {/* Right: last-checked + check-now button */}
        <div className="flex items-center gap-2">
          {lastCheckedLabel && (
            <span
              className="text-[#6B6B6B] dark:text-pluto-400 hidden xs:inline"
              data-testid="last-checked"
            >
              {t("lastChecked", { time: lastCheckedLabel })}
            </span>
          )}
          {!lastCheckedLabel && (
            <span className="text-[#6B6B6B] dark:text-pluto-400 hidden xs:inline">
              {t("lastCheckedNever")}
            </span>
          )}

          <button
            type="button"
            onClick={checkNow}
            disabled={isLoading}
            aria-label={t("checkNow")}
            aria-busy={isLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-pluto-200
              bg-white px-2 py-1 font-semibold text-pluto-700 transition-colors
              hover:bg-pluto-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400
              dark:border-pluto-700 dark:bg-transparent dark:text-pluto-300 dark:hover:bg-pluto-800/50
              disabled:cursor-wait disabled:opacity-60"
            data-testid="check-now-button"
          >
            {isLoading ? (
              <Spinner size="h-3 w-3" />
            ) : (
              <svg
                className="h-3 w-3" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2.5} aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
            <span>{isLoading ? t("checking") : t("checkNow")}</span>
          </button>
        </div>
      </div>

      {/* ── Expanded details panel ───────────────────────────────────────── */}
      {isExpanded && showDetails && (
        <div
          className="border-t border-pluto-100 dark:border-pluto-800/60 px-4 py-3 space-y-2"
          data-testid="details-panel"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6B6B] dark:text-pluto-400">
            {t("detailsHeading")}
          </p>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[#6B6B6B] dark:text-pluto-400">{t("horizonUrl")}</dt>
              <dd
                className="truncate font-mono text-[#0A0A0A] dark:text-pluto-100 max-w-[55%] text-right"
                title={lastResult?.horizonUrl ?? hookOptions.horizonUrl}
              >
                {lastResult?.horizonUrl ?? hookOptions.horizonUrl ?? "—"}
              </dd>
            </div>
            {lastResult?.httpStatus != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-[#6B6B6B] dark:text-pluto-400">HTTP</dt>
                <dd className={`font-semibold ${colors.text}`}>
                  {lastResult.httpStatus}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-[#6B6B6B] dark:text-pluto-400">{t("pollingActive")}</dt>
              <dd className="font-semibold text-[#0A0A0A] dark:text-pluto-100">
                {isPolling ? "✓" : "—"}
              </dd>
            </div>
          </dl>

          {/* Polling controls */}
          <div className="flex gap-2 pt-1">
            {isPolling ? (
              <button
                type="button"
                onClick={pausePolling}
                className="rounded-lg border border-pluto-200 bg-white px-2.5 py-1 text-xs
                  font-semibold text-pluto-700 transition-colors hover:bg-pluto-50
                  dark:border-pluto-700 dark:bg-transparent dark:text-pluto-300 dark:hover:bg-pluto-800/50
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400"
                data-testid="pause-polling-button"
              >
                {t("pollingPaused").replace("paused", "pause")}
              </button>
            ) : (
              <button
                type="button"
                onClick={resumePolling}
                className="rounded-lg border border-pluto-200 bg-white px-2.5 py-1 text-xs
                  font-semibold text-pluto-700 transition-colors hover:bg-pluto-50
                  dark:border-pluto-700 dark:bg-transparent dark:text-pluto-300 dark:hover:bg-pluto-800/50
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400"
                data-testid="resume-polling-button"
              >
                {t("pollingActive").replace("active", "resume")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default NetworkStatusIndicator;
