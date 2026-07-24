/**
 * Settings page — React Server Component entry point
 *
 * #1190: Migrate component to React Server Components for User Profile
 *        Settings Widget.
 *
 * Architecture:
 *  ┌─ page.tsx (RSC) ─────────────────────────────────────────────┐
 *  │  • No "use client" directive → runs on the server            │
 *  │  • Provides page-level <title> / metadata                    │
 *  │  • Renders the static page shell (heading) on the server     │
 *  │  • Passes control to SettingsWidget for all interactive UI   │
 *  └───────────────────────────────────────────────────────────────┘
 *       │ imports
 *       ▼
 *  ┌─ SettingsWidget.tsx ("use client") ──────────────────────────┐
 *  │  • Full interactive settings dashboard (tabs, branding, etc.)│
 *  │  • Owns all useState/useEffect/useCallback hooks             │
 *  └───────────────────────────────────────────────────────────────┘
 *
 * Benefits:
 *  - Server shell renders immediately without JS (no blank flash)
 *  - Client JS bundle is smaller: only SettingsWidget is hydrated
 *  - Locale, metadata, and static sections run at the edge/server
 */

import { type Metadata } from "next";
import SettingsWidget from "./SettingsWidget";

export const metadata: Metadata = {
  title: "Settings | PLUTO",
  description:
    "Manage your credentials, branding, webhooks, and integrations.",
};

/**
 * RSC page — mounts the interactive client SettingsWidget.
 * Any server-only work (e.g. reading cookies, fetching public config)
 * can be added here and passed down as props to SettingsWidget without
 * bloating the client bundle.
 */
export default function SettingsPage() {
  return <SettingsWidget />;
}
