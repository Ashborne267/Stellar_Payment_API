"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { useOptimisticUpdate } from "@/hooks/useOptimisticUpdate";
import { useDropzone } from "react-dropzone";
import Link from "next/link";
import Image from "next/image";
import CopyButton from "@/components/CopyButton";
import { toast } from "sonner";
import {
  useHydrateMerchantStore,
  useMerchantApiKey,
  useMerchantHydrated,
  useSetMerchantApiKey,
} from "@/lib/merchant-store";
import { useDisplayPreferences } from "@/lib/display-preferences";
import WebhookHealthIndicator from "@/components/WebhookHealthIndicator";
import DangerZone from "@/components/DangerZone";
import { EmailReceiptPreview } from "@/components/EmailReceiptPreview";
import SettingsPanelSkeleton from "@/components/SettingsPanelSkeleton";
import { Spinner } from "@/components/ui/Spinner";
import {
  getNextSettingsTab,
  getSettingsPanelDomId,
  getSettingsTabDomId,
  type SettingsTab,
} from "./accessibility";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const UserPermissionsManager = dynamic(
  () => import("@/components/UserPermissionsManager"),
  {
    ssr: false,
    loading: () => <SettingsPanelSkeleton />,
  },
);
const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const DEFAULT_BRANDING = {
  primary_color: "#5ef2c0",
  secondary_color: "#b8ffe2",
  background_color: "#050608",
  logo_url: null as string | null,
};

/**
 * RSC page — mounts the interactive client SettingsWidget.
 * Any server-only work (e.g. reading cookies, fetching public config)
 * can be added here and passed down as props to SettingsWidget without
 * bloating the client bundle.
 */
