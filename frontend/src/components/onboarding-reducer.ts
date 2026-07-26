/**
 * State logic for the Onboarding Progress Tracker.
 *
 * Extracted from the component so the optimistic-update lifecycle
 * (optimistic → confirm/rollback) is a pure, independently testable unit.
 *
 * Loading state enhancements:
 * - LOAD_START / LOAD_SUCCESS / LOAD_ERROR actions for initial data fetch
 * - SET_ERROR / CLEAR_ERROR for step-level and global errors
 * - RETRY action to re-enter loading state from an error state
 * - loadingState discriminated union: "idle" | "loading" | "success" | "error"
 * - errorMessage field for surfacing translated error text
 * - retryCount field so the UI can throttle retry attempts
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type LoadingState = "idle" | "loading" | "success" | "error";

export interface OnboardingState {
  readonly currentStep: string | undefined;
  /** Optimistic step id set immediately on click, cleared on confirm/rollback. */
  readonly optimisticStep: string | undefined;
  /** Text queued for the aria-live announcement region. */
  readonly announcementText: string;
  /** True while an optimistic update is awaiting server confirmation. */
  readonly isPending: boolean;
  /** Discriminated loading state for the initial data fetch. */
  readonly loadingState: LoadingState;
  /** Error message to surface in the error banner (null when healthy). */
  readonly errorMessage: string | null;
  /** Number of times the user has retried after an error. */
  readonly retryCount: number;
}

export type OnboardingAction =
  | { type: "SET_CURRENT_STEP"; payload: string }
  | { type: "OPTIMISTIC_STEP"; payload: string }
  | { type: "CONFIRM_STEP"; payload: string }
  | { type: "ROLLBACK_STEP" }
  | { type: "SET_ANNOUNCEMENT"; payload: string }
  /** Begin initial data loading — shows skeleton UI. */
  | { type: "LOAD_START" }
  /** Data loaded successfully — clears skeleton. */
  | { type: "LOAD_SUCCESS" }
  /** Data loading failed — shows error banner. */
  | { type: "LOAD_ERROR"; payload: string }
  /** Set a step-level or general error without going through the load cycle. */
  | { type: "SET_ERROR"; payload: string }
  /** Dismiss the error banner. */
  | { type: "CLEAR_ERROR" }
  /** Increment retryCount and re-enter loading state. */
  | { type: "RETRY" };

// ── Factory ───────────────────────────────────────────────────────────────────

export function createInitialOnboardingState(
  currentStep?: string,
  initialLoadingState: LoadingState = "idle",
): OnboardingState {
  return {
    currentStep,
    optimisticStep: undefined,
    announcementText: "",
    isPending: false,
    loadingState: initialLoadingState,
    errorMessage: null,
    retryCount: 0,
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
      return { ...state, optimisticStep: action.payload, isPending: true };

    case "CONFIRM_STEP":
      return {
        ...state,
        currentStep: action.payload,
        optimisticStep: undefined,
        isPending: false,
      };

    case "ROLLBACK_STEP":
      return { ...state, optimisticStep: undefined, isPending: false };

    case "SET_ANNOUNCEMENT":
      return { ...state, announcementText: action.payload };

    case "LOAD_START":
      return {
        ...state,
        loadingState: "loading",
        errorMessage: null,
      };

    case "LOAD_SUCCESS":
      return {
        ...state,
        loadingState: "success",
        errorMessage: null,
      };

    case "LOAD_ERROR":
      return {
        ...state,
        loadingState: "error",
        errorMessage: action.payload,
        isPending: false,
      };

    case "SET_ERROR":
      return {
        ...state,
        errorMessage: action.payload,
        loadingState: "error",
        isPending: false,
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        errorMessage: null,
        loadingState: "idle",
      };

    case "RETRY":
      return {
        ...state,
        loadingState: "loading",
        errorMessage: null,
        retryCount: state.retryCount + 1,
      };

    default:
      return state;
  }
}

// ── Selectors ─────────────────────────────────────────────────────────────────

/** Active step id, accounting for optimistic state. */
export function selectEffectiveStep(state: OnboardingState): string | undefined {
  return state.optimisticStep ?? state.currentStep;
}

/** Progress percentage clamped to [0, 100]. */
export function selectProgressPercent(
  completedSteps: number,
  totalSteps: number,
): number {
  if (totalSteps === 0) return 0;
  return Math.min(100, Math.round((completedSteps / totalSteps) * 100));
}

/** True while the component is in any loading-like state. */
export function selectIsLoading(state: OnboardingState): boolean {
  return state.loadingState === "loading";
}

/** True when the component is in a recoverable error state. */
export function selectHasError(state: OnboardingState): boolean {
  return state.loadingState === "error" && state.errorMessage !== null;
}
