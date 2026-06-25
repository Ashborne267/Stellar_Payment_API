"use client";

import React, { useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useBalanceSync } from "@/hooks/useBalanceSync";

interface RealTimeBalanceSyncProps {
  merchantId?: string | null;
  apiKey?: string | null;
  address?: string | null;
  horizonUrl?: string;
  pollingInterval?: number;
  className?: string;
}

const containerVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: "easeOut" },
  },
  exit: {
    opacity: 0, x: 12,
    transition: { duration: 0.15 },
  },
};

export function RealTimeBalanceSync({
  merchantId,
  apiKey,
  address,
  horizonUrl,
  pollingInterval = 30000,
  className = "",
}: RealTimeBalanceSyncProps) {
  const liveId = useId();
  const shouldReduceMotion = useReducedMotion();

  const {
    balances,
    isLoading,
    lastUpdated,
    error,
    refresh,
    liveRegionText,
    ariaLabel,
  } = useBalanceSync(merchantId, apiKey, {
    address,
    horizonUrl,
    pollingInterval,
    enabled: true,
  });

  const animProps = shouldReduceMotion
    ? { initial: false, animate: {}, variants: undefined }
    : { variants: containerVariants, initial: "hidden", animate: "visible" };

  return (
    <motion.section
      className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}
      aria-label={ariaLabel}
      aria-busy={isLoading}
      {...animProps}
    >
      <div
        id={liveId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveRegionText}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">
          Real-time Balances
        </h2>
        <motion.button
          onClick={refresh}
          disabled={isLoading}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
          aria-label="Refresh balances"
          aria-describedby={liveId}
          className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {isLoading ? "Syncing\u2026" : "Refresh"}
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            role="alert"
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-2 text-xs text-red-600"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {balances.length === 0 && !isLoading ? (
        <motion.p
          key="empty"
          initial={shouldReduceMotion ? undefined : { opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1 }}
          className="text-xs text-gray-500"
          aria-live="polite"
        >
          No balances available.
        </motion.p>
      ) : (
        <motion.ul
          role="list"
          aria-label="Account balances"
          className="divide-y divide-gray-100"
          variants={shouldReduceMotion ? undefined : listVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {balances.map((b) => (
              <motion.li
                key={b.code}
                layout={shouldReduceMotion ? undefined : true}
                variants={shouldReduceMotion ? undefined : itemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center justify-between py-2"
                aria-label={`${b.code} balance: ${b.balance}`}
              >
                <span className="text-sm font-medium text-gray-700">{b.code}</span>
                <motion.span
                  className="text-sm tabular-nums text-gray-900"
                  key={`${b.code}-${b.balance}`}
                  initial={shouldReduceMotion ? undefined : { opacity: 0 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {parseFloat(b.balance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 7,
                  })}
                </motion.span>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {lastUpdated && (
        <motion.p
          className="mt-3 text-xs text-gray-400"
          initial={shouldReduceMotion ? undefined : { opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <span aria-hidden="true">Updated </span>
          <time dateTime={lastUpdated.toISOString()}>
            {lastUpdated.toLocaleTimeString()}
          </time>
        </motion.p>
      )}
    </motion.section>
  );
}

export default RealTimeBalanceSync;
