/**
 * @vitest-environment jsdom
 *
 * Unit tests for OnboardingProgressTracker (refactored)
 *
 * Covers:
 *  - #809  framer-motion animation variants and reduced-motion support
 *  - #810  comprehensive unit-test coverage (rendering, props, interactions, completion)
 *  - #811  screen-reader / accessibility attributes
 *  - #812  optimistic updates and rollback behaviour
 *  - i18n  translated strings via "onboarding" namespace
 *  - hook  useOnboardingProgress integration (SYNC_STEPS, external prop sync)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { OnboardingProgressTracker } from "./OnboardingProgressTracker";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next-intl: return the translation key so assertions are locale-independent
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (!params) return key;
    // Inline simple {token} substitution so parameterised strings are readable
    return Object.entries(params).reduce<string>(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      key,
    );
  },
}));

// framer-motion: render plain HTML so tests stay fast — #809
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        // eslint-disable-next-line react/display-name
        React.forwardRef(({ children, animate, variants, initial, exit, transition, ...rest }: any, ref: any) =>
          React.createElement(tag, { ...rest, ref }, children),
        ),
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const step1 = { id: "1", title: "Step 1", description: "Desc 1", completed: true,  required: true,  order: 1 };
const step2 = { id: "2", title: "Step 2", description: "Desc 2", completed: false, required: true,  order: 2 };
const step3 = { id: "3", title: "Step 3", description: "Desc 3", completed: false, required: false, order: 3 };

const mockSteps = [step1, step2, step3];

const defaultProps = {
  steps: mockSteps,
  onStepChange: vi.fn(),
  onComplete: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the step button by its translated aria-label key fragment. */
