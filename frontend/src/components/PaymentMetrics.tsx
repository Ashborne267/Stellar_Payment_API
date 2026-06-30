"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Recharts from "recharts";
const { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } = Recharts;
import toast from "react-hot-toast";
import {
  useHydrateMerchantStore,
  useMerchantApiKey,
  useMerchantHydrated,
} from "@/lib/merchant-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { localeToLanguageTag } from "@/i18n/config";

type TimeRange = "7D" | "30D" | "1Y";
type ExportFormat = "png" | "svg";

interface VolumeDataPoint {
  date: string;
  [asset: string]: number | string;
}

interface VolumeResponse {
  range: TimeRange;
  assets: string[];
  data: VolumeDataPoint[];
}

interface MetricsResponse {
  data: Array<{ date: string; volume: number; count: number }>;
  total_volume: number;
  total_payments: number;
  confirmed_count: number;
  success_rate: number;
}

const CHART_HEIGHT = 300;
const EXPORT_SCALE = 2;

const ASSET_COLORS: Record<string, string> = {
  USDC: "#2775CA",
  XLM: "#E8B84B",
};

const FALLBACK_COLORS = ["#0ea5e9", "#10b981", "#8b5cf6", "#f43f5e", "#f97316"];
const TIME_RANGES: TimeRange[] = ["7D", "30D", "1Y"];

function colorForAsset(asset: string, index: number): string {
  return ASSET_COLORS[asset] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ... (keep your existing export functions: buildSvgMarkup, downloadBlob, exportChart)

export default function PaymentMetrics({ showSkeleton = false }: { showSkeleton?: boolean }) {
  const t = useTranslations("paymentMetrics");
  const locale = localeToLanguageTag(useLocale());

  const [summary, setSummary] = useState<MetricsResponse | null>(null);
  const [volumeData, setVolumeData] = useState<VolumeResponse | null>(null);
  const [hiddenAssets, setHiddenAssets] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<TimeRange>("7D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const apiKey = useMerchantApiKey();
  const hydrated = useMerchantHydrated();
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useHydrateMerchantStore();

  // ... keep your existing useEffect for summary and volumeData ...

  const toggleAsset = (asset: string) => {
    setHiddenAssets((prev) => {
      const next = new Set(prev);
      if (next.has(asset)) next.delete(asset);
      else next.add(asset);
      return next;
    });
  };

  const handleExport = async (format: ExportFormat) => {
    setExporting(true);
    try {
      await exportChart(chartContainerRef, format, `volume-${range.toLowerCase()}`);
      toast.success(t("exportSuccess", { format: format.toUpperCase() }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("exportFailed");
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  if (showSkeleton || loading || !hydrated) {
    // ... keep your skeleton ...
  }

  if (error) {
    // ... keep your error UI ...
  }

  const assets = volumeData?.assets ?? [];
  const chartData = (volumeData?.data ?? []).map((dataPoint) => ({
    ...dataPoint,
    dateShort: new Date(dataPoint.date).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Cards - unchanged */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* ... your summary cards ... */}
        </div>
      )}

      <div ref={chartContainerRef} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        {/* Header with range + export */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">{t("chartTitle")}</h3>
            <p className="text-xs text-slate-400">{t("chartSubtitle")}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Time range buttons */}
            <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    range === r ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {assets.length > 0 && (
              <ChartExportButton
                containerRef={chartContainerRef}
                exporting={exporting}
                onExport={handleExport}
                t={t}
              />
            )}
          </div>
        </div>

        {/* Asset toggles */}
        {assets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {assets.map((asset, i) => {
              const color = colorForAsset(asset, i);
              const hidden = hiddenAssets.has(asset);
              return (
                <button
                  key={asset}
                  onClick={() => toggleAsset(asset)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    hidden ? "opacity-40" : ""
                  }`}
                  style={{ borderColor: color, color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hidden ? "transparent" : color }} />
                  {asset}
                </button>
              );
            })}
          </div>
        )}

        {/* Chart */}
        {assets.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{t("noPayments")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="dateShort" stroke="#64748b" style={{ fontSize: "12px" }} />
              <YAxis stroke="#64748b" style={{ fontSize: "12px" }} tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }} />
              {assets.map((asset, i) =>
                hiddenAssets.has(asset) ? null : (
                  <Line
                    key={asset}
                    type="monotone"
                    dataKey={asset}
                    name={asset}
                    stroke={colorForAsset(asset, i)}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive
                  />
                )
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}