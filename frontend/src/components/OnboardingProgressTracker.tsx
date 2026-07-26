"use client";

/**
 * OnboardingProgressTracker
 *
 * Enhanced with comprehensive interactive loading states:
 * - OnboardingSkeletonLoader: full shimmer skeleton on initial load
 * - Shimmer progress bar during pending transitions
 * - Per-step spinner + dimmed overlay while a step change is in flight
 * - Step success flash (brief green ring) on confirm
 * - Error banner with translated message and retry button
 * - Global pending overlay with translated aria-live announcement
 * - All states respect prefers-reduced-motion
 * - Full dark mode support on every loading surface
 */

import React, { useCallback, useMemo, useEffect, useId, useReducer, useRef, memo } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  onboardingReducer,
  createInitialOnboardingState,
  selectEffectiveStep,
  selectProgressPercent,
  selectIsLoading,
  selectHasError,
  type LoadingState,
} from "./onboarding-reducer";
import { OnboardingSkeletonLoader } from "./OnboardingSkeletonLoader";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  order: number;
}

export interface OnboardingProgressTrackerProps {
  steps: OnboardingStep[];
  currentStep?: string;
  onStepChange?: (stepId: string) => void | Promise<void>;
  onComplete?: () => void;
  onRetry?: () => void | Promise<void>;
  showStepNumbers?: boolean;
  orientation?: "vertical" | "horizontal";
  compact?: boolean;
  className?: string;
  /** Pass "loading" to show skeleton, "error" + errorMessage to show error banner. */
  loadingState?: LoadingState;
  errorMessage?: string;
}

// ── Animation variants ────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
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

const errorBannerVariants: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
  exit:   { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

const errorBannerVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit:   { opacity: 0, transition: { duration: 0.1 } },
};

// ── StepIcon ──────────────────────────────────────────────────────────────────

interface StepIconProps {
  completed: boolean;
  isPending: boolean;
  isSuccess: boolean;
  isCurrent: boolean;
  number: number;
  showNumber: boolean;
  compact: boolean;
  checkVariants: Variants;
  prefersReducedMotion: boolean | null;
}

const StepIcon = memo(function StepIcon({
  completed, isPending, isSuccess, isCurrent,
  number, showNumber, compact, checkVariants, prefersReducedMotion,
}: StepIconProps) {
  return (
    <AnimatePresence mode="wait">
      {isSuccess ? (
        /* Brief green ring flash on confirm */
        <motion.span
          key="success-flash"
          className="absolute inset-0 flex items-center justify-center"
          initial={{ scale: 1.2, opacity: 1 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          data-testid="step-success-flash"
        >
          <svg className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-emerald-500`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </motion.span>
      ) : isPending ? (
        /* Spinning loader while step change is in flight */
        <motion.span
          key="spinner"
          className="absolute inset-0 flex items-center justify-center"
          animate={prefersReducedMotion ? {} : { rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
          data-testid="step-spinner"
        >
          <svg className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-pluto-500 dark:text-pluto-300`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </motion.span>
      ) : completed ? (
        /* Checkmark with spring pop-in */
        <motion.span
          key="check"
          className="absolute inset-0 flex items-center justify-center"
          variants={checkVariants}
          initial="hidden"
          animate="visible"
        >
          <svg className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-pluto-700 dark:text-pluto-200`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </motion.span>
      ) : (
        /* Step number or empty */
        <motion.span
          key="number"
          className={`absolute inset-0 flex items-center justify-center font-semibold ${compact ? "text-xs" : "text-sm"} ${isCurrent ? "text-pluto-700 dark:text-pluto-300" : "text-pluto-600 dark:text-pluto-400"}`}
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

// ── StatusBadge ───────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  completed: boolean;
  isCurrent: boolean;
  isPending: boolean;
  compact: boolean;
  completedLabel: string;
  inProgressLabel: string;
  pendingLabel: string;
  loadingLabel: string;
  prefersReducedMotion: boolean | null;
}

const StatusBadge = memo(function StatusBadge({
  completed, isCurrent, isPending, compact,
  completedLabel, inProgressLabel, pendingLabel, loadingLabel,
  prefersReducedMotion,
}: StatusBadgeProps) {
  const label = isPending
    ? loadingLabel
    : completed
      ? completedLabel
      : isCurrent
        ? inProgressLabel
        : pendingLabel;

  const colorClass = isPending
    ? "bg-pluto-100 text-pluto-600 dark:bg-pluto-800/60 dark:text-pluto-300 animate-pulse motion-reduce:animate-none"
    : completed
      ? "bg-pluto-100 text-pluto-800 dark:bg-pluto-900/40 dark:text-pluto-200"
      : isCurrent
        ? "bg-pluto-200 text-pluto-900 dark:bg-pluto-800/50 dark:text-pluto-100"
        : "bg-pluto-50 text-pluto-700 dark:bg-pluto-900/20 dark:text-pluto-300 group-hover:bg-pluto-100 dark:group-hover:bg-pluto-900/40";

  return (
    <motion.span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${compact ? "text-[0.65rem]" : "text-xs"} ${colorClass}`}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: prefersReducedMotion ? 0 : 0.12 }}
      aria-label={label}
    >
      {isPending && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-pluto-500 dark:bg-pluto-300 animate-bounce motion-reduce:animate-none" aria-hidden="true" />
      )}
      {label}
    </motion.span>
  );
});

// ── ErrorBanner ───────────────────────────────────────────────────────────────

interface ErrorBannerProps {
  message: string;
  retryCount: number;
  onRetry: () => void;
  onDismiss: () => void;
  retryLabel: string;
  dismissLabel: string;
  errorHeading: string;
  retryCountLabel: string;
  prefersReducedMotion: boolean | null;
  variants: Variants;
}

