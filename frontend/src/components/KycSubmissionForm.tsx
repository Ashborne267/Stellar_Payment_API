"use client";

import React, { useReducer, useCallback, useState, useId, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  kycFlowReducer,
  initialKycFlowState,
  selectIsStepLoading,
  selectHasStepError,
  selectAnyFileUploading,
  type KycStep,
  type FileUploadField,
} from "@/lib/kyc-flow";

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS: KycStep[] = ["personal", "address", "documents", "review"];
const TOTAL_STEPS = STEPS.length;
const STEP_LABEL_KEYS: Record<KycStep, string> = {
  personal: "personalInfo",
  address: "addressInfo",
  documents: "documents",
  review: "review",
};

// ── Animation variants ────────────────────────────────────────────────────────

const stepVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0, transition: { duration: 0.2 } }),
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

const errorBannerVariants: Variants = {
  hidden: { opacity: 0, y: -8, height: 0 },
  visible: { opacity: 1, y: 0, height: "auto", transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, height: 0, transition: { duration: 0.18 } },
};

// ── Shimmer bone ──────────────────────────────────────────────────────────────

const Bone = memo(function Bone({ className = "" }: { className?: string }) {
  return <div className={`kyc-shimmer rounded-lg ${className}`} aria-hidden="true" />;
});

// ── Step skeleton ─────────────────────────────────────────────────────────────

