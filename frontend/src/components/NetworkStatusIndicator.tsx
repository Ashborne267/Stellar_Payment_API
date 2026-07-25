"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useNetworkStatusStore } from "@/lib/network-status-store";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";

// Use CSS animations instead of framer-motion for bundle optimization
// This reduces the bundle size significantly by removing the framer-motion dependency

/**
 * Props for NetworkStatusIndicator component
 */
interface NetworkStatusIndicatorProps {
  showDetails?: boolean;
  autoCheck?: boolean;
  checkInterval?: number;
  onStatusChange?: (status: string) => void;
  showConnectionQuality?: boolean;
  enableMicroInteractions?: boolean;
  enableScreenReaderSupport?: boolean;
  enableKeyboardNavigation?: boolean;
  announcementsEnabled?: boolean;
}

/**
 * Status color mapper - returns Tailwind classes for each status
 */
const getStatusColor = (
  status: string
): {
  dot: string;
  bg: string;
  text: string;
} => {
  const colors: Record<
    string,
    { dot: string; bg: string; text: string }
  > = {
    online: {
      dot: "bg-green-500",
      bg: "bg-green-50",
      text: "text-green-700",
    },
    offline: {
      dot: "bg-red-500",
      bg: "bg-red-50",
      text: "text-red-700",
    },
    slow: {
      dot: "bg-yellow-500",
      bg: "bg-yellow-50",
      text: "text-yellow-700",
    },
    checking: {
      dot: "bg-gray-400",
      bg: "bg-gray-50",
      text: "text-gray-700",
    },
  };

  return colors[status] || colors.checking;
};

/**
 * Get connection quality label and bar width based on latency
 */
const getConnectionQuality = (latency: number): { label: string; barClass: string } => {
  if (latency < 50) return { label: "excellent", barClass: "bg-green-500 w-full" };
  if (latency < 150) return { label: "good", barClass: "bg-green-400 w-3/4" };
  if (latency < 300) return { label: "fair", barClass: "bg-yellow-500 w-1/2" };
  return { label: "poor", barClass: "bg-red-500 w-1/4" };
};

/**
 * Get latency color class based on value
 */
const getLatencyColor = (latency: number): string => {
  if (latency < 100) return "text-green-600";
  if (latency < 300) return "text-yellow-600";
  return "text-red-600";
};

/**
 * NetworkStatusIndicator Component
 *
 * Displays real-time network status with automatic monitoring.
 * Uses Zustand for state management and CSS animations.
 * Includes latency measurement and connection type detection.
 * Fully internationalized with next-intl.
 */
export const NetworkStatusIndicator: React.FC<
  NetworkStatusIndicatorProps
