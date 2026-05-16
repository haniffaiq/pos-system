import { randomBytes } from "node:crypto";

import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

const DEFAULT_ACCESS_COOKIE = "brs_access";
const REFRESH_COOKIE = "brs_refresh";
const CSRF_COOKIE = "brs_csrf";
const DEFAULT_ACCESS_TTL_SECONDS = 900;
const DEFAULT_REFRESH_TTL_SECONDS = 1_209_600;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function secureCookie(): boolean {
  if (process.env.SESSION_COOKIE_SECURE !== undefined) {
    return process.env.SESSION_COOKIE_SECURE === "true";
  }
  return process.env.NODE_ENV === "production";
}

function cookieDomain(): string | undefined {
  return process.env.SESSION_COOKIE_DOMAIN || undefined;
}

export function accessCookieName(): string {
  return process.env.SESSION_COOKIE_NAME || DEFAULT_ACCESS_COOKIE;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function setAuthCookies(
  c: Context,
  tokens: { accessToken: string; refreshToken: string; csrfToken?: string },
): string {
  const csrfToken = tokens.csrfToken ?? generateCsrfToken();
  const secure = secureCookie();
  const domain = cookieDomain();

  setCookie(c, accessCookieName(), tokens.accessToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    domain,
    path: "/",
    maxAge: positiveNumber(process.env.ACCESS_TOKEN_TTL, DEFAULT_ACCESS_TTL_SECONDS),
  });
  setCookie(c, REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    domain,
    path: "/api/v1/auth",
    maxAge: positiveNumber(process.env.REFRESH_TOKEN_TTL, DEFAULT_REFRESH_TTL_SECONDS),
  });
  setCookie(c, CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: "Lax",
    secure,
    domain,
    path: "/",
    maxAge: positiveNumber(process.env.ACCESS_TOKEN_TTL, DEFAULT_ACCESS_TTL_SECONDS),
  });
  return csrfToken;
}

export function clearAuthCookies(c: Context): void {
  const domain = cookieDomain();
  deleteCookie(c, accessCookieName(), { path: "/", domain });
  deleteCookie(c, REFRESH_COOKIE, { path: "/api/v1/auth", domain });
  deleteCookie(c, CSRF_COOKIE, { path: "/", domain });
}

export function readAccessCookie(c: Context): string | undefined {
  return getCookie(c, accessCookieName()) ?? getCookie(c, "owa.access");
}

export function readRefreshCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE) ?? getCookie(c, "owa.refresh");
}

export function readCsrfCookie(c: Context): string | undefined {
  return getCookie(c, CSRF_COOKIE);
}
