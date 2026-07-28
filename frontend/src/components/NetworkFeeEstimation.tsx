"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/Spinner";

interface NetworkFeeData {
  network: string;
  horizon_url: string;
  operation_count: number;
  stroops: number;
  xlm: string;
  last_ledger_base_fee: number;
}

interface NetworkFeeEstimationProps {
  isOpen: boolean;
}

export function NetworkFeeEstimation({ isOpen }: NetworkFeeEstimationProps) {
  const t = useTranslations("checkout");
  const [networkFee, setNetworkFee] = useState<NetworkFeeData | null>(null);
  const [networkFeeLoading, setNetworkFeeLoading] = useState(false);
  const [networkFeeError, setNetworkFeeError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    (async () => {
      setNetworkFeeLoading(true);
      setNetworkFeeError(null);
      try {
        const res = await fetch(`${API_URL}/api/network-fee`, { signal: controller.signal });
        if (!res.ok) throw new Error(t("networkFeeUnavailable"));
        const data = await res.json() as { network_fee: NetworkFeeData };
        setNetworkFee(data.network_fee);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setNetworkFee(null);
        setNetworkFeeError(t("networkFeeUnavailable"));
      } finally {
        setNetworkFeeLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isOpen, t]);

  return (
    <div className="mt-3">
      {networkFeeLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#6B6B6B] animate-pulse">
          <div className="h-4 w-4 rounded-full border-2 border-[#6B6B6B] border-t-transparent animate-spin" />
          <span>{t("loadingNetworkFee")}</span>
        </div>
      ) : networkFee ? (
        <p className="text-sm text-[#6B6B6B]">
          {t("networkFeeLabel", { amount: networkFee.xlm })}
        </p>
      ) : (
        <p className="text-sm text-red-500">
          {networkFeeError ?? t("networkFeeUnavailable")}
        </p>
      )}
    </div>
  );
}
