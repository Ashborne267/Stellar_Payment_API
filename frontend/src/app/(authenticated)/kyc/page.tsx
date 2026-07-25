import { Metadata } from "next";
import KycPageContent from "@/components/KycPageContent";

export const metadata: Metadata = {
  title: "KYC Verification | PLUTO",
  description: "Complete your KYC verification to unlock full platform features",
};

export default function KycPage() {
  return <KycPageContent />;
}
