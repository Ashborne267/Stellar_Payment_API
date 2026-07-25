"use client";

/**
 * OnboardingProgressTracker
 *
 * Refactored for:
 * - Full i18n via the "onboarding" next-intl namespace
 * - Dark mode support via .dark CSS variable overrides and Tailwind dark: variants
 * - Mobile-first responsive layout (vertical default → horizontal on sm+)
 * - Improved accessibility: ARIA live regions, aria-current, aria-busy,
 *   aria-setsize/aria-posinset, aria-roledescription, focus-visible rings
 * - Optimistic step navigation with rollback (via useOnboardingProgress)
 * - prefers-reduced-motion respected for all framer-motion animations
 * - StepIcon sub-component for clean icon rendering
 * - Connector lines between vertical steps
 */

import React, { memo } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { useTranslations } from "next-intl";
import {
  useOnboardingProgress,
  type OnboardingStep,
} from "@/hooks/useOnboardingProgress";

// ── Re-export types so consumers only need one import ─────────────────────────
export type { OnboardingStep };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface OnboardingProgressTrackerProps {
  steps: OnboardingStep[];
  currentStep?: string;
  onStepChange?: (stepId: string) => void | Promise<void>;
  onComplete?: () => void;
  /** Show numeric labels inside the step indicator circles. Default: true. */
  showStepNumbers?: boolean;
  /** Stack direction. Default: "vertical". */
  orientation?: "vertical" | "horizontal";
  /** Compact padding variant. Default: false. */
  compact?: boolean;
  /** Optional extra className on the root wrapper. */
  className?: string;
}

// ── Animation variants ────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const stepVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit:   { opacity: 0, x: 16,  transition: { duration: 0.2 } },
};

const stepVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit:   { opacity: 0, transition: { duration: 0.1 } },
};

const progressBarVariants: Variants = {
  hidden: { scaleX: 0, originX: 0 },
  visible: { scaleX: 1, originX: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

const progressBarVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
};

const checkMarkVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1, opacity: 1,
    transition: { type: "spring", stiffness: 280, damping: 22, delay: 0.15 },
  },
};

const checkMarkVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
};

const completionVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit:   { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

const completionVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit:   { opacity: 0, transition: { duration: 0.1 } },
};

// ── StepIcon sub-component ────────────────────────────────────────────────────

interface StepIconProps {
  completed: boolean;
  isCurrent: boolean;
  isPending: boolean;
  number: number;
  showNumber: boolean;
  compact: boolean;
  checkVariants: Variants;
  prefersReducedMotion: boolean | null;
}

