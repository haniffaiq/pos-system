import "./globals.css";
import React, { type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "../lib/providers";
import { QuotaModal } from "../components/QuotaModal";

export const metadata = {
  title: "BroSolution — Operational Grosir",
  description: "POS, inventory, and reports for Indonesian wholesale teams.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <QuotaModal />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
