/**
 * State logic for the Onboarding Progress Tracker.
 *
 * Extracted from the component so the optimistic-update lifecycle
 * (optimistic → confirm/rollback) is a pure, independently testable unit.
 *
 * Refactor notes:
 * - Added SYNC_STEPS action so parent-driven step updates (e.g. server
 *   re-validation) can be applied without a full remount.
 * - Stricter readonly types on state members to prevent accidental mutation.
 * - SET_CURRENT_STEP retained for backward compatibility.
 */

// ── Public types ─────────────────────────────────────────────────────────────

export interface OnboardingState {
  /** The last confirmed current step id. */
  readonly currentStep: string | undefined;
  /** Optimistic step id set immediately on click, before the callback confirms. */
  readonly optimisticStep: string | undefined;
  /** Text to announce to screen readers via an aria-live region. */
  readonly announcementText: string;
  /** True while an optimistic update is awaiting confirmation. */
  readonly isPending: boolean;
  /** Total number of steps last synced from props — used for progress math. */
  readonly totalSteps: number;
  /** Number of completed steps last synced from props. */
  readonly completedSteps: number;
}

export type OnboardingAction =
  | { type: "SET_CURRENT_STEP"; payload: string }
  | { type: "OPTIMISTIC_STEP"; payload: string }
  | { type: "CONFIRM_STEP"; payload: string }
  | { type: "ROLLBACK_STEP" }
  | { type: "SET_ANNOUNCEMENT"; payload: string }
  /** Sync derived counts when the steps prop changes so components downstream
   *  can re-compute progress without traversing the full array. */
  | { type: "SYNC_STEPS"; payload: { total: number; completed: number } };

// ── Factory ───────────────────────────────────────────────────────────────────

export function createInitialOnboardingState(
  currentStep?: string,
  totalSteps = 0,
  completedSteps = 0,
): OnboardingState {
  return {
    currentStep,
    optimisticStep: undefined,
    announcementText: "",
    isPending: false,
    totalSteps,
    completedSteps,
  };
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case "SET_CURRENT_STEP":
      return {
        ...state,
        currentStep: action.payload,
        optimisticStep: undefined,
        isPending: false,
      };

    case "OPTIMISTIC_STEP":
      return {
        ...state,
        optimisticStep: action.payload,
        isPending: true,
      };

    case "CONFIRM_STEP":
      return {
        ...state,
        currentStep: action.payload,
        optimisticStep: undefined,
        isPending: false,
      };

    case "ROLLBACK_STEP":
      return {
        ...state,
        optimisticStep: undefined,
        isPending: false,
      };

    case "SET_ANNOUNCEMENT":
      return { ...state, announcementText: action.payload };

    case "SYNC_STEPS":
      return {
        ...state,
        totalSteps: action.payload.total,
        completedSteps: action.payload.completed,
      };

    default:
      return state;
  }
}

// ── Selectors (pure helpers, safe to import anywhere) ─────────────────────────

/** The step id that should be treated as active, accounting for optimism. */
export function selectEffectiveStep(state: OnboardingState): string | undefined {
  return state.optimisticStep ?? state.currentStep;
}

/** Progress percentage clamped to [0, 100]. */
export function selectProgressPercent(state: OnboardingState): number {
  if (state.totalSteps === 0) return 0;
  return Math.min(100, Math.round((state.completedSteps / state.totalSteps) * 100));
}