> = ({
  showDetails = true,
  autoCheck = true,
  checkInterval = 30000,
  onStatusChange,
  showConnectionQuality = true,
  enableMicroInteractions = true,
  enableScreenReaderSupport = true,
  enableKeyboardNavigation = true,
  announcementsEnabled = true,
}) => {
  const t = useTranslations();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const { statusRegionRef, detailsRegionRef, refreshButtonRef, handleRefresh } =
    useNetworkMonitor({
      autoCheck,
      checkInterval,
      onStatusChange,
      showConnectionQuality,
      enableScreenReaderSupport,
      enableKeyboardNavigation,
      announcementsEnabled,
    });

  const { status, latency, connectionType, errorMessage } =
    useNetworkStatusStore();

  const colors = getStatusColor(status);
  const statusLabel = t(`network.${status}`) || status;
  const quality = latency !== null ? getConnectionQuality(latency) : null;

  return (
    <div
      ref={statusRegionRef}
      className={`w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm relative overflow-hidden transition-all duration-300 ${
        isHovered && enableMicroInteractions ? 'bg-blue-50 scale-[1.02]' : ''
      } ${
        isFocused && enableMicroInteractions ? 'ring-2 ring-blue-500' : ''
      } ${
        !reducedMotion && (status === 'offline' || status === 'slow') ? 'animate-flash-red' : 
        !reducedMotion && status === 'online' ? 'animate-flash-green' : ''
      }`}
      role="region"
      aria-label={t("network.status")}
      aria-live={enableScreenReaderSupport ? "polite" : "off"}
      aria-atomic="true"
      aria-busy={status === "checking"}
      aria-describedby={showDetails && (latency !== null || errorMessage) ? "network-details" : undefined}
      tabIndex={enableKeyboardNavigation ? 0 : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Enhanced status indicator dot */}
            <div className="relative">
              <div
                className={`h-3 w-3 rounded-full ${colors.dot} transition-all duration-300 ${
                  status === 'online' ? 'animate-pulse' : ''
                } ${
                  status === 'checking' ? 'animate-spin' : ''
                } ${
                  status === 'slow' ? 'animate-pulse' : ''
                }`}
              />

              {/* Monitoring active pulse ring */}
              {autoCheck && !reducedMotion && (
                <div
                  className={`absolute inset-0 h-3 w-3 rounded-full ${colors.dot} opacity-60 animate-ping`}
                />
              )}
            </div>

            {/* Enhanced status label */}
            <div
              key={status}
              className="flex flex-col gap-1 transition-all duration-300"
            >
              <span
                className={`text-sm font-medium ${colors.text} ${
                  status === 'offline' && !reducedMotion ? 'animate-shake' : ''
                }`}
              >
                {statusLabel}
              </span>

              {showDetails && latency !== null && (
                <span
                  className={`text-xs text-gray-500 transition-colors duration-300 ${getLatencyColor(latency)}`}
                >
                  {latency}ms
                  {connectionType && connectionType !== "unknown" && (
                    <span className="ml-2">({connectionType})</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Enhanced refresh button */}
          <button
            ref={refreshButtonRef}
            onClick={handleRefresh}
            className={`relative rounded-md p-1.5 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 ${
              status === 'checking' ? 'animate-spin' : 'hover:scale-105 active:scale-95'
            }`}
            aria-label={t("network.refresh")}
            aria-describedby={status === "checking" ? "refresh-status" : undefined}
            aria-pressed={status === "checking"}
            aria-busy={status === "checking"}
            disabled={status === "checking"}
            onKeyDown={(e) => {
              if (enableKeyboardNavigation && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                handleRefresh();
              }
            }}
          >
            <svg
              className={`h-4 w-4 text-gray-600 ${status === 'checking' ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            
            {/* Loading indicator for refresh button */}
            {status === "checking" && (
              <div
                className="absolute inset-0 rounded-md bg-blue-500 opacity-20 animate-pulse"
              />
            )}
          </button>

          {/* Hidden screen reader status announcements */}
          {enableScreenReaderSupport && (
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {status === "checking" && (
                <div id="refresh-status">{t("network.checking")}</div>
              )}
              {latency !== null && (
                <div>{t("network.latency")}: {latency}ms</div>
              )}
              {connectionType && connectionType !== "unknown" && (
                <div>{t("network.connection")}: {connectionType}</div>
              )}
              {errorMessage && (
                <div role="alert">{t("network.error")}: {errorMessage}</div>
              )}
            </div>
          )}
        </div>

        {/* Enhanced connection quality indicator */}
        {showConnectionQuality && quality && (
          <div className="mt-3 mb-3 transition-all duration-300">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>{t("network.connectionQuality")}:</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${quality.barClass}`}
                />
              </div>
              <span className="font-medium">
                {t(`network.${quality.label}`)}
              </span>
            </div>
          </div>
        )}

        {/* Enhanced detailed information panel */}
        {showDetails && (errorMessage || latency !== null) && (
          <div
            ref={detailsRegionRef}
            id="network-details"
            className="mt-3 border-t border-gray-200 pt-3 transition-all duration-300"
            role="group"
            aria-label={t("network.status")}
            aria-live={enableScreenReaderSupport ? "polite" : "off"}
            aria-atomic="true"
          >
            <div className="space-y-2">
              {latency !== null && (
                <div className="text-xs text-gray-600 transition-all duration-300">
                  <span className="font-medium">
                    {t("network.latency")}:
                  </span>{" "}
                  <span
                    className={`transition-colors duration-300 ${getLatencyColor(latency)}`}
                  >
                    {latency}ms
                  </span>
                </div>
              )}

              {connectionType && connectionType !== "unknown" && (
                <div className="text-xs text-gray-600 transition-all duration-300">
                  <span className="font-medium">
                    {t("network.connection")}:
                  </span>{" "}
                  {connectionType}
                </div>
              )}

              {errorMessage && (
                <div className="rounded bg-red-50 p-2 text-xs text-red-700 transition-all duration-300">
                  <span className="font-medium">
                    {t("network.error")}:
                  </span>{" "}
                  {errorMessage}
                </div>
              )}

              {status === "online" && !errorMessage && (
                <div className="text-xs text-gray-500 transition-all duration-300">
                  {t("network.lastChecked")}:{" "}
                  {new Date().toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkStatusIndicator;