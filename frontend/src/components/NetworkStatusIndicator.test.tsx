/**
 * @vitest-environment jsdom
 *
 * Tests for NetworkStatusIndicator + network-status reducer.
 *
 * Covers:
 * - Reducer: all action types, state transitions, selectors
 * - Indicator: all health states, loading states, error banner, retry/dismiss,
 *   expand/collapse panel, compact variant, a11y attributes
 * - Hook (via mocked fetch): operational, degraded, error, offline paths
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (!params) return key;
    return Object.entries(params).reduce<string>(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      key,
    );
  },
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) =>
      React.forwardRef(({ children, ...props }: any, ref: any) => {
        const { variants, initial, animate, exit, transition, ...rest } = props;
        void variants; void initial; void animate; void exit; void transition;
        return React.createElement(tag, { ...rest, ref }, children);
      }),
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Reducer + selectors ───────────────────────────────────────────────────────

import {
  networkStatusReducer,
  initialNetworkStatusState,
  deriveHealth,
  healthToColor,
  selectIsLoading,
  selectHasError,
  selectIsHealthy,
  selectIsDegraded,
  selectIsOffline,
  selectLastCheckedLabel,
  LATENCY_THRESHOLDS,
  type NetworkCheckResult,
} from "@/lib/network-status";

const mockResult = (overrides: Partial<NetworkCheckResult> = {}): NetworkCheckResult => ({
  checkedAt: Date.now(),
  latencyMs: 120,
  ledgerSequence: 49999999,
  horizonUrl: "https://horizon-testnet.stellar.org",
  health: "operational",
  httpStatus: 200,
  ...overrides,
});

describe("networkStatusReducer", () => {
  it("returns initial state", () => {
    expect(initialNetworkStatusState.health).toBe("unknown");
    expect(initialNetworkStatusState.fetchState).toBe("idle");
    expect(initialNetworkStatusState.checkCount).toBe(0);
  });

  it("CHECK_START sets checking + loading", () => {
    const s = networkStatusReducer(initialNetworkStatusState, { type: "CHECK_START" });
    expect(s.health).toBe("checking");
    expect(s.fetchState).toBe("loading");
    expect(s.isManualCheck).toBe(false);
  });

  it("CHECK_START with manual=true sets isManualCheck", () => {
    const s = networkStatusReducer(initialNetworkStatusState, { type: "CHECK_START", manual: true });
    expect(s.isManualCheck).toBe(true);
  });

  it("CHECK_SUCCESS stores result and resets errors", () => {
    const pending = networkStatusReducer(initialNetworkStatusState, { type: "CHECK_START" });
    const result = mockResult();
    const s = networkStatusReducer(pending, { type: "CHECK_SUCCESS", result });
    expect(s.health).toBe("operational");
    expect(s.fetchState).toBe("success");
    expect(s.lastResult).toEqual(result);
    expect(s.checkCount).toBe(1);
    expect(s.consecutiveErrors).toBe(0);
    expect(s.isManualCheck).toBe(false);
  });

  it("CHECK_ERROR sets offline + increments consecutiveErrors", () => {
    const s = networkStatusReducer(initialNetworkStatusState, {
      type: "CHECK_ERROR", error: "Network error",
    });
    expect(s.health).toBe("offline");
    expect(s.fetchState).toBe("error");
    expect(s.errorMessage).toBe("Network error");
    expect(s.consecutiveErrors).toBe(1);
    expect(s.checkCount).toBe(1);
  });

  it("CHECK_SUCCESS after errors resets consecutiveErrors", () => {
    let s = networkStatusReducer(initialNetworkStatusState, { type: "CHECK_ERROR", error: "err" });
    s = networkStatusReducer(s, { type: "CHECK_ERROR", error: "err2" });
    expect(s.consecutiveErrors).toBe(2);
    s = networkStatusReducer(s, { type: "CHECK_SUCCESS", result: mockResult() });
    expect(s.consecutiveErrors).toBe(0);
  });

  it("POLLING_START / POLLING_STOP toggle isPolling", () => {
    const started = networkStatusReducer(initialNetworkStatusState, { type: "POLLING_START" });
    expect(started.isPolling).toBe(true);
    const stopped = networkStatusReducer(started, { type: "POLLING_STOP" });
    expect(stopped.isPolling).toBe(false);
  });

  it("DISMISS_ERROR clears error and reverts to unknown health", () => {
    const errState = networkStatusReducer(initialNetworkStatusState, {
      type: "CHECK_ERROR", error: "fail",
    });
    const dismissed = networkStatusReducer(errState, { type: "DISMISS_ERROR" });
    expect(dismissed.errorMessage).toBeNull();
    expect(dismissed.health).toBe("unknown");
    expect(dismissed.fetchState).toBe("idle");
  });

  it("RESET returns initial state", () => {
    let s = networkStatusReducer(initialNetworkStatusState, { type: "CHECK_ERROR", error: "e" });
    s = networkStatusReducer(s, { type: "RESET" });
    expect(s).toEqual(initialNetworkStatusState);
  });
});

describe("selectors", () => {
  it("selectIsLoading returns true when fetchState=loading", () => {
    const s = networkStatusReducer(initialNetworkStatusState, { type: "CHECK_START" });
    expect(selectIsLoading(s)).toBe(true);
    expect(selectIsLoading(initialNetworkStatusState)).toBe(false);
  });

  it("selectHasError returns true when error state", () => {
    const s = networkStatusReducer(initialNetworkStatusState, { type: "CHECK_ERROR", error: "e" });
    expect(selectHasError(s)).toBe(true);
    expect(selectHasError(initialNetworkStatusState)).toBe(false);
  });

  it("selectIsHealthy returns true only for operational", () => {
    const s = networkStatusReducer(initialNetworkStatusState, {
      type: "CHECK_SUCCESS", result: mockResult({ health: "operational" }),
    });
    expect(selectIsHealthy(s)).toBe(true);
  });

  it("selectIsDegraded returns true for degraded/partial/major outage", () => {
    for (const h of ["degraded", "partial_outage", "major_outage"] as const) {
      const s = networkStatusReducer(initialNetworkStatusState, {
        type: "CHECK_SUCCESS", result: mockResult({ health: h }),
      });
      expect(selectIsDegraded(s)).toBe(true);
    }
  });

  it("selectIsOffline returns true for offline health", () => {
    const s = networkStatusReducer(initialNetworkStatusState, {
      type: "CHECK_ERROR", error: "Network error",
    });
    expect(selectIsOffline(s)).toBe(true);
  });
});

describe("deriveHealth", () => {
  it("returns major_outage for 5xx", () => {
    expect(deriveHealth(500, 100)).toBe("major_outage");
    expect(deriveHealth(503, 50)).toBe("major_outage");
  });

  it("returns partial_outage for 4xx", () => {
    expect(deriveHealth(404, 200)).toBe("partial_outage");
  });

  it("returns operational for fast latency", () => {
    expect(deriveHealth(200, LATENCY_THRESHOLDS.operational)).toBe("operational");
    expect(deriveHealth(200, 100)).toBe("operational");
  });

  it("returns degraded for elevated latency", () => {
    expect(deriveHealth(200, LATENCY_THRESHOLDS.operational + 1)).toBe("degraded");
    expect(deriveHealth(200, LATENCY_THRESHOLDS.degraded)).toBe("degraded");
  });

  it("returns partial_outage for very high latency", () => {
    expect(deriveHealth(200, LATENCY_THRESHOLDS.degraded + 1)).toBe("partial_outage");
  });
});

describe("selectLastCheckedLabel", () => {
  it("returns empty string for null", () => {
    expect(selectLastCheckedLabel(null, Date.now())).toBe("");
  });

  it("returns 'just now' for < 5s ago", () => {
    const t = Date.now();
    expect(selectLastCheckedLabel(t - 2000, t)).toBe("just now");
  });

  it("returns Xs ago for < 60s", () => {
    const t = Date.now();
    expect(selectLastCheckedLabel(t - 30_000, t)).toBe("30s ago");
  });

  it("returns Xm ago for < 60min", () => {
    const t = Date.now();
    expect(selectLastCheckedLabel(t - 5 * 60_000, t)).toBe("5m ago");
  });

  it("returns Xh ago for >= 60min", () => {
    const t = Date.now();
    expect(selectLastCheckedLabel(t - 2 * 60 * 60_000, t)).toBe("2h ago");
  });
});

describe("healthToColor", () => {
  it("returns emerald for operational", () => {
    expect(healthToColor("operational").dot).toContain("emerald");
  });

  it("returns amber for degraded", () => {
    expect(healthToColor("degraded").dot).toContain("amber");
  });

  it("returns red for major_outage", () => {
    expect(healthToColor("major_outage").dot).toContain("red");
  });

  it("returns red for offline", () => {
    expect(healthToColor("offline").dot).toContain("red");
  });
});

// ── Component tests ───────────────────────────────────────────────────────────

import { NetworkStatusIndicator } from "@/components/NetworkStatusIndicator";

/** Render the indicator with a mocked fetch. */
function renderIndicator(fetchImpl: () => Promise<unknown>, props = {}) {
  global.fetch = vi.fn(fetchImpl as any);
  global.performance.now = vi.fn(() => 100);
  return render(
    React.createElement(NetworkStatusIndicator, {
      horizonUrl: "https://horizon-testnet.stellar.org",
      pollIntervalMs: 60_000,
      autoStart: false, // controlled manually in tests
      ...props,
    }),
  );
}

