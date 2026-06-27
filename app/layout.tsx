import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/layout/Providers"
import { Toaster } from "react-hot-toast"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "TaxSnap — IRS-ready receipt tracker",
  description: "Scan receipts, track mileage, and auto-fill your taxes. AI-powered, IRS-compliant.",
  manifest: "/manifest.json",
  themeColor: "#1D9E75",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
        </Providers>
      </body>
    </html>
  )
}
