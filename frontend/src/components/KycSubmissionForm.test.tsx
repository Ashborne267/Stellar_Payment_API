/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import KycSubmissionForm from "./KycSubmissionForm";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

// next-intl: return the translation key as the display string so tests can
// assert on key names directly (e.g. "personalInfo", "next", etc.)
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// framer-motion: render plain HTML elements so jsdom doesn't choke on
// animation APIs. AnimatePresence just renders its children.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(function MockMotion(
          { children, ...props }: any,
          ref: any,
        ) {
          // Drop framer-motion-specific props before passing to the DOM element
          const {
            variants, initial, animate, exit, custom, whileHover, whileTap,
            transition, layout, layoutId, ...domProps
          } = props;
          void variants; void initial; void animate; void exit; void custom;
          void whileHover; void whileTap; void transition; void layout; void layoutId;
          return React.createElement(tag, { ...domProps, ref }, children);
        }),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    type: {},
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fillPersonalStep() {
  fireEvent.change(screen.getByPlaceholderText("firstName"), {
    target: { value: "Jane" },
  });
  fireEvent.change(screen.getByPlaceholderText("lastName"), {
    target: { value: "Doe" },
  });
}

function navigateToStep(targetIndex: number) {
  // Start on step 1; navigate forward by clicking "next" (after filling
  // required personal info fields on step 1).
  if (targetIndex >= 1) {
    fillPersonalStep();
    fireEvent.click(screen.getByText("next"));
  }
  for (let i = 1; i < targetIndex; i++) {
    fireEvent.click(screen.getByText("next"));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("KycSubmissionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  // ── Step rendering ───────────────────────────────────────────────────────

  it("renders personal info step initially", () => {
    render(React.createElement(KycSubmissionForm));

    expect(screen.getByText("personalInfo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("firstName")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("lastName")).toBeInTheDocument();
  });

  it("navigates to address step after filling required personal fields", () => {
    render(React.createElement(KycSubmissionForm));

    fillPersonalStep();
    fireEvent.click(screen.getByText("next"));

    expect(screen.getByText("addressInfo")).toBeInTheDocument();
  });

  it("navigates back from address to personal step", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(1);
    expect(screen.getByText("addressInfo")).toBeInTheDocument();

    fireEvent.click(screen.getByText("back"));
    expect(screen.getByText("personalInfo")).toBeInTheDocument();
  });

  it("shows documents step", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(2);
    expect(screen.getByText("documents")).toBeInTheDocument();
    expect(screen.getByLabelText("idFront")).toBeInTheDocument();
    expect(screen.getByLabelText("selfie")).toBeInTheDocument();
  });

  it("shows review step with summary", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(3);
    expect(screen.getByText("review")).toBeInTheDocument();
    // Submit button (not "next") is shown on the last step
    expect(screen.getByText("submit")).toBeInTheDocument();
  });

  // ── Progress indicator ───────────────────────────────────────────────────

  it("displays progress as 'X of 4'", () => {
    render(React.createElement(KycSubmissionForm));

    expect(screen.getByText("1 of 4")).toBeInTheDocument();
  });

  it("advances progress counter when navigating forward", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(1);
    expect(screen.getByText("2 of 4")).toBeInTheDocument();

    navigateToStep(2);
    expect(screen.getByText("3 of 4")).toBeInTheDocument();
  });

  it("shows 4 step indicators in the progress bar", () => {
    const { container } = render(React.createElement(KycSubmissionForm));
    // Each step dot is a div with rounded-full in its class
    const dots = container.querySelectorAll('[role="listitem"]');
    expect(dots).toHaveLength(4);
  });

  it("marks the active step with aria-current='step'", () => {
    const { container } = render(React.createElement(KycSubmissionForm));
    const current = container.querySelector('[aria-current="step"]');
    expect(current).toBeInTheDocument();
  });

  // ── Validation ───────────────────────────────────────────────────────────

  it("stays on personal step when next is clicked with empty required fields", () => {
    render(React.createElement(KycSubmissionForm));

    // Do NOT fill firstName / lastName
    fireEvent.click(screen.getByText("next"));

    expect(screen.getByText("personalInfo")).toBeInTheDocument();
  });

  it("proceeds to address step once required fields are filled", () => {
    render(React.createElement(KycSubmissionForm));

    // First click without required fields — should stay
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByText("personalInfo")).toBeInTheDocument();

    // Fill required fields then try again
    fillPersonalStep();
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByText("addressInfo")).toBeInTheDocument();
  });

  // ── Bounds ───────────────────────────────────────────────────────────────

  it("back button is disabled (no-op) on the first step", () => {
    render(React.createElement(KycSubmissionForm));

    const backBtn = screen.getByText("back").closest("button")!;
    expect(backBtn).toBeDisabled();
  });

  it("does not navigate past the last step", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(3);
    expect(screen.getByText("review")).toBeInTheDocument();
    // On the review step there is no "next" button, only "submit"
    expect(screen.queryByText("next")).not.toBeInTheDocument();
    expect(screen.getByText("submit")).toBeInTheDocument();
  });

  // ── State preservation ───────────────────────────────────────────────────

  it("preserves personal info when navigating back from address step", () => {
    render(React.createElement(KycSubmissionForm));

    fireEvent.change(screen.getByPlaceholderText("firstName"), {
      target: { value: "John" },
    });
    fireEvent.change(screen.getByPlaceholderText("lastName"), {
      target: { value: "Smith" },
    });
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("back"));

    const firstNameInput = screen.getByPlaceholderText("firstName") as HTMLInputElement;
    expect(firstNameInput.value).toBe("John");
  });

  it("preserves address info when navigating back from documents step", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(1);
    fireEvent.change(screen.getByPlaceholderText("city"), {
      target: { value: "Lagos" },
    });
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("back"));

    const cityInput = screen.getByPlaceholderText("city") as HTMLInputElement;
    expect(cityInput.value).toBe("Lagos");
  });

  it("updates firstName field", () => {
    render(React.createElement(KycSubmissionForm));

    const input = screen.getByPlaceholderText("firstName") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alice" } });
    expect(input.value).toBe("Alice");
  });

  it("updates city field on address step", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(1);
    const cityInput = screen.getByPlaceholderText("city") as HTMLInputElement;
    fireEvent.change(cityInput, { target: { value: "Abuja" } });
    expect(cityInput.value).toBe("Abuja");
  });

  // ── Review summary ───────────────────────────────────────────────────────

  it("displays filled values in the review summary", () => {
    render(React.createElement(KycSubmissionForm));

    fireEvent.change(screen.getByPlaceholderText("firstName"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByPlaceholderText("lastName"), {
      target: { value: "Lovelace" },
    });
    fireEvent.click(screen.getByText("next")); // → address

    fireEvent.change(screen.getByPlaceholderText("city"), {
      target: { value: "London" },
    });
    fireEvent.click(screen.getByText("next")); // → documents
    fireEvent.click(screen.getByText("next")); // → review

    expect(screen.getByText("review")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Lovelace")).toBeInTheDocument();
    expect(screen.getByText("London")).toBeInTheDocument();
  });

  // ── Submission ───────────────────────────────────────────────────────────

  it("shows success screen after successful submission", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(React.createElement(KycSubmissionForm));

    navigateToStep(3);
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() => {
      expect(screen.getByText("successTitle")).toBeInTheDocument();
    });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("calls toast.error and shows error on failed submission", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });

    render(React.createElement(KycSubmissionForm));

    navigateToStep(3);
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });

  it("calls toast.error when fetch throws a network error", async () => {
    (global.fetch as any).mockRejectedValue(new Error("Network error"));

    render(React.createElement(KycSubmissionForm));

    navigateToStep(3);
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });

  it("disables submit button while submitting", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); // never resolves

    render(React.createElement(KycSubmissionForm));

    navigateToStep(3);
    const submitBtn = screen.getByText("submit").closest("button")!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
    });
  });

  it("resets form to step 1 when submitAnother is clicked", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(React.createElement(KycSubmissionForm));

    navigateToStep(3);
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() => {
      expect(screen.getByText("successTitle")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("submitAnother"));

    await waitFor(() => {
      expect(screen.getByText("personalInfo")).toBeInTheDocument();
    });

    // Fields should be cleared
    const firstName = screen.getByPlaceholderText("firstName") as HTMLInputElement;
    expect(firstName.value).toBe("");
  });

  // ── File uploads ─────────────────────────────────────────────────────────

  it("accepts file upload on documents step", () => {
    render(React.createElement(KycSubmissionForm));

    navigateToStep(2);

    const idFrontInput = screen.getByLabelText("idFront") as HTMLInputElement;
    const file = new File(["content"], "id.png", { type: "image/png" });
    fireEvent.change(idFrontInput, { target: { files: [file] } });

    expect(idFrontInput.files?.[0]).toBe(file);
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("has a progressbar role with correct aria-valuenow", () => {
    render(React.createElement(KycSubmissionForm));

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "1");
    expect(progressbar).toHaveAttribute("aria-valuemax", "4");
  });

  it("has aria-invalid on required fields when validation fails", () => {
    render(React.createElement(KycSubmissionForm));

    // Trigger validation by clicking next with empty required fields
    fireEvent.click(screen.getByText("next"));

    const firstNameInput = screen.getByPlaceholderText("firstName");
    expect(firstNameInput).toHaveAttribute("aria-invalid", "true");
  });

  it("provides a screen reader status region", () => {
    render(React.createElement(KycSubmissionForm));

    const liveRegion = document.querySelector('[role="status"][aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it("marks the form container with role=region", () => {
    render(React.createElement(KycSubmissionForm));
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  // ── Screen reader support ─────────────────────────────────────────────────

  it("step listitems have descriptive aria-labels including step name and status", () => {
    const { container } = render(React.createElement(KycSubmissionForm));
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items[0]).toHaveAttribute("aria-label", expect.stringContaining("personalInfo"));
    expect(items[0]).toHaveAttribute("aria-label", expect.stringContaining("current"));
    expect(items[1]).toHaveAttribute("aria-label", expect.stringContaining("addressInfo"));
    expect(items[1]).toHaveAttribute("aria-label", expect.stringContaining("upcoming"));
  });

  it("step listitem status updates to completed after advancing past it", () => {
    const { container } = render(React.createElement(KycSubmissionForm));
    navigateToStep(1);
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items[0]).toHaveAttribute("aria-label", expect.stringContaining("completed"));
    expect(items[1]).toHaveAttribute("aria-label", expect.stringContaining("current"));
  });

  it("progressbar aria-label includes current step name", () => {
    render(React.createElement(KycSubmissionForm));
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-label", expect.stringContaining("personalInfo"));
  });

  it("progressbar aria-label updates to next step name after navigation", () => {
    render(React.createElement(KycSubmissionForm));
    navigateToStep(1);
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-label", expect.stringContaining("addressInfo"));
  });

  it("back button has descriptive aria-label with destination step name", () => {
    render(React.createElement(KycSubmissionForm));
    navigateToStep(1);
    const backBtn = screen.getByText("back").closest("button")!;
    expect(backBtn).toHaveAttribute("aria-label", expect.stringContaining("personalInfo"));
  });

  it("next button has descriptive aria-label with destination step name", () => {
    render(React.createElement(KycSubmissionForm));
    const nextBtn = screen.getByText("next").closest("button")!;
    expect(nextBtn).toHaveAttribute("aria-label", expect.stringContaining("addressInfo"));
  });

  // ── Additional unit tests ─────────────────────────────────────────────────

  it("shows validation error message text for required fields", () => {
    render(React.createElement(KycSubmissionForm));
    fireEvent.click(screen.getByText("next"));
    expect(screen.getAllByText("required").length).toBeGreaterThanOrEqual(1);
  });

  it("sets aria-describedby on invalid firstName input pointing to error element", () => {
    render(React.createElement(KycSubmissionForm));
    fireEvent.click(screen.getByText("next"));
    const firstNameInput = screen.getByPlaceholderText("firstName");
    const describedBy = firstNameInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    // useId() produces IDs with colons — use getElementById, not querySelector
    const errorEl = document.getElementById(describedBy!);
    expect(errorEl).toBeInTheDocument();
  });

  it("clears validation errors after filling required fields and navigating", () => {
    render(React.createElement(KycSubmissionForm));
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByPlaceholderText("firstName")).toHaveAttribute("aria-invalid", "true");

    fillPersonalStep();
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("back"));
    expect(screen.getByPlaceholderText("firstName")).toHaveAttribute("aria-invalid", "false");
  });

  it("accepts file upload on idBack input", () => {
    render(React.createElement(KycSubmissionForm));
    navigateToStep(2);
    const idBackInput = screen.getByLabelText("idBack") as HTMLInputElement;
    const file = new File(["content"], "id-back.png", { type: "image/png" });
    fireEvent.change(idBackInput, { target: { files: [file] } });
    expect(idBackInput.files?.[0]).toBe(file);
  });

  it("accepts file upload on selfie input", () => {
    render(React.createElement(KycSubmissionForm));
    navigateToStep(2);
    const selfieInput = screen.getByLabelText("selfie") as HTMLInputElement;
    const file = new File(["content"], "selfie.jpg", { type: "image/jpeg" });
    fireEvent.change(selfieInput, { target: { files: [file] } });
    expect(selfieInput.files?.[0]).toBe(file);
  });

  it("updates idType select on documents step", () => {
    render(React.createElement(KycSubmissionForm));
    navigateToStep(2);
    const select = screen.getByLabelText("idType") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "passport" } });
    expect(select.value).toBe("passport");
  });

  it("updates idNumber field on documents step", () => {
    render(React.createElement(KycSubmissionForm));
    navigateToStep(2);
    const idNumberInput = screen.getByPlaceholderText("idNumber") as HTMLInputElement;
    fireEvent.change(idNumberInput, { target: { value: "A1234567" } });
    expect(idNumberInput.value).toBe("A1234567");
  });

  it("review step shows dash for empty optional fields", () => {
    render(React.createElement(KycSubmissionForm));
    fillPersonalStep();
    fireEvent.click(screen.getByText("next")); // → address
    fireEvent.click(screen.getByText("next")); // → documents
    fireEvent.click(screen.getByText("next")); // → review
    // city was not filled, so it renders the placeholder dash
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows error alert in review step when submission fails", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });
    render(React.createElement(KycSubmissionForm));
    navigateToStep(3);
    fireEvent.click(screen.getByText("submit"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
