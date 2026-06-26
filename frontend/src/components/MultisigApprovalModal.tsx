"use client";

import { useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useMultisigState, useMultisigActions } from "@/lib/multisig-context";
import { toast } from "sonner";
import { CopyButton } from "@/components/CopyButton";
import {
  errorMessageVariants,
} from "@/lib/network-animations";

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

const modalVariants = {
  hidden: { scale: 0.85, opacity: 0, y: 30 },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.32, 0.72, 0.0, 1.0],
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    scale: 0.85,
    opacity: 0,
    y: 30,
    transition: { duration: 0.2, ease: [0.32, 0.72, 0.0, 1.0] },
  },
};

const stepVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

const signerListVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const signerItemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

interface MultisigApprovalModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly networkPassphrase: string;
  readonly transaction?: any;
}

export default function MultisigApprovalModal({
  isOpen,
  onClose,
  networkPassphrase,
  transaction: initialTransaction,
}: MultisigApprovalModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const modalRef = useRef<HTMLDivElement>(null);

  const {
    transaction,
    currentStep,
    isLoading,
    error,
    canSign,
    canSubmit,
    signedCount,
    requiredSignatures,
    progress,
    isExpired,
    isPendingConfirmation,
    timeRemaining,
  } = useMultisigState();

  const {
    setTransaction,
    setCurrentStep,
    signTransaction,
    submitTransaction,
    resetModal,
    clearError,
    retryAction,
  } = useMultisigActions();

  // Set transaction when modal opens
  useEffect(() => {
    if (isOpen && initialTransaction && !transaction) {
      setTransaction(initialTransaction);
    }
  }, [isOpen, initialTransaction, transaction, setTransaction]);

  // Handle escape key, focus trap, and focus return
  useEffect(() => {
    if (!isOpen) return;

    const triggerElement = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    modalRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerElement?.focus();
    };
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isLoading || isPendingConfirmation) return;
    resetModal();
    onClose();
  }, [isLoading, isPendingConfirmation, resetModal, onClose]);

  const handleSign = useCallback(async (signerId: string) => {
    try {
      await signTransaction(signerId);
      toast.success("Transaction signed successfully");
    } catch (err) {
      console.error("Signing failed:", err);
    }
  }, [signTransaction]);

  const handleSubmit = useCallback(async () => {
    try {
      await submitTransaction();
      toast.success("Transaction submitted successfully");
    } catch (err) {
      console.error("Submission failed:", err);
    }
  }, [submitTransaction]);

  const handleRetry = useCallback(() => {
    retryAction();
  }, [retryAction]);

  // Step components with improved accessibility
  const ReviewStep = () => (
    <div className="space-y-6" role="region" aria-label="Review transaction section">
      <div className="text-center">
        <h3 className="text-xl font-bold text-white" id="review-title">Review Transaction</h3>
        <p className="mt-2 text-sm text-slate-400" id="review-description">
          Review the transaction details and sign if you approve
        </p>
      </div>

      {transaction && (
        <div className="space-y-4">
          {/* Transaction Details */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Amount</span>
              <span className="font-mono text-sm text-white">
                {transaction.amount} {transaction.assetCode}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">To</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-slate-200 truncate max-w-[200px]">
                  {transaction.destination}
                </span>
                <CopyButton text={transaction.destination} />
              </div>
            </div>
            {transaction.memo && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Memo</span>
                <span className="font-mono text-sm text-slate-200">{transaction.memo}</span>
              </div>
            )}
          </div>

          {/* Signature Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Signatures ({signedCount}/{requiredSignatures})
              </span>
              <span className="text-xs text-slate-400">{Math.round(progress)}%</span>
            </div>
              <motion.div 
                className="w-full bg-white/10 rounded-full h-2"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Signature progress"
              >
                <motion.div 
                  className="bg-mint h-2 rounded-full"
                  layout
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </motion.div>
          </div>

          {/* Signers List */}
          <div className="space-y-2" role="region" aria-label="Signers list">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500" id="signers-label">Signers</span>
            <motion.ul
              className="space-y-2"
              aria-labelledby="signers-label"
              variants={!prefersReducedMotion ? signerListVariants : undefined}
              initial="hidden"
              animate="visible"
            >
              {transaction.signers.map((signer) => (
                <motion.li
                  key={signer.id}
                  variants={!prefersReducedMotion ? signerItemVariants : undefined}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    signer.hasSigned
                      ? "border-mint/30 bg-mint/5"
                      : "border-white/10 bg-white/5"
                  }`}
                  role="listitem"
                  aria-label={`${signer.name || `Signer ${signer.id.slice(0, 8)}`} - Weight: ${signer.weight} - ${signer.hasSigned ? "Signed" : "Not signed"}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        signer.hasSigned ? "bg-mint" : "bg-slate-500"
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">
                        {signer.name || `Signer ${signer.id.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-slate-400">
                        Weight: {signer.weight} • {signer.publicKey.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <motion.button
                    onClick={() => handleSign(signer.id)}
                    disabled={!canSign || signer.hasSigned || isLoading}
                    whileHover={!prefersReducedMotion && canSign && !signer.hasSigned && !isLoading ? { scale: 1.02 } : undefined}
                    whileTap={!prefersReducedMotion && canSign && !signer.hasSigned && !isLoading ? { scale: 0.98 } : undefined}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      signer.hasSigned
                        ? "bg-mint/10 text-mint cursor-not-allowed"
                        : canSign && !isLoading
                        ? "bg-mint text-black hover:bg-glow"
                        : "bg-white/10 text-slate-400 cursor-not-allowed"
                    }`}
                    aria-label={`${signer.hasSigned ? "Signed" : "Sign"} transaction as ${signer.name || `signer ${signer.id.slice(0, 8)}`}`}
                    aria-pressed={signer.hasSigned}
                  >
                    {signer.hasSigned ? "Signed" : isLoading ? "Signing..." : "Sign"}
                  </motion.button>
                </motion.li>
              ))}
            </motion.ul>
          </div>

          {/* Time Remaining */}
          {timeRemaining && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Expires in {timeRemaining}</span>
            </div>
          )}

          {/* Submit Button */}
          {canSubmit && (
            <motion.button
              onClick={handleSubmit}
              disabled={isLoading}
              whileHover={!prefersReducedMotion && !isLoading ? { scale: 1.02 } : undefined}
              whileTap={!prefersReducedMotion && !isLoading ? { scale: 0.98 } : undefined}
              className="w-full py-3 bg-mint text-black font-semibold rounded-xl hover:bg-glow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Submitting..." : "Submit Transaction"}
            </motion.button>
          )}
        </div>
      )}
    </div>
  );

  const ProcessingStep = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center" role="status">
      <div className="relative mb-6" aria-hidden="true">
        <div className="w-16 h-16 border-4 border-mint border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-0 w-16 h-16 border-4 border-mint/20 rounded-full animate-ping" />
      </div>
      <h3 className="text-xl font-bold text-white">Processing Transaction</h3>
      <p className="mt-2 text-sm text-slate-400">
        Submitting your transaction to the Stellar network...
      </p>
    </div>
  );

  const ConfirmStep = () => (
    <div className="text-center space-y-6">
      {isPendingConfirmation ? (
        <>
          <div className="relative mx-auto w-16 h-16" aria-hidden="true">
            <div className="w-16 h-16 border-4 border-mint border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-0 w-16 h-16 border-4 border-mint/20 rounded-full animate-ping" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Transaction Submitted</h3>
            <p className="mt-2 text-sm text-slate-400">
              Awaiting network confirmation...
            </p>
          </div>
          {transaction?.submittedTxHash && (
            <div className="rounded-xl border border-mint/30 bg-mint/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-mint mb-2">
                Transaction Hash (pending)
              </p>
              <div className="flex items-center justify-center gap-2">
                <code className="font-mono text-sm text-slate-200">
                  {transaction.submittedTxHash}
                </code>
                <CopyButton text={transaction.submittedTxHash} />
              </div>
            </div>
          )}
          <motion.button
            disabled
            className="px-6 py-2 bg-mint/50 text-black/50 font-semibold rounded-xl cursor-not-allowed"
          >
            Confirming...
          </motion.button>
        </>
      ) : (
        <>
          <div className="w-16 h-16 bg-mint/20 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-mint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Transaction Approved</h3>
            <p className="mt-2 text-sm text-slate-400">
              Your multi-signature transaction has been successfully submitted
            </p>
          </div>
          {transaction?.submittedTxHash && (
            <div className="rounded-xl border border-mint/30 bg-mint/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-mint mb-2">Transaction Hash</p>
              <div className="flex items-center justify-center gap-2">
                <code className="font-mono text-sm text-slate-200">
                  {transaction.submittedTxHash}
                </code>
                <CopyButton text={transaction.submittedTxHash} />
              </div>
            </div>
          )}
          <motion.button
            onClick={handleClose}
            whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
            whileTap={!prefersReducedMotion ? { scale: 0.98 } : undefined}
            className="px-6 py-2 bg-mint text-black font-semibold rounded-xl hover:bg-glow transition-colors"
          >
            Close
          </motion.button>
        </>
      )}
    </div>
  );

  const ErrorStep = () => (
    <div className="text-center space-y-6" role="alert">
      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div>
        <h3 className="text-xl font-bold text-white">Transaction Failed</h3>
        <p className="mt-2 text-sm text-slate-400">
          {error || "An error occurred while processing your transaction"}
        </p>
      </div>
      <div className="flex gap-3 justify-center">
        <motion.button
          onClick={handleRetry}
          whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
          whileTap={!prefersReducedMotion ? { scale: 0.98 } : undefined}
          className="px-6 py-2 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors"
        >
          Try Again
        </motion.button>
        <motion.button
          onClick={handleClose}
          whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
          whileTap={!prefersReducedMotion ? { scale: 0.98 } : undefined}
          className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-xl hover:bg-slate-500 transition-colors"
        >
          Close
        </motion.button>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case "review":
        return <ReviewStep />;
      case "processing":
        return <ProcessingStep />;
      case "confirm":
        return <ConfirmStep />;
      case "error":
        return <ErrorStep />;
      default:
        return <ReviewStep />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            variants={!prefersReducedMotion ? modalVariants : undefined}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#050608] shadow-2xl backdrop-blur-xl outline-none"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-busy={isLoading}
            aria-labelledby="multisig-modal-title"
            aria-describedby="multisig-modal-description"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div>
                <h2 id="multisig-modal-title" className="text-xl font-bold text-white">
                  Multi-Signature Approval
                </h2>
                <p id="multisig-modal-description" className="text-sm text-slate-400">
                  {isExpired ? "Transaction Expired" : `Step ${currentStep === "review" ? "1" : currentStep === "processing" ? "2" : currentStep === "confirm" ? "3" : "1"} of 3`}
                </p>
              </div>
              <motion.button
                onClick={handleClose}
                disabled={isLoading}
                whileHover={!prefersReducedMotion && !isLoading ? { scale: 1.1, backgroundColor: "rgba(255,255,255,0.1)" } : undefined}
                whileTap={!prefersReducedMotion && !isLoading ? { scale: 0.9 } : undefined}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Close modal"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            </div>

            {/* Screen reader announcements */}
            <div
              aria-live="assertive"
              aria-atomic="true"
              className="sr-only"
            >
              {currentStep === "processing"
                ? "Processing your transaction. Please wait."
                : currentStep === "confirm"
                ? "Transaction approved successfully."
                : currentStep === "error"
                ? "Transaction failed. See error details below."
                : ""}
            </div>

            {/* Content */}
            <motion.div
              className="p-6 max-h-[70vh] overflow-y-auto"
              aria-live="polite"
              key={currentStep}
              variants={stepVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {isExpired ? (
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Transaction Expired</h3>
                    <p className="mt-2 text-sm text-slate-400">
                      This transaction has expired and can no longer be signed or submitted.
                    </p>
                  </div>
                  <motion.button
                    onClick={handleClose}
                    whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.98 } : undefined}
                    className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-xl hover:bg-slate-500 transition-colors"
                  >
                    Close
                  </motion.button>
                </div>
              ) : (
                renderStep()
              )}
            </motion.div>

            {/* Error Display */}
            <AnimatePresence>
              {error && currentStep !== "error" && (
                <motion.div
                  key="error-banner"
                  variants={!prefersReducedMotion ? errorMessageVariants : undefined}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="mx-6 mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4"
                  role="alert"
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-400">Error</p>
                      <p className="text-sm text-red-300 mt-1">{error}</p>
                    </div>
                    <motion.button
                      onClick={clearError}
                      whileHover={!prefersReducedMotion ? { scale: 1.1 } : undefined}
                      whileTap={!prefersReducedMotion ? { scale: 0.9 } : undefined}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      aria-label="Clear error"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