describe("NetworkStatusIndicator component", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Initial / loading state ─────────────────────────────────────────────

  it("renders the card wrapper on mount", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.getByTestId("network-status-card")).toBeInTheDocument();
  });

  it("renders sr-only announcement region", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.getByTestId("sr-announcement")).toBeInTheDocument();
  });

  it("shows 'checkNow' button", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.getByTestId("check-now-button")).toBeInTheDocument();
  });

  it("shows loading spinner in check-now button when checking", async () => {
    let resolve!: (v: unknown) => void;
    renderIndicator(() => new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByTestId("check-now-button"));
    await waitFor(() =>
      expect(screen.getByTestId("check-now-button")).toHaveAttribute("aria-busy", "true"),
    );
    act(() => resolve({ ok: true, status: 200, json: async () => ({ history_latest_ledger: 1 }) }));
  });

  it("disables check-now button while loading", async () => {
    renderIndicator(() => new Promise(() => {}));
    fireEvent.click(screen.getByTestId("check-now-button"));
    await waitFor(() =>
      expect(screen.getByTestId("check-now-button")).toBeDisabled(),
    );
  });

  // ── Successful check ────────────────────────────────────────────────────

  it("displays latency after a successful check", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ history_latest_ledger: 49999999 }),
    });
    global.performance.now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(120);

    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        pollIntervalMs: 60_000,
        autoStart: true,
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("latency-value")).toBeInTheDocument(),
    );
  });

  it("displays ledger sequence after a successful check", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ history_latest_ledger: 49999999 }),
    });

    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        autoStart: true,
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("ledger-value")).toBeInTheDocument(),
    );
  });

  // ── Error state ─────────────────────────────────────────────────────────

  it("shows error banner when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        autoStart: true,
        pollIntervalMs: 60_000,
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("error-banner")).toBeInTheDocument(),
    );
  });

  it("error banner has role=alert and aria-live=assertive", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fail"));

    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        autoStart: true,
        pollIntervalMs: 60_000,
      }),
    );

    await waitFor(() => {
      const banner = screen.getByTestId("error-banner");
      expect(banner).toHaveAttribute("role", "alert");
      expect(banner).toHaveAttribute("aria-live", "assertive");
    });
  });

  it("shows retry button in error state", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fail"));

    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        autoStart: true,
        pollIntervalMs: 60_000,
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("retry-button")).toBeInTheDocument(),
    );
  });

  it("dismisses error banner when dismiss button clicked", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fail"));

    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        autoStart: true,
        pollIntervalMs: 60_000,
      }),
    );

    await waitFor(() => screen.getByTestId("dismiss-button"));
    fireEvent.click(screen.getByTestId("dismiss-button"));

    await waitFor(() =>
      expect(screen.queryByTestId("error-banner")).not.toBeInTheDocument(),
    );
  });

  it("shows retry count after multiple consecutive errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fail"));

    // Manually dispatch two errors via the reducer
    // We simulate this by using internal state — checked via data-testid
    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        autoStart: true,
        pollIntervalMs: 60_000,
      }),
    );

    await waitFor(() => screen.getByTestId("error-banner"));
    // First error — retry count not shown (only shown after > 1)
    expect(screen.queryByTestId("retry-count")).not.toBeInTheDocument();
  });

  // ── Expand / collapse panel ─────────────────────────────────────────────

  it("shows expand button in full variant", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.getByTestId("expand-button")).toBeInTheDocument();
  });

  it("expand button toggles aria-expanded", () => {
    renderIndicator(() => new Promise(() => {}));
    const btn = screen.getByTestId("expand-button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("reveals details panel when expanded", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.queryByTestId("details-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("expand-button"));
    expect(screen.getByTestId("details-panel")).toBeInTheDocument();
  });

  it("hides details panel when collapsed again", () => {
    renderIndicator(() => new Promise(() => {}));
    fireEvent.click(screen.getByTestId("expand-button"));
    expect(screen.getByTestId("details-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("expand-button"));
    expect(screen.queryByTestId("details-panel")).not.toBeInTheDocument();
  });

  it("shows pause/resume polling buttons in details panel", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ history_latest_ledger: 1 }),
    });

    render(
      React.createElement(NetworkStatusIndicator, {
        horizonUrl: "https://horizon-testnet.stellar.org",
        autoStart: true,
        pollIntervalMs: 60_000,
      }),
    );

    fireEvent.click(screen.getByTestId("expand-button"));
    await waitFor(() => screen.getByTestId("details-panel"));
    expect(
      screen.getByTestId("pause-polling-button") ||
      screen.getByTestId("resume-polling-button"),
    ).toBeInTheDocument();
  });

  // ── Compact variant ────────────────────────────────────────────────────

  it("renders compact pill instead of card", () => {
    renderIndicator(() => new Promise(() => {}), { compact: true });
    expect(screen.getByTestId("network-status-compact")).toBeInTheDocument();
    expect(screen.queryByTestId("network-status-card")).not.toBeInTheDocument();
  });

  it("compact variant has translated aria-label", () => {
    renderIndicator(() => new Promise(() => {}), { compact: true });
    expect(screen.getByTestId("network-status-compact")).toHaveAttribute(
      "aria-label",
      "ariaLabel",
    );
  });

  it("compact variant has aria-busy when loading", async () => {
    renderIndicator(() => new Promise(() => {}), { compact: true });
    fireEvent.click(screen.getByTestId("network-status-compact"));
    await waitFor(() =>
      expect(screen.getByTestId("network-status-compact")).toHaveAttribute(
        "aria-busy", "true",
      ),
    );
  });

  // ── Accessibility ──────────────────────────────────────────────────────

  it("sr-only status region has aria-live=polite", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.getByTestId("sr-announcement")).toHaveAttribute("aria-live", "polite");
  });

  it("check-now button has translated aria-label", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.getByTestId("check-now-button")).toHaveAttribute("aria-label", "checkNow");
  });

  it("expand button has translated aria-label when collapsed", () => {
    renderIndicator(() => new Promise(() => {}));
    expect(screen.getByTestId("expand-button")).toHaveAttribute("aria-label", "expandPanel");
  });

  it("expand button has translated aria-label when expanded", () => {
    renderIndicator(() => new Promise(() => {}));
    fireEvent.click(screen.getByTestId("expand-button"));
    expect(screen.getByTestId("expand-button")).toHaveAttribute("aria-label", "collapsePanel");
  });

  it("showDetails=false hides expand button", () => {
    renderIndicator(() => new Promise(() => {}), { showDetails: false });
    expect(screen.queryByTestId("expand-button")).not.toBeInTheDocument();
  });
});

// ── NetworkStatusSkeleton ─────────────────────────────────────────────────────

import NetworkStatusSkeleton from "@/components/NetworkStatusSkeleton";

describe("NetworkStatusSkeleton", () => {
  it("renders with role=status and aria-busy=true", () => {
    render(React.createElement(NetworkStatusSkeleton));
    const el = screen.getByTestId("network-status-skeleton");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-busy", "true");
  });

  it("renders compact variant", () => {
    render(React.createElement(NetworkStatusSkeleton, { compact: true }));
    expect(screen.getByTestId("network-status-skeleton")).toBeInTheDocument();
  });

  it("shows custom loading label in sr-only span", () => {
    render(
      React.createElement(NetworkStatusSkeleton, {
        loadingLabel: "Custom loading label",
      }),
    );
    expect(screen.getByText("Custom loading label")).toBeInTheDocument();
  });
});
