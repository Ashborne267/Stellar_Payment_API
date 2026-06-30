import { defineRouting } from "next-intl/routing";
import {
  defaultLocale,
  localeCookieMaxAge,
  localeCookieName,
  locales,
} from "@/i18n/config";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
  localeCookie: {
    name: localeCookieName,
    maxAge: localeCookieMaxAge,
    path: "/",
    sameSite: "lax",
  },
});
