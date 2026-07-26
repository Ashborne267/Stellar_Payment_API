/**
 * useOnboardingI18n
 *
 * Centralises every translated string used by the Onboarding Progress Tracker.
 * Consuming components call this hook once and receive a stable object of
 * typed helpers — no duplicated useTranslations("onboarding") calls scattered
 * across files.
 */

"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

// ── Step data shape (minimal — component owns the full type) ──────────────────

interface StepMeta {
  order: number;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
}

// ── Return type ───────────────────────────────────────────────────────────────

export interface OnboardingI18n {
  // Static strings
  title: string;
  subtitle: string;
  progressBar: string;
  stepsList: string;
  progressTracker: string;
  allCompleted: string;
  successTitle: string;
  successMessage: string;
  completed: string;
  inProgress: string;
  pending: string;
  required: string;
  optional: string;
  updating: string;
  stepChangeFailed: string;

  // Parameterised helpers
  /** "X of Y steps completed" */
  stepsCompletedLabel: (completed: number, total: number) => string;
  /** "N% complete" */
  percentCompleteLabel: (percent: number) => string;
  /** Progress announcement for aria-live: "Progress: N% complete" */
  progressAnnouncement: (percent: number) => string;
  /**
   * Full step button aria-label.
   * Appends ". Completed" and/or ". Required" as appropriate.
   */
  stepAriaLabel: (
    number: number,
    title: string,
    completed: boolean,
    required: boolean,
  ) => string;
  /** Step click announcement for the aria-live region. */
  stepAnnouncement: (step: StepMeta, total: number, statusLabel: string) => string;
  /** Status label for a given step state. */
  statusLabel: (completed: boolean, isCurrent: boolean) => string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOnboardingI18n(): OnboardingI18n {
  const t = useTranslations("onboarding");

  const stepsCompletedLabel = useCallback(
    (completed: number, total: number) =>
      t("stepsCompleted", { completed, total }),
    [t],
  );

  const percentCompleteLabel = useCallback(
    (percent: number) => t("percentComplete", { percent }),
    [t],
  );

  const progressAnnouncement = useCallback(
    (percent: number) => t("progressAnnouncement", { percent }),
    [t],
  );

  const stepAriaLabel = useCallback(
    (
      number: number,
      title: string,
      completed: boolean,
      required: boolean,
    ): string => {
      if (completed && required)
        return t("stepLabelCompletedRequired", { number, title });
      if (completed) return t("stepLabelCompleted", { number, title });
      if (required) return t("stepLabelRequired", { number, title });
      return t("stepLabel", { number, title });
    },
    [t],
  );

  const stepAnnouncement = useCallback(
    (step: StepMeta, total: number, statusLabel: string): string =>
      t("stepAnnouncement", {
        number: step.order,
        total,
        title: step.title,
        description: step.description,
        status: statusLabel,
      }),
    [t],
  );

  const statusLabel = useCallback(
    (completed: boolean, isCurrent: boolean): string => {
      if (completed) return t("completed");
      if (isCurrent) return t("inProgress");
      return t("pending");
    },
    [t],
  );

  return {
    title: t("title"),
    subtitle: t("subtitle"),
    progressBar: t("progressBar"),
    stepsList: t("stepsList"),
    progressTracker: t("progressTracker"),
    allCompleted: t("allCompleted"),
    successTitle: t("successTitle"),
    successMessage: t("successMessage"),
    completed: t("completed"),
    inProgress: t("inProgress"),
    pending: t("pending"),
    required: t("required"),
    optional: t("optional"),
    updating: t("updating"),
    stepChangeFailed: t("stepChangeFailed"),
    stepsCompletedLabel,
    percentCompleteLabel,
    progressAnnouncement,
    stepAriaLabel,
    stepAnnouncement,
    statusLabel,
  };
}
