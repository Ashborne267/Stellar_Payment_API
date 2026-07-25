"use client";

import React, { useId } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { useBalanceSync } from "@/hooks/useBalanceSync";

interface RealTimeBalanceSyncProps {
  merchantId?: string | null;
  apiKey?: string | null;
  address?: string | null;
  horizonUrl?: string;
  pollingInterval?: number;
  className?: string;
}

const containerVariants: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

const listVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const itemVariants: Variants = {
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
  const locale = useLocale();
  const t = useTranslations("realTimeBalanceSync");
  const shouldReduceMotion = useReducedMotion();

  const {
    balances,
    isLoading,
    lastUpdated,
    error,
    refresh,
  } = useBalanceSync(merchantId, apiKey, {
    address,
    horizonUrl,
    pollingInterval,
    enabled: true,
  });

  const liveRegionText = isLoading
    ? t("liveRegion.syncing")
    : error
      ? t("liveRegion.error", { error })
      : lastUpdated
        ? t("liveRegion.updatedAt", {
            time: lastUpdated.toLocaleTimeString(locale, {
              hour: "numeric",
              minute: "2-digit",
            }),
          })
        : "";

  const animProps = shouldReduceMotion
    ? { initial: false, animate: {}, variants: undefined }
    : { variants: containerVariants, initial: "hidden", animate: "visible" };

  return (
    <motion.section
      className={`w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 ease-out ${className}`}
      aria-label={t("sectionAriaLabel")}
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

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          {t("title")}
        </h2>
        <motion.button
          onClick={refresh}
          disabled={isLoading}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
          aria-label={t("refreshButton")}
          aria-describedby={liveId}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? t("syncing") : t("refreshButton")}
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
          className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-500"
          aria-live="polite"
        >
          {t("emptyState")}
        </motion.p>
      ) : (
        <motion.ul
          role="list"
          aria-label={t("balancesListAriaLabel")}
          className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 divide-y divide-slate-100"
          variants={shouldReduceMotion ? undefined : listVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {balances.map((b) => {
              const formattedBalance = parseFloat(b.balance).toLocaleString(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              });

              return (
                <motion.li
                  key={b.code}
                  layout={shouldReduceMotion ? undefined : true}
                  variants={shouldReduceMotion ? undefined : itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex items-center justify-between gap-4 py-3 px-3"
                  aria-label={t("balanceItemAriaLabel", {
                    asset: b.code,
                    balance: formattedBalance,
                  })}
                >
                  <span className="text-sm font-medium text-slate-700">{b.code}</span>
                  <motion.span
                    className="text-sm tabular-nums text-slate-900"
                    key={`${b.code}-${b.balance}`}
                    initial={shouldReduceMotion ? undefined : { opacity: 0 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    {formattedBalance}
                  </motion.span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}

      {lastUpdated && (
        <motion.p
          className="mt-3 text-xs text-slate-400"
          initial={shouldReduceMotion ? undefined : { opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <span className="font-medium text-slate-500">{t("updatedLabel")}</span>{" "}
          <time dateTime={lastUpdated.toISOString()}>
            {lastUpdated.toLocaleTimeString(locale, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </motion.p>
      )}
    </motion.section>
  );
}

export default RealTimeBalanceSync;