function StepSkeleton() {
  return (
    <div className="space-y-4" data-testid="step-skeleton" aria-hidden="true">
      <Bone className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Bone className="h-4 w-20" /><Bone className="h-11 w-full" /></div>
        <div className="space-y-1.5"><Bone className="h-4 w-20" /><Bone className="h-11 w-full" /></div>
      </div>
      <div className="space-y-1.5"><Bone className="h-4 w-24" /><Bone className="h-11 w-full" /></div>
      <div className="space-y-1.5"><Bone className="h-4 w-24" /><Bone className="h-11 w-full" /></div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

const Spinner = memo(function Spinner({ size = "h-4 w-4", className = "" }: { size?: string; className?: string }) {
  return (
    <motion.span
      className={`inline-block rounded-full border-2 border-current border-t-transparent ${size} ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    />
  );
});

// ── Error banner ──────────────────────────────────────────────────────────────

interface ErrorBannerProps {
  message: string;
  heading: string;
  retryLabel: string;
  dismissLabel: string;
  retryCount: number;
  onRetry: () => void;
  onDismiss: () => void;
}

const ErrorBanner = memo(function ErrorBanner({
  message, heading, retryLabel, dismissLabel, retryCount, onRetry, onDismiss,
}: ErrorBannerProps) {
  return (
    <motion.div
      variants={errorBannerVariants}
      initial="hidden" animate="visible" exit="exit"
      className="overflow-hidden rounded-xl border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/40"
      role="alert" aria-live="assertive" aria-atomic="true"
      data-testid="error-banner"
    >
      <div className="flex items-start gap-3 p-4">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">{heading}</p>
          <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">{message}</p>
          {retryCount > 0 && (
            <p className="mt-1 text-xs text-red-500" data-testid="retry-count">
              {`Attempt ${retryCount + 1}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button" onClick={onRetry}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 dark:border-red-700/60 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/30"
            data-testid="retry-button"
          >
            {retryLabel}
          </button>
          <button
            type="button" onClick={onDismiss} aria-label={dismissLabel}
            className="rounded-lg p-1 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-900/30"
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

// ── File upload field ─────────────────────────────────────────────────────────

interface FileFieldProps {
  id: string;
  label: string;
  accept: string;
  uploadState: { state: string; errorMessage: string | null; previewUrl: string | null };
  uploadingLabel: string;
  successLabel: string;
  retryLabel: string;
  removeLabel: string;
  onChange: (file: File | null) => void;
  onRetry: () => void;
  onRemove: () => void;
}

const FileField = memo(function FileField({
  id, label, accept, uploadState,
  uploadingLabel, successLabel, retryLabel, removeLabel,
  onChange, onRetry, onRemove,
}: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files?.[0] ?? null);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-pluto-900 dark:text-pluto-100">
        {label}
      </label>

      <div className={`relative rounded-xl border-2 border-dashed p-3 transition-colors ${
        uploadState.state === "error"
          ? "border-red-400 bg-red-50 dark:border-red-700/60 dark:bg-red-950/30"
          : uploadState.state === "success"
            ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-950/30"
            : "border-pluto-200 bg-pluto-50/50 hover:border-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/20"
      }`}>

        {/* Uploading overlay */}
        {uploadState.state === "uploading" && (
          <div className="flex items-center gap-2 py-1" data-testid={`${id}-uploading`} aria-live="polite">
            <Spinner size="h-4 w-4" className="text-pluto-500" />
            <span className="text-xs text-pluto-600 dark:text-pluto-400">{uploadingLabel}</span>
          </div>
        )}

        {/* Success state */}
        {uploadState.state === "success" && (
          <div className="flex items-center justify-between gap-2" data-testid={`${id}-success`}>
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="truncate text-xs font-medium text-emerald-700 dark:text-emerald-400">{successLabel}</span>
            </div>
            <button type="button" onClick={onRemove} aria-label={removeLabel}
              className="shrink-0 rounded p-0.5 text-pluto-400 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              data-testid={`${id}-remove`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error state */}
        {uploadState.state === "error" && (
          <div className="flex items-center justify-between gap-2" data-testid={`${id}-error`}>
            <p className="truncate text-xs text-red-600 dark:text-red-400">{uploadState.errorMessage}</p>
            <button type="button" onClick={onRetry}
              className="shrink-0 rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-red-700/60 dark:bg-transparent dark:text-red-300"
              data-testid={`${id}-retry`}>
              {retryLabel}
            </button>
          </div>
        )}

        {/* Default idle input */}
        {(uploadState.state === "idle") && (
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="w-full text-xs text-pluto-600 file:mr-3 file:rounded-lg file:border-0 file:bg-pluto-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-pluto-700 hover:file:bg-pluto-200 dark:text-pluto-300 dark:file:bg-pluto-800 dark:file:text-pluto-200"
            aria-label={label}
          />
        )}

        {/* Shimmer progress bar during upload */}
        {uploadState.state === "uploading" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-xl">
            <div className="kyc-shimmer h-full w-full" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
});

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  id, label, error, children,
}: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-pluto-900 dark:text-pluto-100">
        {label}
      </label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-error`} role="alert"
            className="text-xs text-red-600 dark:text-red-400"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  stepIndex: number;
  currentStep: KycStep;
  isStepLoading: boolean;
  uid: string;
  t: (key: string, params?: Record<string, unknown>) => string;
}

function ProgressBar({ stepIndex, currentStep, isStepLoading, uid, t }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={stepIndex + 1}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-label={t("progressLabel", { current: stepIndex + 1, total: TOTAL_STEPS })}
      className="space-y-2"
    >
      <div className="flex items-center justify-between text-xs text-pluto-600 dark:text-pluto-400">
        <span id={`${uid}-progress-label`}>
          {stepIndex + 1} {t("of")} {TOTAL_STEPS}
        </span>
        {isStepLoading && (
          <span className="flex items-center gap-1.5 text-pluto-500 dark:text-pluto-300" aria-live="polite" data-testid="step-loading-indicator">
            <Spinner size="h-3 w-3" />
            <span className="text-[0.7rem]">{t("loadingStep")}</span>
          </span>
        )}
      </div>

      <div className="flex gap-1.5" role="list" aria-label={t("steps")}>
        {STEPS.map((s, i) => {
          const isDone = i < stepIndex;
          const isCurrent = i === stepIndex;
          const statusKey = isDone ? "completed" : isCurrent ? "current" : "upcoming";
          return (
            <div
              key={s}
              role="listitem"
              aria-label={`${t(STEP_LABEL_KEYS[s])} – ${t(statusKey)}`}
              aria-current={isCurrent ? "step" : undefined}
              className="relative h-2 flex-1 overflow-hidden rounded-full bg-pluto-100 dark:bg-pluto-800"
            >
              {/* Filled portion */}
              {(isDone || isCurrent) && (
                <motion.div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    isDone ? "bg-pluto-500" : "bg-pluto-600 dark:bg-pluto-400"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              {/* Shimmer when this step is loading */}
              {isCurrent && isStepLoading && (
                <div className="kyc-shimmer absolute inset-0 rounded-full" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

interface SuccessScreenProps {
  formTitleLabel: string;
  successTitle: string;
  successDescription: string;
  submitAnotherLabel: string;
  announcement: string;
  onReset: () => void;
}

function SuccessScreen({
  formTitleLabel, successTitle, successDescription,
  submitAnotherLabel, announcement, onReset,
}: SuccessScreenProps) {
  return (
    <div className="w-full max-w-2xl mx-auto" role="region" aria-label={formTitleLabel}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      <motion.div
        className="flex flex-col items-center gap-6 rounded-3xl border border-pluto-100 bg-white p-10 text-center shadow-lg dark:border-pluto-800/60 dark:bg-pluto-900/80"
        variants={fadeUp} initial="hidden" animate="visible"
      >
        {/* Animated success icon */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="kyc-pulse-ring absolute h-full w-full rounded-full bg-emerald-100 dark:bg-emerald-900/30" aria-hidden="true" />
          <motion.div
            className="kyc-success-icon relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 18 }}
          >
            <svg className="h-9 w-9 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <motion.path
                strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ delay: 0.35, duration: 0.45, ease: "easeOut" }}
              />
            </svg>
          </motion.div>
        </div>

        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
        >
          <h2 className="text-2xl font-bold text-pluto-900 dark:text-pluto-50" aria-live="assertive">
            {successTitle}
          </h2>
          <p className="text-pluto-600 dark:text-pluto-400">{successDescription}</p>
        </motion.div>

        <motion.button
          type="button" onClick={onReset}
          className="rounded-xl bg-pluto-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-pluto-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400 focus-visible:ring-offset-2 dark:bg-pluto-500 dark:hover:bg-pluto-400"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        >
          {submitAnotherLabel}
        </motion.button>
      </motion.div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function KycSubmissionForm() {
  const t = useTranslations("kycForm");
  const uid = useId();
  const [state, dispatch] = useReducer(kycFlowReducer, initialKycFlowState);
  const [direction, setDirection] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  const stepIndex = STEPS.indexOf(state.currentStep);
  const isStepLoading = selectIsStepLoading(state);
  const hasStepError = selectHasStepError(state);
  const anyFileUploading = selectAnyFileUploading(state);

  // Simulate brief step-loading transition on navigate
  const simulateStepLoad = useCallback((targetStep: KycStep) => {
    dispatch({ type: "STEP_LOADING" });
    const timer = setTimeout(() => {
      dispatch({ type: "SET_STEP", step: targetStep });
      dispatch({ type: "STEP_LOADED" });
    }, 320);
    return () => clearTimeout(timer);
  }, []);

  const validateCurrentStep = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (state.currentStep === "personal") {
      if (!state.personal.firstName.trim()) errs.firstName = t("required");
      if (!state.personal.lastName.trim()) errs.lastName = t("required");
    }
    setStepErrors(errs);
    return Object.keys(errs).length === 0;
  }, [state.currentStep, state.personal, t]);

  const goNext = useCallback(() => {
    if (!validateCurrentStep()) { setAnnouncement(t("validationError")); return; }
    if (stepIndex < TOTAL_STEPS - 1) {
      const nextStep = STEPS[stepIndex + 1]!;
      setDirection(1);
      setStepErrors({});
      setAnnouncement(t("navigatingTo", { step: t(STEP_LABEL_KEYS[nextStep]) }));
      simulateStepLoad(nextStep);
    }
  }, [validateCurrentStep, stepIndex, t, simulateStepLoad]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      const prevStep = STEPS[stepIndex - 1]!;
      setDirection(-1);
      setStepErrors({});
      setAnnouncement(t("navigatingTo", { step: t(STEP_LABEL_KEYS[prevStep]) }));
      simulateStepLoad(prevStep);
    }
  }, [stepIndex, t, simulateStepLoad]);

  const handleFileChange = useCallback(
    (field: FileUploadField, file: File | null) => {
      if (!file) return;
      dispatch({ type: "FILE_UPLOAD_START", field });
      setAnnouncement(t("uploadingFile", { name: file.name }));
      // Simulate async upload — in production this would call a real endpoint
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      const timer = setTimeout(() => {
        const docField = field === "idFront" ? "idFrontFile"
          : field === "idBack" ? "idBackFile" : "selfieFile";
        dispatch({ type: "UPDATE_DOCUMENTS", data: { [docField]: file } });
        dispatch({ type: "FILE_UPLOAD_SUCCESS", field, previewUrl });
        setAnnouncement(t("uploadSuccess", { name: file.name }));
      }, 600);
      return () => { clearTimeout(timer); if (previewUrl) URL.revokeObjectURL(previewUrl); };
    },
    [t],
  );

  const handleFileRemove = useCallback(
    (field: FileUploadField) => {
      const previewUrl = state.fileUploads[field].previewUrl;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      dispatch({ type: "FILE_UPLOAD_RESET", field });
      const docField = field === "idFront" ? "idFrontFile"
        : field === "idBack" ? "idBackFile" : "selfieFile";
      dispatch({ type: "UPDATE_DOCUMENTS", data: { [docField]: null } });
    },
    [state.fileUploads],
  );

  const handleSubmit = useCallback(async () => {
    dispatch({ type: "SUBMIT" });
    setAnnouncement(t("processingSubmission"));
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personal: state.personal,
          address: state.address,
          documents: { idType: state.documents.idType, idNumber: state.documents.idNumber },
        }),
      });
      if (!res.ok) throw new Error(t("submitError"));
      dispatch({ type: "SUBMIT_SUCCESS", submittedAt: new Date().toISOString() });
      setAnnouncement(t("successTitle"));
      toast.success(t("successTitle"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "SUBMIT_FAILURE", error: msg });
      setAnnouncement(msg);
      toast.error(msg);
    }
  }, [state, t]);

  // ── Success screen ──────────────────────────────────────────────────────────
  if (state.submittedAt) {
    return (
      <SuccessScreen
        formTitleLabel={t("formTitle")}
        successTitle={t("successTitle")}
        successDescription={t("successDescription")}
        submitAnotherLabel={t("submitAnother")}
        announcement={announcement}
        onReset={() => dispatch({ type: "RESET" })}
      />
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl mx-auto" role="region" aria-label={t("formTitle")}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>

      <div className="rounded-3xl border border-pluto-100 bg-white p-6 shadow-lg sm:p-8 dark:border-pluto-800/60 dark:bg-pluto-900/80 space-y-6">

        {/* Progress bar */}
        <ProgressBar
          stepIndex={stepIndex}
          currentStep={state.currentStep}
          isStepLoading={isStepLoading}
          uid={uid}
          t={t as (key: string, params?: Record<string, unknown>) => string}
        />

        {/* Step error banner */}
        <AnimatePresence>
          {hasStepError && state.stepError && (
            <ErrorBanner
              message={state.stepError}
              heading={t("errorHeading")}
              retryLabel={t("retryStep")}
              dismissLabel={t("dismissError")}
              retryCount={state.stepRetryCount}
              onRetry={() => dispatch({ type: "RETRY" })}
              onDismiss={() => dispatch({ type: "CLEAR_STEP_ERROR" })}
            />
          )}
        </AnimatePresence>

        {/* Step content — skeleton while loading, real content when ready */}
        <AnimatePresence mode="wait" custom={direction}>
          {isStepLoading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <StepSkeleton />
            </motion.div>
          ) : (
            <motion.div
              key={state.currentStep}
              custom={direction}
              variants={stepVariants}
              initial="enter" animate="center" exit="exit"
              className="space-y-4"
            >
              {/* ── Personal ─────────────────────────────────────────────── */}
              {state.currentStep === "personal" && (
                <section aria-labelledby={`${uid}-personal-title`} className="space-y-4">
                  <h2 id={`${uid}-personal-title`} className="text-xl font-bold text-pluto-900 dark:text-pluto-50">
                    {t("personalInfo")}
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id={`${uid}-firstName`} label={t("firstName")} error={stepErrors.firstName}>
                      <input
                        id={`${uid}-firstName`} type="text" placeholder={t("firstName")}
                        value={state.personal.firstName}
                        onChange={(e) => dispatch({ type: "UPDATE_PERSONAL", data: { firstName: e.target.value } })}
                        aria-required="true" aria-invalid={!!stepErrors.firstName}
                        aria-describedby={stepErrors.firstName ? `${uid}-firstName-error` : undefined}
                        className="rounded-xl border border-pluto-200 px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                      />
                    </Field>
                    <Field id={`${uid}-lastName`} label={t("lastName")} error={stepErrors.lastName}>
                      <input
                        id={`${uid}-lastName`} type="text" placeholder={t("lastName")}
                        value={state.personal.lastName}
                        onChange={(e) => dispatch({ type: "UPDATE_PERSONAL", data: { lastName: e.target.value } })}
                        aria-required="true" aria-invalid={!!stepErrors.lastName}
                        aria-describedby={stepErrors.lastName ? `${uid}-lastName-error` : undefined}
                        className="rounded-xl border border-pluto-200 px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                      />
                    </Field>
                  </div>
                  <Field id={`${uid}-email`} label={t("email")}>
                    <input
                      id={`${uid}-email`} type="email" placeholder={t("email")}
                      value={state.personal.nationality}
                      onChange={(e) => dispatch({ type: "UPDATE_PERSONAL", data: { nationality: e.target.value } })}
                      className="rounded-xl border border-pluto-200 px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                    />
                  </Field>
                  <Field id={`${uid}-dateOfBirth`} label={t("dateOfBirth")}>
                    <input
                      id={`${uid}-dateOfBirth`} type="date"
                      value={state.personal.dateOfBirth}
                      onChange={(e) => dispatch({ type: "UPDATE_PERSONAL", data: { dateOfBirth: e.target.value } })}
                      className="rounded-xl border border-pluto-200 px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50"
                    />
                  </Field>
                </section>
              )}

              {/* ── Address ──────────────────────────────────────────────── */}
              {state.currentStep === "address" && (
                <section aria-labelledby={`${uid}-address-title`} className="space-y-4">
                  <h2 id={`${uid}-address-title`} className="text-xl font-bold text-pluto-900 dark:text-pluto-50">
                    {t("addressInfo")}
                  </h2>
                  <Field id={`${uid}-street`} label={t("street")}>
                    <input
                      id={`${uid}-street`} type="text" placeholder={t("street")}
                      value={state.address.street}
                      onChange={(e) => dispatch({ type: "UPDATE_ADDRESS", data: { street: e.target.value } })}
                      className="rounded-xl border border-pluto-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id={`${uid}-city`} label={t("city")}>
                      <input
                        id={`${uid}-city`} type="text" placeholder={t("city")}
                        value={state.address.city}
                        onChange={(e) => dispatch({ type: "UPDATE_ADDRESS", data: { city: e.target.value } })}
                        className="rounded-xl border border-pluto-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                      />
                    </Field>
                    <Field id={`${uid}-addressState`} label={t("state")}>
                      <input
                        id={`${uid}-addressState`} type="text" placeholder={t("state")}
                        value={state.address.state}
                        onChange={(e) => dispatch({ type: "UPDATE_ADDRESS", data: { state: e.target.value } })}
                        className="rounded-xl border border-pluto-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id={`${uid}-postalCode`} label={t("postalCode")}>
                      <input
                        id={`${uid}-postalCode`} type="text" placeholder={t("postalCode")}
                        value={state.address.postalCode}
                        onChange={(e) => dispatch({ type: "UPDATE_ADDRESS", data: { postalCode: e.target.value } })}
                        className="rounded-xl border border-pluto-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                      />
                    </Field>
                    <Field id={`${uid}-country`} label={t("country")}>
                      <input
                        id={`${uid}-country`} type="text" placeholder={t("country")}
                        value={state.address.country}
                        onChange={(e) => dispatch({ type: "UPDATE_ADDRESS", data: { country: e.target.value } })}
                        className="rounded-xl border border-pluto-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                      />
                    </Field>
                  </div>
                </section>
              )}

              {/* ── Documents ────────────────────────────────────────────── */}
              {state.currentStep === "documents" && (
                <section aria-labelledby={`${uid}-docs-title`} className="space-y-4">
                  <h2 id={`${uid}-docs-title`} className="text-xl font-bold text-pluto-900 dark:text-pluto-50">
                    {t("documents")}
                  </h2>
                  <Field id={`${uid}-idType`} label={t("idType")}>
                    <select
                      id={`${uid}-idType`} value={state.documents.idType}
                      onChange={(e) => dispatch({ type: "UPDATE_DOCUMENTS", data: { idType: e.target.value as "passport" | "drivers_license" | "national_id" | "" } })}
                      className="rounded-xl border border-pluto-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50"
                    >
                      <option value="">{t("selectIdType")}</option>
                      <option value="passport">{t("passport")}</option>
                      <option value="drivers_license">{t("driversLicense")}</option>
                      <option value="national_id">{t("nationalId")}</option>
                    </select>
                  </Field>
                  <Field id={`${uid}-idNumber`} label={t("idNumber")}>
                    <input
                      id={`${uid}-idNumber`} type="text" placeholder={t("idNumber")}
                      value={state.documents.idNumber}
                      onChange={(e) => dispatch({ type: "UPDATE_DOCUMENTS", data: { idNumber: e.target.value } })}
                      className="rounded-xl border border-pluto-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pluto-400 dark:border-pluto-700 dark:bg-pluto-900/50 dark:text-pluto-50 dark:placeholder-pluto-500"
                    />
                  </Field>
                  {(["idFront", "idBack", "selfie"] as FileUploadField[]).map((field) => {
                    const labelKey = field === "idFront" ? "idFront" : field === "idBack" ? "idBack" : "selfie";
                    const accept = field === "selfie" ? "image/*" : "image/*,.pdf";
                    return (
                      <FileField
                        key={field}
                        id={`${uid}-${field}`}
                        label={t(labelKey)}
                        accept={accept}
                        uploadState={state.fileUploads[field]}
                        uploadingLabel={t("uploadingFile", { name: t(labelKey) })}
                        successLabel={t("uploadSuccess", { name: t(labelKey) })}
                        retryLabel={t("retryUpload")}
                        removeLabel={t("removeFile", { name: t(labelKey) })}
                        onChange={(file) => handleFileChange(field, file)}
                        onRetry={() => dispatch({ type: "FILE_UPLOAD_RESET", field })}
                        onRemove={() => handleFileRemove(field)}
                      />
                    );
                  })}
                </section>
              )}

              {/* ── Review ───────────────────────────────────────────────── */}
              {state.currentStep === "review" && (
                <section aria-labelledby={`${uid}-review-title`} className="space-y-4">
                  <h2 id={`${uid}-review-title`} className="text-xl font-bold text-pluto-900 dark:text-pluto-50">
                    {t("review")}
                  </h2>
                  <dl className="divide-y divide-pluto-100 rounded-xl border border-pluto-100 text-sm dark:divide-pluto-800/60 dark:border-pluto-800/60">
                    {[
                      { label: t("firstName"),    value: state.personal.firstName },
                      { label: t("lastName"),     value: state.personal.lastName },
                      { label: t("dateOfBirth"),  value: state.personal.dateOfBirth },
                      { label: t("city"),         value: state.address.city },
                      { label: t("country"),      value: state.address.country },
                      { label: t("idType"),       value: state.documents.idType },
                      { label: t("idNumber"),     value: state.documents.idNumber },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between px-4 py-2">
                        <dt className="font-medium text-pluto-600 dark:text-pluto-400">{label}</dt>
                        <dd className="text-pluto-900 dark:text-pluto-100">{value || t("dash")}</dd>
                      </div>
                    ))}
                  </dl>
                  {/* Submission error */}
                  <AnimatePresence>
                    {state.error && (
                      <motion.p
                        role="alert"
                        className="text-sm text-red-600 dark:text-red-400"
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      >
                        {state.error}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Navigation buttons ──────────────────────────────────────────── */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || isStepLoading || state.isSubmitting}
            aria-label={stepIndex > 0 ? `${t("back")} ${t(STEP_LABEL_KEYS[STEPS[stepIndex - 1]!])}` : t("back")}
            className="flex-1 rounded-xl border border-pluto-200 bg-white px-6 py-3 font-semibold text-pluto-900 transition-colors hover:bg-pluto-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-pluto-700 dark:bg-transparent dark:text-pluto-100 dark:hover:bg-pluto-800/50"
          >
            {t("back")}
          </button>

          {state.currentStep !== "review" ? (
            <button
              type="button"
              onClick={goNext}
              disabled={isStepLoading || anyFileUploading}
              aria-label={`${t("next")}: ${t(STEP_LABEL_KEYS[STEPS[stepIndex + 1]!])}`}
              className="flex-1 rounded-xl bg-pluto-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-pluto-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-pluto-500 dark:hover:bg-pluto-400"
            >
              {isStepLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="h-4 w-4" />
                  {t("loadingStep")}
                </span>
              ) : anyFileUploading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="h-4 w-4" />
                  {t("uploadingFile", { name: "…" })}
                </span>
              ) : (
                t("next")
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={state.isSubmitting || anyFileUploading}
              aria-describedby={`${uid}-submit-status`}
              className="flex-1 rounded-xl bg-pluto-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-pluto-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pluto-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-pluto-500 dark:hover:bg-pluto-400"
            >
              {state.isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="h-4 w-4" />
                  {t("processingSubmission")}
                </span>
              ) : (
                t("submit")
              )}
            </button>
          )}
        </div>

        {/* sr-only submit status for AT */}
        <div id={`${uid}-submit-status`} className="sr-only" aria-live="polite">
          {state.isSubmitting && t("processingSubmission")}
        </div>
      </div>
    </div>
  );
}

export default KycSubmissionForm;
