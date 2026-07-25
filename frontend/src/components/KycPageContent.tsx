"use client";

import { useTranslations } from "next-intl";
import KycSubmissionForm from "@/components/KycSubmissionForm";

export default function KycPageContent() {
  const t = useTranslations("kycPage");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">{t("title")}</h1>
        <p className="text-slate-400">{t("description")}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <KycSubmissionForm />
      </div>

      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
        <h3 className="mb-2 font-semibold text-blue-400">{t("whyKyc")}</h3>
        <ul className="space-y-1 text-sm text-slate-400">
          <li>• {t("reasonComply")}</li>
          <li>• {t("reasonLimits")}</li>
          <li>• {t("reasonFeatures")}</li>
          <li>• {t("reasonSecurity")}</li>
        </ul>
      </div>
    </div>
  );
}