const StepIcon = memo(function StepIcon({
  completed,
  isCurrent,
  isPending,
  number,
  showNumber,
  compact,
  checkVariants,
  prefersReducedMotion,
}: StepIconProps) {
  const size = compact ? "h-8 w-8" : "h-10 w-10";

  return (
    <AnimatePresence mode="wait">
      {completed ? (
        <motion.span
          key="check"
          className={`absolute inset-0 flex items-center justify-center ${size}`}
          variants={checkVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Checkmark icon */}
          <svg
            className={compact ? "h-4 w-4" : "h-5 w-5"}
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </motion.span>
      ) : isPending ? (
        <motion.span
          key="spinner"
          className="absolute inset-0 flex items-center justify-center"
          animate={prefersReducedMotion ? {} : { rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <svg
            className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-pluto-500`}
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </motion.span>
      ) : (
        <motion.span
          key="number"
          className={`absolute inset-0 flex items-center justify-center ${
            compact ? "text-xs" : "text-sm"
          } font-semibold ${isCurrent ? "text-pluto-700 dark:text-pluto-300" : "text-pluto-600 dark:text-pluto-400"}`}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden="true"
        >
          {showNumber ? number : ""}
        </motion.span>
      )}
    </AnimatePresence>
  );
});

// ── Status badge sub-component ────────────────────────────────────────────────

interface StatusBadgeProps {
  completed: boolean;
  isCurrent: boolean;
  compact: boolean;
  completedLabel: string;
  inProgressLabel: string;
  pendingLabel: string;
  prefersReducedMotion: boolean | null;
}

const StatusBadge = memo(function StatusBadge({
  completed,
  isCurrent,
  compact,
  completedLabel,
  inProgressLabel,
  pendingLabel,
  prefersReducedMotion,
}: StatusBadgeProps) {
  const label = completed ? completedLabel : isCurrent ? inProgressLabel : pendingLabel;

  const colorClass = completed
    ? "bg-pluto-100 text-pluto-800 dark:bg-pluto-900/40 dark:text-pluto-200"
    : isCurrent
      ? "bg-pluto-200 text-pluto-900 dark:bg-pluto-800/50 dark:text-pluto-100"
      : "bg-pluto-50 text-pluto-700 dark:bg-pluto-900/20 dark:text-pluto-300 group-hover:bg-pluto-100 dark:group-hover:bg-pluto-900/40";

  return (
    <motion.span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${
        compact ? "text-[0.65rem]" : "text-xs"
      } ${colorClass}`}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: prefersReducedMotion ? 0 : 0.12 }}
      aria-label={label}
    >
      {label}
    </motion.span>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export const OnboardingProgressTracker = memo(function OnboardingProgressTracker({
  steps,
  currentStep,
  onStepChange,
  onComplete,
  showStepNumbers = true,
  orientation = "vertical",
  compact = false,
  className = "",
}: OnboardingProgressTrackerProps) {
  const t = useTranslations("onboarding");
  const prefersReducedMotion = useReducedMotion();

  const {
    sortedSteps,
    effectiveCurrentStep,
    state,
    progressPercent,
    completedCount,
    isComplete,
    progressSummaryId,
    handleStepClick,
  } = useOnboardingProgress({ steps, currentStep, onStepChange, onComplete });

  // Pick motion variants based on reduced-motion preference
  const activeStepVariants       = prefersReducedMotion ? stepVariantsReduced       : stepVariants;
  const activeProgressBarVariants = prefersReducedMotion ? progressBarVariantsReduced : progressBarVariants;
  const activeCheckMarkVariants  = prefersReducedMotion ? checkMarkVariantsReduced  : checkMarkVariants;
  const activeCompletionVariants = prefersReducedMotion ? completionVariantsReduced : completionVariants;

  // Translated step aria-label builder
  const buildStepAriaLabel = (step: OnboardingStep, index: number): string => {
    if (step.completed && step.required) {
      return t("stepLabelCompletedRequired", { number: index + 1, title: step.title });
    }
    if (step.completed) {
      return t("stepLabelCompleted", { number: index + 1, title: step.title });
    }
    if (step.required) {
      return t("stepLabelRequired", { number: index + 1, title: step.title });
    }
    return t("stepLabel", { number: index + 1, title: step.title });
  };

  return (
    <div
      className={`w-full ${className}`}
      role="region"
      aria-label={t("progressTracker")}
      aria-live="polite"
      aria-atomic="false"
    >
      {/* Hidden progress summary for AT */}
      <p id={progressSummaryId} className="sr-only">
        {t("stepsCompleted", { completed: completedCount, total: sortedSteps.length })}{" "}
        {t("percentComplete", { percent: progressPercent })}
      </p>

      {/* Screen-reader live announcement region */}
      <div
        className="sr-only"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="sr-announcement"
      >
        {state.announcementText}
      </div>

      {/* Pending spinner announcement */}
      {state.isPending && (
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {t("updating")}
        </div>
      )}

      {/* ── Card ──────────────────────────────────────────────────────────── */}
      <div
        className={`
          rounded-2xl border
          border-pluto-100 dark:border-pluto-800/60
          bg-gradient-to-b from-white to-pluto-50/60
          dark:from-pluto-900/80 dark:to-pluto-900/60
          shadow-[0_8px_32px_rgba(13,27,46,0.06)]
          dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
          transition-colors duration-300
          ${compact ? "p-4" : "p-5 sm:p-6"}
        `}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              className={`font-semibold text-pluto-900 dark:text-pluto-50 ${
                compact ? "text-base" : "text-lg"
              }`}
            >
              {t("title")}
            </h2>
            <span
              className="shrink-0 text-sm font-semibold tabular-nums text-pluto-600 dark:text-pluto-300"
              aria-hidden="true"
            >
              {t("percentComplete", { percent: progressPercent })}
            </span>
          </div>

          <p className={`mt-1 text-[#6B6B6B] dark:text-pluto-400 ${compact ? "text-xs" : "text-sm"}`}>
            {t("subtitle")}
          </p>

          {/* Progress bar */}
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-pluto-100 dark:bg-pluto-800"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("progressBar")}
            aria-describedby={progressSummaryId}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-pluto-400 via-pluto-500 to-pluto-600 dark:from-pluto-500 dark:via-pluto-400 dark:to-pluto-300"
              variants={activeProgressBarVariants}
              initial="hidden"
              animate="visible"
              style={{ width: `${progressPercent}%` }}
              data-testid="progress-bar-fill"
            />
          </div>

          {/* Step count summary */}
          <p
            className="mt-1.5 flex items-center gap-1.5 text-xs text-[#6B6B6B] dark:text-pluto-400"
            aria-hidden="true"
          >
            <span>
              {t("stepsCompleted", {
                completed: completedCount,
                total: sortedSteps.length,
              })}
            </span>
            {isComplete && (
              <span className="inline-flex items-center gap-1 font-semibold text-pluto-600 dark:text-pluto-300">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("allCompleted")}
              </span>
            )}
          </p>
        </div>

        {/* ── Steps list ───────────────────────────────────────────────────── */}
        <motion.ol
          className={
            orientation === "horizontal"
              ? "flex flex-col gap-3 sm:flex-row sm:gap-2"
              : "flex flex-col gap-1"
          }
          role="list"
          aria-label={t("stepsList")}
          aria-orientation={orientation}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {sortedSteps.map((step, index) => {
              const isCurrent  = effectiveCurrentStep === step.id;
              const isPending  = state.isPending && isCurrent;
              const stepDescId = `${progressSummaryId}-desc-${index}`;

              const indicatorColor = step.completed
                ? "border-pluto-500 bg-pluto-100 text-pluto-800 shadow-[0_4px_12px_rgba(74,111,165,0.18)] dark:border-pluto-400 dark:bg-pluto-800/60 dark:text-pluto-100"
                : isCurrent
                  ? "border-pluto-600 bg-pluto-50 text-pluto-700 shadow-[0_4px_12px_rgba(74,111,165,0.14)] dark:border-pluto-400 dark:bg-pluto-900/60 dark:text-pluto-200"
                  : "border-pluto-200 bg-white text-pluto-600 dark:border-pluto-700 dark:bg-pluto-900/40 dark:text-pluto-400 group-hover:border-pluto-400 group-hover:bg-pluto-50 group-hover:shadow-[0_4px_12px_rgba(13,27,46,0.08)] dark:group-hover:border-pluto-500 dark:group-hover:bg-pluto-800/50";

              return (
                <motion.li
                  key={step.id}
                  role="listitem"
                  variants={activeStepVariants}
                  className={`
                    group relative rounded-2xl border border-transparent
                    px-3 py-2.5
                    transition-colors duration-200
                    hover:border-pluto-100 hover:bg-white/80
                    dark:hover:border-pluto-800/60 dark:hover:bg-pluto-900/50
                    focus-within:border-pluto-200 dark:focus-within:border-pluto-700
                    ${orientation === "horizontal" ? "flex flex-1 flex-col gap-2 sm:items-center" : "flex flex-row gap-3"}
                  `}
                  animate={
                    isCurrent && !prefersReducedMotion
                      ? { boxShadow: "0 0 0 2px rgba(74,111,165,0.2)" }
                      : { boxShadow: "none" }
                  }
                  transition={{ duration: 0.2 }}
                >
                  {/* Step indicator button */}
                  <button
                    type="button"
                    onClick={() => handleStepClick(step.id)}
                    className={`
                      relative flex-shrink-0
                      ${compact ? "h-8 w-8" : "h-10 w-10"}
                      rounded-full border-2 font-semibold
                      transition-all duration-200
                      focus:outline-none focus-visible:ring-2
                      focus-visible:ring-pluto-400 focus-visible:ring-offset-2
                      focus-visible:ring-offset-white dark:focus-visible:ring-offset-pluto-900
                      ${indicatorColor}
                    `}
                    aria-label={buildStepAriaLabel(step, index)}
                    aria-pressed={isCurrent}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-setsize={sortedSteps.length}
                    aria-posinset={index + 1}
                    aria-roledescription="onboarding step"
                    aria-describedby={stepDescId}
                    aria-busy={isPending}
                    aria-disabled={state.isPending ? "true" : undefined}
                    disabled={state.isPending}
                  >
                    <StepIcon
                      completed={step.completed}
                      isCurrent={isCurrent}
                      isPending={isPending}
                      number={index + 1}
                      showNumber={showStepNumbers}
                      compact={compact}
                      checkVariants={activeCheckMarkVariants}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  </button>

                  {/* Step content */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3
                      id={stepDescId}
                      className={`
                        font-medium leading-tight
                        transition-colors duration-200
                        ${step.completed
                          ? "text-pluto-600 line-through dark:text-pluto-400"
                          : "text-pluto-900 dark:text-pluto-50 group-hover:text-pluto-800 dark:group-hover:text-white"}
                        ${compact ? "text-sm" : "text-base"}
                      `}
                    >
                      {step.title}
                      {step.required && (
                        <span
                          className="ml-1 text-red-500 dark:text-red-400"
                          aria-label={t("required")}
                          title={t("required")}
                        >
                          *
                        </span>
                      )}
                    </h3>

                    <p
                      className={`leading-snug text-[#6B6B6B] dark:text-pluto-400 transition-colors group-hover:text-pluto-700 dark:group-hover:text-pluto-300 ${
                        compact ? "text-xs" : "text-sm"
                      }`}
                    >
                      {step.description}
                    </p>

                    <StatusBadge
                      completed={step.completed}
                      isCurrent={isCurrent}
                      compact={compact}
                      completedLabel={t("completed")}
                      inProgressLabel={t("inProgress")}
                      pendingLabel={t("pending")}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  </div>

                  {/* Vertical connector line */}
                  {orientation === "vertical" && index < sortedSteps.length - 1 && (
                    <div
                      className={`
                        absolute left-[1.4375rem] top-[calc(100%_-_4px)]
                        ${compact ? "h-2 w-px" : "h-3 w-px"}
                        bg-pluto-200 dark:bg-pluto-700
                      `}
                      aria-hidden="true"
                    />
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ol>

        {/* ── Completion banner ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {isComplete && sortedSteps.length > 0 && (
            <motion.div
              className="mt-5 rounded-xl border border-pluto-200 bg-pluto-50 p-4 dark:border-pluto-700/60 dark:bg-pluto-900/60"
              variants={activeCompletionVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
              data-testid="completion-banner"
            >
              <div className="flex items-start gap-3">
                <motion.svg
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-pluto-500 dark:text-pluto-300"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  animate={prefersReducedMotion ? {} : { scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.45, delay: 0.25 }}
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </motion.svg>
                <div>
                  <h4 className="font-semibold text-pluto-900 dark:text-pluto-50">
                    {t("successTitle")}
                  </h4>
                  <p className="mt-0.5 text-sm text-pluto-700 dark:text-pluto-300">
                    {t("successMessage")}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

export default OnboardingProgressTracker;
