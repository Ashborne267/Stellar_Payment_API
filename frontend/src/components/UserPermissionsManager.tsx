/**
 * UserPermissionsManager — React Server Component entry point
 *
 * #1170: Migrate component to React Server Components for User
 *        Permissions Manager.
 *
 * Architecture (mirrors the settings page RSC split, see
 * app/(authenticated)/settings/page.tsx):
 *  ┌─ UserPermissionsManager.tsx (RSC) ────────────────────────────┐
 *  │  • No "use client" directive → runs on the server             │
 *  │  • Renders the static wrapper/heading, if any, server-side    │
 *  │  • Passes control to the client island for all interactivity  │
 *  └────────────────────────────────────────────────────────────────┘
 *       │ imports
 *       ▼
 *  ┌─ UserPermissionsManagerClient.tsx ("use client") ─────────────┐
 *  │  • Owns useState/useCallback, framer-motion, zustand store    │
 *  │  • Handles toggles, optimistic updates, category expand/collapse│
 *  └────────────────────────────────────────────────────────────────┘
 */

import UserPermissionsManagerClient, {
  type UserPermissionsManagerProps,
} from "./UserPermissionsManagerClient";

export type { UserPermissionsManagerProps };

export function UserPermissionsManager(props: UserPermissionsManagerProps) {
  return <UserPermissionsManagerClient {...props} />;
}

export default UserPermissionsManager;
