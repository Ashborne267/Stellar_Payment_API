/**
 * useOnboardingProgress
 *
 * Encapsulates all stateful logic for the Onboarding Progress Tracker so the
 * component stays a pure presentation layer.
 *
 * Responsibilities:
 * - Owns the useReducer instance and exposes read-only derived values.
 * - Handles optimistic step navigation with async callback + rollback.
 * - Syncs external prop changes (steps array) into reducer via SYNC_STEPS.
 * - Produces translated screen-reader announcement strings.
 * - Fires onComplete when all required steps are done.
 */

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { useTranslations } from "next-intl";
import {
  onboardingReducer,
  createInitialOnboardingState,
  selectEffectiveStep,
  selectProgressPercent,
  type OnboardingState,
} from "@/components/onboarding-reducer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  order: number;
}

export interface UseOnboardingProgressOptions {
  steps: OnboardingStep[];
  currentStep?: string;
  onStepChange?: (stepId: string) => void | Promise<void>;
  onComplete?: () => void;
}

export interface UseOnboardingProgressReturn {
  /** Steps sorted by `order`. */
  sortedSteps: OnboardingStep[];
  /** The step id currently treated as active (optimistic-aware). */
  effectiveCurrentStep: string | undefined;
  /** Reducer state snapshot — read-only. */
  state: OnboardingState;
  /** 0–100 progress percentage. */
  progressPercent: number;
  /** Number of completed steps. */
  completedCount: number;
  /** True when all required steps are completed. */
  isComplete: boolean;
  /** Stable id for the sr-only progress summary element. */
  progressSummaryId: string;
  /** Handle a step button click with optimistic update + rollback. */
  handleStepClick: (stepId: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOnboardingProgress({
  steps,
  currentStep: currentStepProp,
  onStepChange,
  onComplete,
}: UseOnboardingProgressOptions): UseOnboardingProgressReturn {
  const t = useTranslations("onboarding");
  const progressSummaryId = useId();

  // ── Derived step data ────────────────────────────────────────────────────

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.order - b.order),
    [steps],
  );

  const completedCount = useMemo(
    () => sortedSteps.filter((s) => s.completed).length,
    [sortedSteps],
  );

  const isComplete = useMemo(() => {
    const required = sortedSteps.filter((s) => s.required);
    return required.length > 0 && required.every((s) => s.completed);
  }, [sortedSteps]);

  // ── Reducer ──────────────────────────────────────────────────────────────

  const [state, dispatch] = useReducer(
    onboardingReducer,
    createInitialOnboardingState(
      currentStepProp ?? sortedSteps[0]?.id,
      sortedSteps.length,
      completedCount,
    ),
  );

  // Keep derived counts in sync when the steps prop changes.
  useEffect(() => {
    dispatch({
      type: "SYNC_STEPS",
      payload: { total: sortedSteps.length, completed: completedCount },
    });
  }, [sortedSteps.length, completedCount]);

  // Sync external currentStep prop changes (e.g. parent navigates).
  const prevCurrentStepProp = useRef(currentStepProp);
  useEffect(() => {
    if (
      currentStepProp !== undefined &&
      currentStepProp !== prevCurrentStepProp.current
    ) {
      dispatch({ type: "SET_CURRENT_STEP", payload: currentStepProp });
      prevCurrentStepProp.current = currentStepProp;
    }
  }, [currentStepProp]);

  // ── Derived values ────────────────────────────────────────────────────────

  const effectiveCurrentStep = selectEffectiveStep(state);
  const progressPercent = selectProgressPercent(state);

  // ── Completion side-effect ────────────────────────────────────────────────

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (isComplete && sortedSteps.length > 0) {
      dispatch({
        type: "SET_ANNOUNCEMENT",
        payload: t("successTitle"),
      });
      onCompleteRef.current?.();
    }
  }, [isComplete, sortedSteps.length, t]);

  // ── Progress announcements ────────────────────────────────────────────────

  useEffect(() => {
    dispatch({
      type: "SET_ANNOUNCEMENT",
      payload: t("progressAnnouncement", { percent: progressPercent }),
    });
  }, [progressPercent, t]);

  // ── Step click handler ────────────────────────────────────────────────────

  const handleStepClick = useCallback(
    async (stepId: string) => {
      if (state.isPending) return;

      const step = sortedSteps.find((s) => s.id === stepId);
      if (!step) return;

      // Optimistic: reflect change immediately.
      dispatch({ type: "OPTIMISTIC_STEP", payload: stepId });

      const statusKey = step.completed
        ? "completed"
        : effectiveCurrentStep === stepId
          ? "inProgress"
          : "pending";

      dispatch({
        type: "SET_ANNOUNCEMENT",
        payload: t("stepAnnouncement", {
          number: step.order,
          total: sortedSteps.length,
          title: step.title,
          description: step.description,
          status: t(statusKey),
        }),
      });

      try {
        await onStepChange?.(stepId);
        dispatch({ type: "CONFIRM_STEP", payload: stepId });
      } catch {
        dispatch({ type: "ROLLBACK_STEP" });
        dispatch({
          type: "SET_ANNOUNCEMENT",
          payload: t("stepChangeFailed"),
        });
      }
    },
    [sortedSteps, effectiveCurrentStep, onStepChange, state.isPending, t],
  );

  return {
    sortedSteps,
    effectiveCurrentStep,
    state,
    progressPercent,
    completedCount,
    isComplete,
    progressSummaryId,
    handleStepClick,
  };
}