const ErrorBanner = memo(function ErrorBanner({
  message, retryCount, onRetry, onDismiss,
  retryLabel, dismissLabel, errorHeading, retryCountLabel,
  prefersReducedMotion, variants,
}: ErrorBannerProps) {
  return (
    <motion.div
      className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-950/40"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="error-banner"
    >
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">{errorHeading}</p>
          <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">{message}</p>
          {retryCount > 0 && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-500" data-testid="retry-count">
              {retryCountLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 dark:border-red-700/60 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/30"
            data-testid="retry-button"
          >
            {retryLabel}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-900/30"
            aria-label={dismissLabel}
            data-testid="dismiss-error-button"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export const OnboardingProgressTracker = memo(function OnboardingProgressTracker({
  steps,
  currentStep: currentStepProp,
  onStepChange,
  onComplete,
  onRetry,
  showStepNumbers = true,
  orientation = "vertical",
  compact = false,
  className = "",
  loadingState: externalLoadingState,
  errorMessage: externalErrorMessage,
}: OnboardingProgressTrackerProps) {
  const t = useTranslations("onboarding");
  const progressSummaryId = useId();
  const prefersReducedMotion = useReducedMotion();

  const [state, dispatch] = useReducer(
    onboardingReducer,
    createInitialOnboardingState(
      currentStepProp ?? steps[0]?.id,
      externalLoadingState ?? "idle",
    ),
  );

  // Track which step just succeeded for the success-flash
  const [successStepId, setSuccessStepId] = React.useState<string | null>(null);

  // Sync external loading/error state from props
  useEffect(() => {
    if (!externalLoadingState) return;
    if (externalLoadingState === "loading") dispatch({ type: "LOAD_START" });
    if (externalLoadingState === "success") dispatch({ type: "LOAD_SUCCESS" });
    if (externalLoadingState === "error" && externalErrorMessage) {
      dispatch({ type: "LOAD_ERROR", payload: externalErrorMessage });
    }
  }, [externalLoadingState, externalErrorMessage]);

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.order - b.order),
    [steps],
  );

  const completedCount = useMemo(
    () => sortedSteps.filter((s) => s.completed).length,
    [sortedSteps],
  );

  const progressPercent = useMemo(
    () => selectProgressPercent(completedCount, sortedSteps.length),
    [completedCount, sortedSteps.length],
  );

  const isComplete = useMemo(() => {
    const required = sortedSteps.filter((s) => s.required);
    return required.length > 0 && required.every((s) => s.completed);
  }, [sortedSteps]);

  const effectiveCurrentStep = selectEffectiveStep(state);
  const isLoading = selectIsLoading(state);
  const hasError = selectHasError(state);

  // Completion side-effect
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    if (isComplete && sortedSteps.length > 0) {
      dispatch({ type: "SET_ANNOUNCEMENT", payload: t("successTitle") });
      onCompleteRef.current?.();
    }
  }, [isComplete, sortedSteps.length, t]);

  // Progress announcements
  useEffect(() => {
    dispatch({ type: "SET_ANNOUNCEMENT", payload: t("progressAnnouncement", { percent: progressPercent }) });
  }, [progressPercent, t]);

  const handleRetry = useCallback(async () => {
    dispatch({ type: "RETRY" });
    dispatch({ type: "SET_ANNOUNCEMENT", payload: t("retrying") });
    try {
      await onRetry?.();
      dispatch({ type: "LOAD_SUCCESS" });
    } catch {
      dispatch({ type: "LOAD_ERROR", payload: t("loadError") });
    }
  }, [onRetry, t]);

  const handleDismissError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const handleStepClick = useCallback(async (stepId: string) => {
    if (state.isPending || isLoading) return;
    const step = sortedSteps.find((s) => s.id === stepId);
    if (!step) return;

    dispatch({ type: "OPTIMISTIC_STEP", payload: stepId });
    const status = step.completed ? t("completed") : effectiveCurrentStep === stepId ? t("inProgress") : t("pending");
    dispatch({
      type: "SET_ANNOUNCEMENT",
      payload: t("stepAnnouncement", { number: step.order, total: sortedSteps.length, title: step.title, description: step.description, status }),
    });

    try {
      await onStepChange?.(stepId);
      dispatch({ type: "CONFIRM_STEP", payload: stepId });
      // Trigger success flash
      setSuccessStepId(stepId);
      setTimeout(() => setSuccessStepId(null), 800);
    } catch {
      dispatch({ type: "ROLLBACK_STEP" });
      dispatch({ type: "SET_ANNOUNCEMENT", payload: t("stepChangeFailed") });
    }
  }, [sortedSteps, effectiveCurrentStep, onStepChange, state.isPending, isLoading, t]);

  // Variant selection
  const activeStepVariants        = prefersReducedMotion ? stepVariantsReduced        : stepVariants;
  const activeProgressBarVariants = prefersReducedMotion ? progressBarVariantsReduced : progressBarVariants;
  const activeCheckMarkVariants   = prefersReducedMotion ? checkMarkVariantsReduced   : checkMarkVariants;
  const activeCompletionVariants  = prefersReducedMotion ? completionVariantsReduced  : completionVariants;
  const activeErrorBannerVariants = prefersReducedMotion ? errorBannerVariantsReduced : errorBannerVariants;

  // ── Skeleton: initial loading state ───────────────────────────────────────
  if (isLoading && steps.length === 0) {
    return (
      <OnboardingSkeletonLoader
        stepCount={3}
        compact={compact}
        loadingLabel={t("loadingSteps")}
        className={className}
        data-testid="onboarding-skeleton"
      />
    );
  }
