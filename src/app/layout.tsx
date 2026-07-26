import type { Metadata } from "next";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PinPaw",
    template: "%s · PinPaw",
  },
  description: "실종 반려동물을 지역 제보와 추천으로 찾는 서비스",
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
