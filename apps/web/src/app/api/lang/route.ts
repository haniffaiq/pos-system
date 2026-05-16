import { localeCookieName, isLocale } from "@/i18n";
import { NextResponse } from "next/server";

const oneYearInSeconds = 60 * 60 * 24 * 365;

export async function POST(req: Request) {
  let locale: unknown;

  try {
    locale = ((await req.json()) as { locale?: unknown }).locale;
  } catch {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400 });
  }

  const requestedLocale = typeof locale === "string" ? locale : undefined;

  if (!isLocale(requestedLocale)) {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(localeCookieName, requestedLocale, {
    path: "/",
    maxAge: oneYearInSeconds,
    sameSite: "lax",
  });

  return response;
}
