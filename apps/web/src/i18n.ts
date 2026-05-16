import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const locales = ["id", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "id";

export const localeCookieName = "lang";

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get(localeCookieName)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