export default function SettingsPage() {
  const t = useTranslations("settingsPage");
  const navItems = useMemo(() => buildNavItems(t), [t]);
  const apiKey = useMerchantApiKey();
  const hydrated = useMerchantHydrated();
  const setApiKey = useSetMerchantApiKey();
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");
  const { hideCents, setHideCents } = useDisplayPreferences();
  const {
    state: branding,
    setState: setBranding,
    isPending: savingBranding,
    executeUpdate: executeBrandingUpdate,
  } = useOptimisticUpdate(DEFAULT_BRANDING);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [loadingBranding, setLoadingBranding] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const {
    state: webhookUrl,
    setState: setWebhookUrl,
    isPending: savingWebhook,
    executeUpdate: executeWebhookUpdate,
  } = useOptimisticUpdate("");
  const [webhookSecretMasked, setWebhookSecretMasked] = useState("");
  const [webhookNewSecret, setWebhookNewSecret] = useState<string | null>(null);
  const [webhookUrlError, setWebhookUrlError] = useState<string | null>(null);
  const [webhookSaveError, setWebhookSaveError] = useState<string | null>(null);
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [confirmRegenSecret, setConfirmRegenSecret] = useState(false);
  const [webhookRevealedSecret, setWebhookRevealedSecret] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookVerification, setWebhookVerification] =
    useState<WebhookDomainVerification | null>(null);
  const [verifyingWebhookDomain, setVerifyingWebhookDomain] = useState(false);
  const desktopTabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});
  const mobileTabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});

  useHydrateMerchantStore();

  useEffect(() => {
    if (!apiKey) return;
    const load = async () => {
      setLoadingBranding(true);
      try {
        const res = await fetch(`${API_URL}/api/merchant-branding`, {
          headers: { "x-api-key": apiKey },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load branding");
        setBranding(data.branding_config ?? DEFAULT_BRANDING);
      } catch (err: unknown) {
        setBrandingError(
          err instanceof Error ? err.message : "Failed to load branding",
        );
      } finally {
        setLoadingBranding(false);
      }
    };
    load();
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    const load = async () => {
      setLoadingWebhook(true);
      try {
        const res = await fetch(`${API_URL}/api/webhook-settings`, {
          headers: { "x-api-key": apiKey },
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error ?? "Failed to load webhook settings");
        setWebhookUrl(data.webhook_url ?? "");
        setWebhookSecretMasked(data.webhook_secret_masked ?? "");
        setWebhookVerification(data.webhook_domain_verification ?? null);
      } catch (err: unknown) {
        setWebhookSaveError(
          err instanceof Error
            ? err.message
            : "Failed to load webhook settings",
        );
      } finally {
        setLoadingWebhook(false);
      }
    };
    load();
  }, [apiKey]);

  const confirmRotate = useCallback(async () => {
    if (!apiKey) return;
    setRotating(true);
    setRotateError(null);
    try {
      const res = await fetch(`${API_URL}/api/rotate-key`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rotate key");
      setApiKey(data.api_key);
      setRevealed(true);
      setConfirming(false);
      toast.success(
        "API key rotated — update any integrations using the old key.",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to rotate key";
      setRotateError(msg);
      toast.error(msg);
    } finally {
      setRotating(false);
    }
  }, [apiKey, setApiKey]);

  const updateBrandingField = useCallback(
    (key: keyof typeof DEFAULT_BRANDING, value: string | null) => {
      setBranding((c) => ({
        ...c,
        [key]: key === "logo_url" ? value : normalizeHexInput(value as string),
      }));
    },
    [],
  );

  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image must be under 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        updateBrandingField("logo_url", reader.result as string);
        toast.success("Logo uploaded!");
      };
      reader.readAsDataURL(file);
    },
    [updateBrandingField],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/svg+xml": [".svg"],
    },
    multiple: false,
  });

  const saveBranding = useCallback(async () => {
    if (!apiKey) return;
    setBrandingError(null);
    for (const [k, v] of Object.entries(branding)) {
      if (k === "logo_url") continue;
      if (!HEX_COLOR_REGEX.test(v as string)) {
        setBrandingError(`${k} must be a valid hex color`);
        return;
      }
    }
    await executeBrandingUpdate(
      (current) => current, // optimistically keep current branding
      async () => {
        const res = await fetch(`${API_URL}/api/merchant-branding`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify(branding),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save branding");
        setBranding(data.branding_config ?? branding);
        toast.success("Branding saved");
      }
    );
  }, [apiKey, branding, executeBrandingUpdate, setBranding]);

  const validateWebhookUrl = useCallback((url: string) => {
    if (!url.trim()) return null;
    try {
      const p = new URL(url);
      if (p.protocol !== "https:") return "Webhook URL must use HTTPS";
      return null;
    } catch {
      return "Invalid URL (e.g. https://example.com/webhook)";
    }
  }, []);

  const handleWebhookUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setWebhookUrl(() => e.target.value);
      setWebhookUrlError(validateWebhookUrl(e.target.value));
    },
    [validateWebhookUrl, setWebhookUrl],
  );

  const saveWebhookUrl = useCallback(async () => {
    if (!apiKey) return;
    const err = validateWebhookUrl(webhookUrl);
    if (err) {
      setWebhookUrlError(err);
      return;
    }
    setWebhookSaveError(null);
    const optimisticUrl = webhookUrl.trim();
    await executeWebhookUpdate(
      () => optimisticUrl, // optimistically show the trimmed URL immediately
      async () => {
        const res = await fetch(`${API_URL}/api/webhook-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({ webhook_url: optimisticUrl || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save webhook URL");
        setWebhookUrl(data.webhook_url ?? "");
        setWebhookVerification(data.webhook_domain_verification ?? null);
        toast.success(
          data.webhook_url ? "Webhook URL saved" : "Webhook URL cleared",
        );
      }
    );
  }, [apiKey, webhookUrl, validateWebhookUrl, executeWebhookUpdate, setWebhookUrl]);

  const verifyWebhookDomain = useCallback(async () => {
    if (!apiKey) return;
    setVerifyingWebhookDomain(true);
    setWebhookSaveError(null);
    try {
      const res = await fetch(`${API_URL}/api/webhook-settings/verify`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Failed to verify webhook domain");
      setWebhookVerification(data.webhook_domain_verification ?? null);
      toast.success(
        data.webhook_domain_verification?.status === "verified"
          ? "Domain verified"
          : "Domain still unverified",
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to verify domain";
      setWebhookSaveError(msg);
      toast.error(msg);
    } finally {
      setVerifyingWebhookDomain(false);
    }
  }, [apiKey]);

  const regenerateWebhookSecret = useCallback(async () => {
    if (!apiKey) return;
    setRegeneratingSecret(true);
    setWebhookSaveError(null);
    try {
      const res = await fetch(`${API_URL}/api/regenerate-webhook-secret`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to regenerate secret");
      setWebhookNewSecret(data.webhook_secret);
      setWebhookRevealedSecret(true);
      setConfirmRegenSecret(false);
      toast.success("Webhook secret regenerated — update your integrations.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to regenerate secret";
      setWebhookSaveError(msg);
      toast.error(msg);
    } finally {
      setRegeneratingSecret(false);
    }
  }, [apiKey]);

  const testWebhook = useCallback(async () => {
    if (!apiKey) return;
    setTestingWebhook(true);
    setWebhookSaveError(null);
    try {
      const res = await fetch(`${API_URL}/api/webhooks/test`, {
        method: "POST",
        headers: { "x-api-key": apiKey },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test webhook request failed");
      toast.success(`Test webhook sent — status ${data.status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to test webhook";
      toast.error(msg);
      setWebhookSaveError(msg);
    } finally {
      setTestingWebhook(false);
    }
  }, [apiKey]);

  const displayKey = useMemo(
    () => (revealed ? apiKey : mask(apiKey ?? "")),
    [revealed, apiKey],
  );
  const lowContrastWarning = useMemo(
    () =>
      contrastRatio(branding.primary_color, branding.background_color) < 4.5 ||
      contrastRatio(branding.secondary_color, branding.background_color) < 3,
    [branding.primary_color, branding.secondary_color, branding.background_color],
  );
  const isVerified = useMemo(
    () => webhookVerification?.status === "verified",
    [webhookVerification],
  );

  const focusTab = useCallback((tab: SettingsTab, variant: "desktop" | "mobile") => {
    const refMap = variant === "desktop" ? desktopTabRefs.current : mobileTabRefs.current;
    refMap[tab]?.focus();
  }, []);

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, variant: "desktop" | "mobile") => {
      const supportedKeys = [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ];

      if (!supportedKeys.includes(event.key)) {
        return;
      }

      event.preventDefault();
      const nextTab = getNextSettingsTab(activeTab, event.key);
      setActiveTab(nextTab);
      focusTab(nextTab, variant);
    },
    [activeTab, focusTab],
  );

  if (!hydrated) return null;

  if (!apiKey) {
    return (
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#6B6B6B] mb-2">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-bold text-[#0A0A0A] tracking-tight">
            {t("title")}
          </h1>
        </div>
        <div className="max-w-md rounded-2xl border border-yellow-200 bg-yellow-50 p-8 flex flex-col gap-4">
          <p className="font-bold text-yellow-800">{t("noApiKeyTitle")}</p>
          <p className="text-sm text-yellow-700">
            {t("noApiKeyDescription")}
          </p>
          <Link
            href="/register"
            className="self-start rounded-xl bg-[#0A0A0A] px-5 py-2.5 text-sm font-bold text-white hover:bg-black transition-all"
          >
            {t("registerAsMerchant")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* Page header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#6B6B6B] mb-2">
          {t("eyebrowAccount")}
        </p>
        <h1 className="text-4xl font-bold text-[#0A0A0A] tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm font-medium text-[#6B6B6B]">
          {t("description")}
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        {/* Left nav */}
        <nav
          className="hidden lg:flex w-52 shrink-0 flex-col gap-1"
          role="tablist"
          aria-label={t("navAriaLabel")}
          aria-orientation="vertical"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              id={getSettingsTabDomId(item.id, "desktop")}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              aria-controls={getSettingsPanelDomId(item.id)}
              tabIndex={activeTab === item.id ? 0 : -1}
              ref={(node) => {
                desktopTabRefs.current[item.id] = node;
              }}
              onClick={() => setActiveTab(item.id)}
              onKeyDown={(event) => handleTabKeyDown(event, "desktop")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-left transition-all duration-200 ${
                activeTab === item.id
                  ? item.danger
                    ? "bg-red-50 text-red-600 border border-red-200 shadow-sm"
                    : "bg-[var(--pluto-500)] text-white shadow-md scale-[1.02]"
                  : item.danger
                    ? "text-red-500 hover:bg-red-50 hover:shadow-sm hover:scale-[1.01]"
                    : "text-[#6B6B6B] hover:bg-[var(--pluto-50)] hover:text-[var(--pluto-700)] hover:shadow-sm hover:scale-[1.01]"
              }`}
            >
              <span className="shrink-0" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Mobile tab bar */}
        <div
          className="lg:hidden flex gap-1 overflow-x-auto rounded-xl border border-[#E8E8E8] bg-[#F5F5F5] p-1 w-full"
          role="tablist"
          aria-label={t("navAriaLabel")}
          aria-orientation="horizontal"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              id={getSettingsTabDomId(item.id, "mobile")}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              aria-controls={getSettingsPanelDomId(item.id)}
              tabIndex={activeTab === item.id ? 0 : -1}
              ref={(node) => {
                mobileTabRefs.current[item.id] = node;
              }}
              onClick={() => setActiveTab(item.id)}
              onKeyDown={(event) => handleTabKeyDown(event, "mobile")}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all duration-200 ${
                activeTab === item.id
                  ? item.danger
                    ? "bg-red-500 text-white shadow-md"
                    : "bg-white text-[#0A0A0A] shadow-sm"
                  : item.danger
                    ? "text-red-500 hover:bg-red-50 hover:shadow-sm"
                    : "text-[#6B6B6B] hover:bg-[var(--pluto-50)] hover:shadow-sm"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Right content panel */}
        <div className="flex-1 min-w-0">
          {/* API Keys Tab */}
          {activeTab === "api" && (
            <div
              id={getSettingsPanelDomId("api")}
              role="tabpanel"
              aria-label={t("navApiKeys")}
              aria-labelledby="api-tab api-tab-mobile"
              tabIndex={0}
              className="rounded-2xl border border-[#E8E8E8] bg-white p-8 flex flex-col gap-8"
            >
              <div>
                <h2 className="text-lg font-bold text-[#0A0A0A] mb-1">
                  {t("apiAuthTitle")}
                </h2>
                <p className="text-sm text-[#6B6B6B]">
                  {t("apiAuthDescription")}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="live-api-key"
                    className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]"
                  >
                    {t("liveApiKey")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    aria-pressed={revealed}
                    aria-controls="live-api-key"
                    aria-describedby="live-api-key-visibility"
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] hover:text-[#0A0A0A] transition-colors"
                  >
                    <EyeIcon open={revealed} /> {revealed ? t("hide") : t("reveal")}
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-[#E8E8E8] bg-[#F9F9F9] p-1 pl-4">
                  <code
                    id="live-api-key"
                    className={`flex-1 truncate text-sm font-bold tracking-widest ${revealed ? "text-[#0A0A0A]" : "text-[#E8E8E8]"}`}
                  >
                    {displayKey}
                  </code>
                  {revealed && <CopyButton text={apiKey} />}
                </div>
                <p className="text-xs text-[#6B6B6B]">
                  {t("apiKeyHeaderHintPrefix")}{" "}
                  <code className="text-[#0A0A0A]">x-api-key</code>{" "}
                  {t("apiKeyHeaderHintSuffix")}
                </p>
                <p
                  id="live-api-key-visibility"
                  className="sr-only"
                  aria-live="polite"
                >
                  {revealed ? t("apiKeyVisible") : t("apiKeyHidden")}
                </p>
              </div>

              <div className="h-px bg-[#E8E8E8]" />

              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-[#0A0A0A] mb-1">
                    {t("rotateApiKeyTitle")}
                  </h3>
                  <p className="text-xs text-[#6B6B6B]">
                    {t("rotateApiKeyDescription")}
                  </p>
                </div>
                {rotateError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {rotateError}
                  </div>
                )}
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRotateError(null);
                      setConfirming(true);
                    }}
                    className="self-start rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-red-600 hover:bg-red-100 transition-all"
                  >
                    {t("rotateKeyEllipsis")}
                  </button>
                ) : (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5 flex flex-col gap-3">
                    <p className="text-xs font-bold text-yellow-800 uppercase tracking-widest">
                      {t("confirmAction")}
                    </p>
                    <p className="text-xs text-yellow-700">
                      {t("rotateKeyWarning")}
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={confirmRotate}
                        disabled={rotating}
                        className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl bg-[var(--pluto-500)] py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-[var(--pluto-600)] hover:shadow-md hover:scale-[1.01] disabled:opacity-50 transition-all duration-200"
                      >
                        {rotating && <Spinner size="sm" className="h-3.5 w-3.5" />}
                        {rotating ? t("rotating") : t("confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        disabled={rotating}
                        className="flex-1 min-w-0 rounded-xl border border-[#E8E8E8] bg-white py-2.5 text-xs font-bold uppercase tracking-widest text-[#6B6B6B] hover:bg-[#F5F5F5] hover:shadow-sm hover:border-[#D0D0D0] disabled:opacity-50 transition-all duration-200"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Branding Tab */}
          {activeTab === "branding" && loadingBranding && (
            <div
              id={getSettingsPanelDomId("branding")}
              role="tabpanel"
              aria-label={t("navBranding")}
              aria-labelledby="branding-tab branding-tab-mobile"
              aria-busy="true"
              tabIndex={0}
            >
              <SettingsPanelSkeleton />
            </div>
          )}
          {activeTab === "branding" && !loadingBranding && (
            <div
              id={getSettingsPanelDomId("branding")}
              role="tabpanel"
              aria-label={t("navBranding")}
              aria-labelledby="branding-tab branding-tab-mobile"
              tabIndex={0}
              className="rounded-2xl border border-[#E8E8E8] bg-white p-8 flex flex-col gap-8"
            >
              <div>
                <h2 className="text-lg font-bold text-[#0A0A0A] mb-1">
                  {t("checkoutBrandingTitle")}
                </h2>
                <p className="text-sm text-[#6B6B6B]">
                  {t("checkoutBrandingDescription")}
                </p>
              </div>

              {/* Logo upload */}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]">
                  {t("storeLogo")}
                </label>
                <div
                  {...getRootProps()}
                  className={`relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${isDragActive ? "border-[#0A0A0A] bg-[#F9F9F9]" : "border-[#E8E8E8] bg-[#F9F9F9] hover:border-[#0A0A0A]"}`}
                >
                  <input {...getInputProps()} />
                  {branding.logo_url ? (
                    <div className="flex flex-col items-center gap-2 p-4">
                      <Image
                        src={branding.logo_url}
                        alt="Logo"
                        width={64}
                        height={64}
                        className="object-contain"
                        unoptimized
                      />
                      <span className="text-xs text-[#6B6B6B]">
                        {t("clickOrDragToReplace")}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-6 text-center">
                      <div className="rounded-full bg-white border border-[#E8E8E8] p-3 text-[#6B6B6B]">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#0A0A0A]">
                        {isDragActive ? t("dropHere") : t("uploadLogo")}
                      </p>
                      <p className="text-xs text-[#6B6B6B]">
                        {t("logoFormats")}
                      </p>
                    </div>
                  )}
                </div>
                {branding.logo_url && (
                  <button
                    type="button"
                    onClick={() => updateBrandingField("logo_url", null)}
                    className="self-start text-xs text-red-500 hover:text-red-600 transition-colors"
                  >
                    {t("removeLogo")}
                  </button>
                )}
              </div>

              {/* Color pickers */}
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]">
                  {t("colors")}
                </label>
                {(
                  [
                    ["primary_color", t("primary")],
                    ["secondary_color", t("secondary")],
                    ["background_color", t("background")],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="color"
                      value={branding[field]}
                      onChange={(e) =>
                        updateBrandingField(field, e.target.value)
                      }
                      aria-label={`${label} color picker`}
                      className="h-10 w-12 shrink-0 rounded-lg border border-[#E8E8E8] bg-white p-1 cursor-pointer"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label
                        htmlFor={`color-text-${field}`}
                        className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]"
                      >
                        {label}
                      </label>
                      <input
                        id={`color-text-${field}`}
                        type="text"
                        value={branding[field]}
                        onChange={(e) =>
                          updateBrandingField(field, e.target.value)
                        }
                        className="w-full rounded-lg border border-[#E8E8E8] bg-[#F9F9F9] px-3 py-2 font-mono text-sm text-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div className="rounded-xl border border-[#E8E8E8] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#E8E8E8] bg-[#F9F9F9]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]">
                    {t("preview")}
                  </p>
                </div>
                <div
                  className="p-6"
                  style={{ background: branding.background_color }}
                >
                  <div
                    className="rounded-xl border p-4"
                    style={{ borderColor: `${branding.secondary_color}44` }}
                  >
                    <p
                      className="text-sm font-medium mb-3"
                      style={{ color: branding.secondary_color }}
                    >
                      {t("sampleCheckout")}
                    </p>
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2 text-sm font-bold"
                      style={{
                        background: branding.primary_color,
                        color:
                          contrastRatio(branding.primary_color, "#000") > 5
                            ? "#000"
                            : "#fff",
                      }}
                    >
                      {t("payNow")}
                    </button>
                  </div>
                </div>
              </div>

              {brandingError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                  {brandingError}
                </div>
              )}
              {lowContrastWarning && (
                <div
                  role="alert"
                  className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700"
                >
                  {t("lowContrastWarning")}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={saveBranding}
                  disabled={savingBranding}
                  className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl bg-[var(--pluto-500)] py-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[var(--pluto-600)] hover:shadow-md hover:scale-[1.01] disabled:opacity-50 transition-all duration-200"
                >
                  {savingBranding && <Spinner size="sm" className="h-3.5 w-3.5" />}
                  {savingBranding ? t("saving") : t("saveBranding")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  disabled={!apiKey}
                  className="flex-1 min-w-0 rounded-xl border border-[#E8E8E8] bg-white px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#0A0A0A] hover:shadow-sm hover:border-[#D0D0D0] disabled:opacity-50 transition-all duration-200"
                >
                  {t("previewReceipt")}
                </button>
              </div>
            </div>
          )}

          {/* Display Tab */}
          {activeTab === "display" && (
            <div
              id={getSettingsPanelDomId("display")}
              role="tabpanel"
              aria-label={t("navDisplay")}
              aria-labelledby="display-tab display-tab-mobile"
              tabIndex={0}
              className="rounded-2xl border border-[#E8E8E8] bg-white p-8 flex flex-col gap-8 max-w-full"
            >
              <div>
                <h2 className="text-lg font-bold text-[#0A0A0A] mb-1">
                  {t("displayPreferencesTitle")}
                </h2>
                <p className="text-sm text-[#6B6B6B]">
                  {t("displayPreferencesDescription")}
                </p>
              </div>
              <div className="rounded-xl border border-[#E8E8E8] bg-[#F9F9F9] p-5">
                <label className="flex items-start gap-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideCents}
                    onChange={(e) => setHideCents(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-[#E8E8E8] text-[#0A0A0A] focus:ring-[#0A0A0A]"
                  />
                  <div>
                    <p className="text-sm font-bold text-[#0A0A0A]">
                      {t("hideTrailingCents")}
                    </p>
                    <p className="text-xs text-[#6B6B6B] mt-1">
                      {t("hideTrailingCentsDescription")}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Webhooks Tab */}
          {activeTab === "webhooks" && loadingWebhook && (
            <div
              id={getSettingsPanelDomId("webhooks")}
              role="tabpanel"
              aria-label={t("navWebhooks")}
              aria-labelledby="webhooks-tab webhooks-tab-mobile"
              aria-busy="true"
              tabIndex={0}
            >
              <SettingsPanelSkeleton />
            </div>
          )}
          {activeTab === "webhooks" && !loadingWebhook && (
            <div
              id={getSettingsPanelDomId("webhooks")}
              role="tabpanel"
              aria-label={t("navWebhooks")}
              aria-labelledby="webhooks-tab webhooks-tab-mobile"
              tabIndex={0}
              className="rounded-2xl border border-[#E8E8E8] bg-white p-8 flex flex-col gap-8 max-w-full"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0A0A0A] mb-1">
                    {t("webhookEndpointTitle")}
                  </h2>
                  <p className="text-sm text-[#6B6B6B]">
                    {t("webhookEndpointDescription")}
                  </p>
                </div>
                {webhookUrl && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <WebhookHealthIndicator webhookUrl={webhookUrl} />
                    <span
                      role="status"
                      aria-live="polite"
                      className={`rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-widest ${isVerified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-yellow-200 bg-yellow-50 text-yellow-700"}`}
                    >
                      {isVerified ? t("verified") : t("unverified")}
                    </span>
                  </div>
                )}
              </div>

              {webhookSaveError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                  {webhookSaveError}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <label
                  htmlFor="webhook-url"
                  className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]"
                >
                  {t("endpointUrl")}
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  value={webhookUrl}
                  onChange={handleWebhookUrlChange}
                  placeholder="https://example.com/hooks/pluto"
                  aria-invalid={webhookUrlError ? "true" : "false"}
                  aria-describedby={webhookUrlError ? "webhook-url-error" : undefined}
                  className={`rounded-xl border bg-[#F9F9F9] px-4 py-3 font-mono text-sm text-[#0A0A0A] focus:outline-none focus:bg-white transition-all ${webhookUrlError ? "border-red-300 focus:border-red-500" : "border-[#E8E8E8] focus:border-[#0A0A0A]"}`}
                />
                {webhookUrlError && (
                  <p id="webhook-url-error" className="text-xs text-red-500" role="alert">
                    {webhookUrlError}
                  </p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={saveWebhookUrl}
                    disabled={
                      savingWebhook || !!webhookUrlError
                    }
                    className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl bg-[var(--pluto-500)] py-2.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[var(--pluto-600)] hover:shadow-md hover:scale-[1.01] disabled:opacity-50 transition-all duration-200"
                  >
                    {savingWebhook && <Spinner size="sm" className="h-3.5 w-3.5" />}
                    {savingWebhook ? t("saving") : t("saveUrl")}
                  </button>
                  <button
                    type="button"
                    onClick={testWebhook}
                    disabled={testingWebhook || !webhookUrl}
                    className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl border border-[#E8E8E8] bg-white py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#0A0A0A] hover:shadow-sm hover:border-[#D0D0D0] disabled:opacity-50 transition-all duration-200"
                  >
                    {testingWebhook && <Spinner size="sm" className="h-3.5 w-3.5" />}
                    {testingWebhook ? t("testing") : t("sendTest")}
                  </button>
                </div>
              </div>

              {webhookUrl && webhookVerification && (
                <div className="rounded-xl border border-[#E8E8E8] bg-[#F9F9F9] p-5 flex flex-col gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]">
                    {t("domainVerification")}
                  </p>
                  <p className="text-xs text-[#6B6B6B]">
                    {t("hostTokenAt")}{" "}
                    <code className="text-[#0A0A0A] break-all">
                      {webhookVerification.verification_file_url}
                    </code>
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-lg border border-[#E8E8E8] bg-white p-1 pl-4">
                    <code className="flex-1 min-w-0 truncate font-mono text-xs text-[#0A0A0A]">
                      {webhookVerification.verification_token ?? "—"}
                    </code>
                    {webhookVerification.verification_token && (
                      <CopyButton
                        text={webhookVerification.verification_token}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={verifyWebhookDomain}
                    disabled={verifyingWebhookDomain}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[#E8E8E8] bg-white py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#0A0A0A] hover:bg-[#F5F5F5] hover:shadow-sm hover:border-[#D0D0D0] disabled:opacity-50 transition-all duration-200"
                  >
                    {verifyingWebhookDomain && <Spinner size="sm" className="h-3.5 w-3.5" />}
                    {verifyingWebhookDomain ? t("verifying") : t("verifyDomain")}
                  </button>
                </div>
              )}

              <div className="h-px bg-[#E8E8E8]" />

              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-[#0A0A0A] mb-1">
                    {t("signingSecretTitle")}
                  </h3>
                  <p className="text-xs text-[#6B6B6B]">
                    {t("signingSecretDescriptionPrefix")}{" "}
                    <code className="text-[#0A0A0A]">Pluto-Signature</code>{" "}
                    {t("signingSecretDescriptionSuffix")}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-[#E8E8E8] bg-[#F9F9F9] p-1 pl-4">
                  <code
                    id="webhook-secret-value"
                    className="flex-1 truncate font-mono text-xs text-[#0A0A0A]"
                  >
                    {webhookNewSecret
                      ? webhookRevealedSecret
                        ? webhookNewSecret
                        : "•".repeat(webhookNewSecret.length)
                      : webhookSecretMasked || "—"}
                  </code>
                  {webhookNewSecret && (
                    <button
                      type="button"
                      onClick={() => setWebhookRevealedSecret((v) => !v)}
                      aria-label={webhookRevealedSecret ? t("hideWebhookSecret") : t("showWebhookSecret")}
                      aria-pressed={webhookRevealedSecret}
                      aria-controls="webhook-secret-value webhook-secret-visibility"
                      className="p-1 text-[#6B6B6B] hover:text-[#0A0A0A]"
                    >
                      <EyeIcon open={webhookRevealedSecret} />
                    </button>
                  )}
                  {webhookNewSecret && webhookRevealedSecret && (
                    <CopyButton text={webhookNewSecret} />
                  )}
                </div>
                {webhookNewSecret && (
                  <div
                    id="webhook-secret-visibility"
                    role="status"
                    aria-live="polite"
                    className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-center text-[10px] font-bold uppercase tracking-widest text-yellow-800"
                  >
                    {webhookRevealedSecret
                      ? t("webhookSecretVisible")
                      : t("webhookSecretHidden")}
                  </div>
                )}
                {!confirmRegenSecret ? (
                  <button
                    type="button"
                    onClick={() => {
                      setWebhookSaveError(null);
                      setConfirmRegenSecret(true);
                    }}
                    className="self-start rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-red-600 hover:bg-red-100 transition-all"
                  >
                    {t("regenerateSecretEllipsis")}
                  </button>
                ) : (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5 flex flex-col gap-3">
                    <p className="text-xs font-bold text-yellow-800 uppercase tracking-widest">
                      {t("confirmAction")}
                    </p>
                    <p className="text-xs text-yellow-700">
                      {t("regenerateSecretWarning")}
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={regenerateWebhookSecret}
                        disabled={regeneratingSecret}
                        className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl bg-[var(--pluto-500)] py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-[var(--pluto-600)] hover:shadow-md hover:scale-[1.01] disabled:opacity-50 transition-all duration-200"
                      >
                        {regeneratingSecret && <Spinner size="sm" className="h-3.5 w-3.5" />}
                        {regeneratingSecret ? t("regenerating") : t("confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRegenSecret(false)}
                        disabled={regeneratingSecret}
                        className="flex-1 min-w-0 rounded-xl border border-[#E8E8E8] bg-white py-2.5 text-xs font-bold uppercase tracking-widest text-[#6B6B6B] hover:bg-[#F5F5F5] hover:shadow-sm hover:border-[#D0D0D0] disabled:opacity-50 transition-all duration-200"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Permissions Tab */}
          {activeTab === "permissions" && (
            <div
              id={getSettingsPanelDomId("permissions")}
              role="tabpanel"
              aria-label={t("navPermissions")}
              aria-labelledby="permissions-tab permissions-tab-mobile"
              tabIndex={0}
              className="rounded-2xl border border-[#E8E8E8] bg-white p-8"
            >
              <UserPermissionsManager showCategories />
            </div>
          )}

          {/* Danger Tab */}
          {activeTab === "danger" && (
            <div
              id={getSettingsPanelDomId("danger")}
              role="tabpanel"
              aria-label={t("navDanger")}
              aria-labelledby="danger-tab danger-tab-mobile"
              tabIndex={0}
              className="rounded-2xl border border-red-200 bg-white p-8 flex flex-col gap-6 max-w-full"
            >
              <div>
                <h2 className="text-lg font-bold text-red-600 mb-1">
                  {t("navDanger")}
                </h2>
                <p className="text-sm text-[#6B6B6B]">
                  {t("dangerZoneDescription")}
                </p>
              </div>
              <DangerZone apiKey={apiKey} />
            </div>
          )}
        </div>
        {/* end right panel */}
      </div>
      {/* end two-column */}

      <EmailReceiptPreview
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        branding={branding}
        apiKey={apiKey}
        apiUrl={API_URL}
      />
    </div>
  );
}