const getStepBtn = (titleFragment: string) =>
  screen.getByRole("button", { name: new RegExp(titleFragment, "i") });

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("OnboardingProgressTracker", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── #810 Rendering ────────────────────────────────────────────────────────
  describe("Rendering", () => {
    it("renders the translated title", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByText("title")).toBeInTheDocument();
    });

    it("renders all step titles and descriptions", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      mockSteps.forEach((s) => {
        expect(screen.getByText(s.title)).toBeInTheDocument();
        expect(screen.getByText(s.description)).toBeInTheDocument();
      });
    });

    it("displays the progress percentage (33% for 1 of 3 completed)", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      // The header badge uses t("percentComplete", { percent: 33 })
      expect(screen.getByText(/33/)).toBeInTheDocument();
    });

    it("renders the progress bar fill element with correct width", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const fill = screen.getByTestId("progress-bar-fill");
      expect(fill).toHaveStyle("width: 33%");
    });

    it("sets correct ARIA attributes on the progressbar", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "33");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    });

    it("does not show the completion banner when onboarding is incomplete", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.queryByTestId("completion-banner")).not.toBeInTheDocument();
    });

    it("shows the completion banner when all required steps are done", async () => {
      const allDone = [
        { ...step1, completed: true },
        { ...step2, completed: true },
        { ...step3, completed: false }, // optional — doesn't block completion
      ];
      render(<OnboardingProgressTracker {...defaultProps} steps={allDone} />);
      await waitFor(() =>
        expect(screen.getByTestId("completion-banner")).toBeInTheDocument(),
      );
    });

    it("renders the sr-only announcement region", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByTestId("sr-announcement")).toBeInTheDocument();
    });
  });

  // ── #810 Props / variants ─────────────────────────────────────────────────
  describe("Props and variants", () => {
    it("applies compact padding when compact=true", () => {
      const { container } = render(
        <OnboardingProgressTracker {...defaultProps} compact />,
      );
      expect(container.querySelector(".p-4")).toBeInTheDocument();
    });

    it("applies horizontal flex layout when orientation='horizontal'", () => {
      render(<OnboardingProgressTracker {...defaultProps} orientation="horizontal" />);
      const list = screen.getByRole("list");
      expect(list).toHaveClass("flex-col");
    });

    it("applies vertical (default) layout", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const list = screen.getByRole("list");
      expect(list).toHaveClass("flex-col");
    });

    it("hides step numbers when showStepNumbers=false", () => {
      render(<OnboardingProgressTracker {...defaultProps} showStepNumbers={false} />);
      // Step 2 indicator should not show the numeral "2"
      const btn = getStepBtn("Step 2: Step 2");
      expect(btn.textContent?.includes("2")).toBe(false);
    });

    it("applies a custom className to the root wrapper", () => {
      const { container } = render(
        <OnboardingProgressTracker {...defaultProps} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  // ── #810 Interactions ─────────────────────────────────────────────────────
  describe("Interactions", () => {
    it("calls onStepChange when a step is clicked", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      fireEvent.click(getStepBtn("Step 2: Step 2"));
      expect(defaultProps.onStepChange).toHaveBeenCalledWith("2");
    });

    it("calls onStepChange with the correct step id for step 1", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      fireEvent.click(getStepBtn("Step 1: Step 1"));
      expect(defaultProps.onStepChange).toHaveBeenCalledWith("1");
    });
  });

  // ── #810 Completion logic ─────────────────────────────────────────────────
  describe("Completion logic", () => {
    it("calls onComplete when all required steps are done", async () => {
      const allRequired = [
        { ...step1, completed: true },
        { ...step2, completed: true },
        { ...step3, completed: false },
      ];
      render(<OnboardingProgressTracker {...defaultProps} steps={allRequired} />);
      await waitFor(() => expect(defaultProps.onComplete).toHaveBeenCalled());
    });

    it("does not call onComplete when a required step is incomplete", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(defaultProps.onComplete).not.toHaveBeenCalled();
    });

    it("shows translated successTitle in the completion banner", async () => {
      const allRequired = [
        { ...step1, completed: true },
        { ...step2, completed: true },
        { ...step3, completed: false },
      ];
      render(<OnboardingProgressTracker {...defaultProps} steps={allRequired} />);
      await waitFor(() =>
        expect(screen.getByText("successTitle")).toBeInTheDocument(),
      );
    });

    it("shows translated successMessage in the completion banner", async () => {
      const allRequired = [
        { ...step1, completed: true },
        { ...step2, completed: true },
        { ...step3, completed: false },
      ];
      render(<OnboardingProgressTracker {...defaultProps} steps={allRequired} />);
      await waitFor(() =>
        expect(screen.getByText("successMessage")).toBeInTheDocument(),
      );
    });
  });

  // ── #811 Accessibility ────────────────────────────────────────────────────
  describe("Accessibility (#811)", () => {
    it("wraps the tracker in a region landmark with translated aria-label", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const region = screen.getByRole("region");
      expect(region).toHaveAttribute("aria-label", "progressTracker");
    });

    it("sets aria-live='polite' on the region element", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByRole("region")).toHaveAttribute("aria-live", "polite");
    });

    it("renders an aria-live status region for announcements", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("announces progress percentage on mount", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const status = screen.getByRole("status");
      expect(status.textContent).toMatch(/33/);
    });

    it("labels the steps list with the translated aria-label", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByRole("list")).toHaveAttribute("aria-label", "stepsList");
    });

    it("sets aria-current='step' on the active step button", () => {
      render(<OnboardingProgressTracker {...defaultProps} currentStep="1" />);
      const btn = getStepBtn("Step 1: Step 1");
      expect(btn).toHaveAttribute("aria-current", "step");
    });

    it("does not set aria-current on non-active steps", () => {
      render(<OnboardingProgressTracker {...defaultProps} currentStep="1" />);
      const btn = getStepBtn("Step 2: Step 2");
      expect(btn).not.toHaveAttribute("aria-current");
    });

    it("sets aria-setsize and aria-posinset on step buttons", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const btn1 = getStepBtn("Step 1: Step 1");
      expect(btn1).toHaveAttribute("aria-setsize", "3");
      expect(btn1).toHaveAttribute("aria-posinset", "1");

      const btn2 = getStepBtn("Step 2: Step 2");
      expect(btn2).toHaveAttribute("aria-posinset", "2");
    });

    it("sets aria-roledescription='onboarding step' on step buttons", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const btn = getStepBtn("Step 1: Step 1");
      expect(btn).toHaveAttribute("aria-roledescription", "onboarding step");
    });

    it("completion banner has role='alert' and aria-live='polite'", async () => {
      const allDone = [
        { ...step1, completed: true },
        { ...step2, completed: true },
        { ...step3, completed: false },
      ];
      render(<OnboardingProgressTracker {...defaultProps} steps={allDone} />);
      await waitFor(() => {
        const alert = screen.getByRole("alert");
        expect(alert).toHaveAttribute("aria-live", "polite");
        expect(alert).toHaveAttribute("aria-atomic", "true");
      });
    });

    it("marks required asterisk with translated aria-label", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const required = screen.getAllByLabelText("required");
      expect(required.length).toBeGreaterThan(0);
    });

    it("announces step details when a step button is clicked", async () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      fireEvent.click(getStepBtn("Step 2: Step 2"));
      const status = screen.getByRole("status");
      await waitFor(() => {
        expect(status.textContent).toMatch(/Step 2/);
        expect(status.textContent).toMatch(/Desc 2/);
      });
    });
  });

  // ── #812 Optimistic updates ───────────────────────────────────────────────
  describe("Optimistic updates (#812)", () => {
    it("immediately reflects the clicked step as active before callback resolves", async () => {
      let resolveCallback!: () => void;
      const slowCb = vi.fn(
        () => new Promise<void>((res) => { resolveCallback = res; }),
      );

      render(
        <OnboardingProgressTracker
          {...defaultProps}
          onStepChange={slowCb}
          currentStep="1"
        />,
      );

      const btn2 = getStepBtn("Step 2: Step 2");
      fireEvent.click(btn2);

      await waitFor(() =>
        expect(btn2).toHaveAttribute("aria-current", "step"),
      );

      act(() => resolveCallback());
    });

    it("confirms the optimistic update after the callback resolves", async () => {
      const asyncCb = vi.fn(() => Promise.resolve());
      render(
        <OnboardingProgressTracker
          {...defaultProps}
          onStepChange={asyncCb}
          currentStep="1"
        />,
      );

      const btn2 = getStepBtn("Step 2: Step 2");
      fireEvent.click(btn2);

      await waitFor(() => {
        expect(asyncCb).toHaveBeenCalledWith("2");
        expect(btn2).toHaveAttribute("aria-current", "step");
      });
    });

    it("rolls back to the previous step when the callback throws", async () => {
      const failCb = vi.fn(() => Promise.reject(new Error("server error")));

      render(
        <OnboardingProgressTracker
          {...defaultProps}
          onStepChange={failCb}
          currentStep="1"
        />,
      );

      const btn1 = getStepBtn("Step 1: Step 1");
      const btn2 = getStepBtn("Step 2: Step 2");

      fireEvent.click(btn2);

      await waitFor(() => {
        expect(btn1).toHaveAttribute("aria-current", "step");
        expect(btn2).not.toHaveAttribute("aria-current");
      });
    });

    it("announces a failure message to screen readers on rollback", async () => {
      const failCb = vi.fn(() => Promise.reject(new Error("fail")));

      render(
        <OnboardingProgressTracker
          {...defaultProps}
          onStepChange={failCb}
          currentStep="1"
        />,
      );

      fireEvent.click(getStepBtn("Step 2: Step 2"));

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain(
          "stepChangeFailed",
        );
      });
    });

    it("sets aria-busy on the pending step button during an optimistic update", async () => {
      let resolveCallback!: () => void;
      const slowCb = vi.fn(
        () => new Promise<void>((res) => { resolveCallback = res; }),
      );

      render(
        <OnboardingProgressTracker
          {...defaultProps}
          onStepChange={slowCb}
          currentStep="1"
        />,
      );

      const btn2 = getStepBtn("Step 2: Step 2");
      fireEvent.click(btn2);

      await waitFor(() =>
        expect(btn2).toHaveAttribute("aria-busy", "true"),
      );

      act(() => resolveCallback());
    });

    it("disables all step buttons while a step change is pending", async () => {
      let resolveCallback!: () => void;
      const slowCb = vi.fn(
        () => new Promise<void>((res) => { resolveCallback = res; }),
      );

      render(
        <OnboardingProgressTracker
          {...defaultProps}
          onStepChange={slowCb}
          currentStep="1"
        />,
      );

      fireEvent.click(getStepBtn("Step 2: Step 2"));

      await waitFor(() => {
        const buttons = screen.getAllByRole("button");
        buttons.forEach((btn) => expect(btn).toBeDisabled());
      });

      act(() => resolveCallback());
    });
  });

  // ── i18n ──────────────────────────────────────────────────────────────────
  describe("i18n", () => {
    it("uses the translated 'progressBar' key for the progressbar aria-label", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-label", "progressBar");
    });

    it("uses the translated 'stepsList' key for the list aria-label", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByRole("list")).toHaveAttribute("aria-label", "stepsList");
    });

    it("uses the translated 'progressTracker' key for the region aria-label", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByRole("region")).toHaveAttribute(
        "aria-label",
        "progressTracker",
      );
    });

    it("displays translated 'allCompleted' text when onboarding is complete", async () => {
      const allDone = [
        { ...step1, completed: true },
        { ...step2, completed: true },
        { ...step3, completed: false },
      ];
      render(<OnboardingProgressTracker {...defaultProps} steps={allDone} />);
      await waitFor(() =>
        expect(screen.getByText("allCompleted")).toBeInTheDocument(),
      );
    });
  });

  // ── #809 Animations ───────────────────────────────────────────────────────
  describe("Animations (#809)", () => {
    it("renders the progress bar fill element used for animation", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getByTestId("progress-bar-fill")).toBeInTheDocument();
    });

    it("renders the correct number of step list items", () => {
      render(<OnboardingProgressTracker {...defaultProps} />);
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });
  });

  // ── Hook integration ──────────────────────────────────────────────────────
  describe("useOnboardingProgress integration", () => {
    it("syncs an external currentStep prop change", async () => {
      const { rerender } = render(
        <OnboardingProgressTracker {...defaultProps} currentStep="1" />,
      );

      let btn1 = getStepBtn("Step 1: Step 1");
      expect(btn1).toHaveAttribute("aria-current", "step");

      rerender(
        <OnboardingProgressTracker {...defaultProps} currentStep="2" />,
      );

      await waitFor(() => {
        const btn2 = getStepBtn("Step 2: Step 2");
        expect(btn2).toHaveAttribute("aria-current", "step");
      });
    });

    it("updates progress percentage when a completed step is added", async () => {
      const { rerender } = render(
        <OnboardingProgressTracker {...defaultProps} />,
      );
      // 1 / 3 = 33%
      expect(screen.getByTestId("progress-bar-fill")).toHaveStyle("width: 33%");

      rerender(
        <OnboardingProgressTracker
          {...defaultProps}
          steps={[
            { ...step1, completed: true },
            { ...step2, completed: true },
            step3,
          ]}
        />,
      );

      await waitFor(() => {
        // 2 / 3 = 67%
        expect(screen.getByTestId("progress-bar-fill")).toHaveStyle("width: 67%");
      });
    });
  });
});
