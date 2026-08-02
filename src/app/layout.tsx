import type { Metadata } from "next";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { SITE_COPY } from "@/shared/constants/site-copy";
import { parseAppOrigin } from "@/shared/lib/app-origin";
import "./globals.css";

/** Keep serverless routes in Seoul to cut Korea↔US round trips. */
export const preferredRegion = "icn1";

const originResult = parseAppOrigin(process.env.APP_ORIGIN);
const metadataBase = originResult.ok ? new URL(originResult.origin) : undefined;

export const metadata: Metadata = {
  ...(metadataBase ? { metadataBase } : {}),
  title: {
    default: SITE_COPY.titleDefault,
    template: SITE_COPY.titleTemplate,
  },
  description: SITE_COPY.description,
  applicationName: SITE_COPY.brandName,
  keywords: [
    "PinPaw",
    "실종 반려동물",
    "유기견",
    "목격 제보",
    "반려동물 찾기",
    "강아지 실종",
  ],
  openGraph: {
    title: SITE_COPY.ogTitle,
    description: SITE_COPY.description,
    siteName: SITE_COPY.brandName,
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_COPY.ogTitle,
    description: SITE_COPY.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
