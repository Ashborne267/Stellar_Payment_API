"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import {
  getAnchorServices,
  authenticateWithAnchor,
  initiateDeposit,
} from "@/lib/stellar";
import { signWithFreighter, getFreighterPublicKey } from "@/lib/freighter";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";

interface FiatOnrampModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_ANCHOR = "testanchor.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const SUPPORTED_ASSETS = [
  {
    code: "USDC",
    issuer: "GBBD67V63DU7D3SXXF4SOT5O7GNCGYL65B66S3YUKG6VCH3TFRZ7I7YQ",
  }, // Testnet USDC
  {
    code: "SRT",
    issuer: "GCDGUC3OCYLAU7XIK7EUBTWSOT3N4XALR6IRLKEW3V3AEL3Z5W5SOT4F",
  }, // Testnet SRT (Stellar Resource Token)
];

type Step = "SELECT" | "CONNECTING" | "AUTH" | "GENERATING" | "INTERACTIVE";

const STEP_MESSAGE: Record<Exclude<Step, "SELECT" | "INTERACTIVE">, string> = {
  CONNECTING: "Connecting to anchor…",
  AUTH: "Waiting for wallet signature…",
  GENERATING: "Preparing your deposit form…",
};

export default function FiatOnrampModal({ isOpen, onClose }: FiatOnrampModalProps) {
  const [step, setStep] = useState<Step>("SELECT");
  const [amount, setAmount] = useState("");
  const [anchorDomain, setAnchorDomain] = useState(DEFAULT_ANCHOR);
  const [selectedAsset, setSelectedAsset] = useState(SUPPORTED_ASSETS[0]);
  const [interactiveUrl, setInteractiveUrl] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isBusy = step === "CONNECTING" || step === "AUTH" || step === "GENERATING";

  const reset = useCallback(() => {
    setStep("SELECT");
    setInteractiveUrl(null);
    setIframeLoading(true);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleStartDeposit = useCallback(async () => {
    setError(null);
    try {
      setStep("CONNECTING");
      const publicKey = await getFreighterPublicKey();
      const services = await getAnchorServices(anchorDomain);

      if (!services.webAuthEndpoint || !services.transferServer) {
        throw new Error("Anchor does not support SEP-0024 or SEP-0010");
      }

      setStep("AUTH");
      const jwt = await authenticateWithAnchor(
        publicKey,
        services.webAuthEndpoint,
        async (xdr) => {
          const res = await signWithFreighter(xdr, NETWORK_PASSPHRASE);
          return res.signedXDR;
        },
      );

      setStep("GENERATING");
      const url = await initiateDeposit(
        services.transferServer,
        jwt,
        selectedAsset.code,
        publicKey,
        amount || undefined,
      );

      setInteractiveUrl(url);
      setStep("INTERACTIVE");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deposit failed";
      toast.error(message);
      setError(message);
      setStep("SELECT");
    }
  }, [anchorDomain, amount, selectedAsset]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Buy / Deposit Funds">
      <AnimatePresence mode="wait">
        {step === "SELECT" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-6"
          >
            <p className="text-sm text-slate-400">
              Deposit fiat via a Stellar anchor (SEP-0024). Funds arrive as tokens directly
              in your connected wallet.
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Select Asset
              </label>
              <div className="grid grid-cols-2 gap-4">
                {SUPPORTED_ASSETS.map((asset) => (
                  <button
                    key={asset.code}
                    type="button"
                    onClick={() => setSelectedAsset(asset)}
                    disabled={isBusy}
                    aria-pressed={selectedAsset.code === asset.code}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedAsset.code === asset.code
                        ? "border-mint bg-mint/5 ring-1 ring-mint"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <span className="text-lg font-bold text-white">{asset.code}</span>
                    <span className="text-[10px] text-slate-500">
                      {asset.issuer.slice(0, 8)}...
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="onramp-amount" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Amount <span className="normal-case text-slate-600">(optional)</span>
              </label>
              <input
                id="onramp-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isBusy}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-mint disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={`e.g. 100 ${selectedAsset.code}`}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="onramp-anchor" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Anchor Domain
              </label>
              <input
                id="onramp-anchor"
                type="text"
                value={anchorDomain}
                onChange={(e) => setAnchorDomain(e.target.value)}
                disabled={isBusy}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-mint disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g. testanchor.stellar.org"
              />
            </div>

            <button
              type="button"
              onClick={handleStartDeposit}
              disabled={isBusy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-mint py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {isBusy ? (
                <>
                  <Spinner size="sm" className="text-black" />
                  {STEP_MESSAGE[step as Exclude<Step, "SELECT" | "INTERACTIVE">]}
                </>
              ) : (
                "Continue to Anchor"
              )}
            </button>
          </motion.div>
        )}

        {(step === "CONNECTING" || step === "AUTH" || step === "GENERATING") && (
          <motion.div
            key="busy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            role="status"
            aria-live="polite"
            className="flex flex-col items-center justify-center py-14 text-center"
          >
            <div className="relative mb-6">
              <div className="h-20 w-20 animate-ping rounded-full bg-mint/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner size="lg" className="text-mint" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-white">{STEP_MESSAGE[step]}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {step === "AUTH"
                ? `Please sign the challenge transaction in your wallet to securely connect to ${anchorDomain}.`
                : "This should only take a moment."}
            </p>
          </motion.div>
        )}

        {step === "INTERACTIVE" && interactiveUrl && (
          <motion.div
            key="interactive"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative h-[500px] w-full overflow-hidden rounded-xl border border-white/10 bg-white/5"
          >
            {iframeLoading && (
              <div className="absolute inset-0 z-10 flex flex-col gap-3 p-4">
                <Skeleton height={28} width="60%" borderRadius={8} baseColor="#1e293b" highlightColor="#334155" />
                <Skeleton height={200} borderRadius={12} baseColor="#1e293b" highlightColor="#334155" />
                <Skeleton height={40} borderRadius={8} baseColor="#1e293b" highlightColor="#334155" />
              </div>
            )}
            <iframe
              src={interactiveUrl}
              title="Anchor deposit form"
              className="h-full w-full"
              onLoad={() => setIframeLoading(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {step !== "INTERACTIVE" && (
        <p className="mt-6 text-center text-xs text-slate-500">
          Secured by Stellar Network • SEP-0024 Standard
        </p>
      )}
    </Modal>
  );
}
