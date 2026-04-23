import "globals.css";

import { ClerkProvider, SignedIn, UserButton } from "@clerk/nextjs";
import { type Metadata } from "next";
import { Inter } from "next/font/google";
import { lazy } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { NAV_LINKS } from "@/config/nav-links";

const ElementSelector = lazy(() =>
  process.env.NODE_ENV === "development"
    ? import("@/components/ElementSelector")
    : Promise.resolve({ default: () => null }),
);

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Internal App";

export const metadata: Metadata = {
  title: appName,
  description: `${appName} - Created with Vybe`,
  icons: "https://vybe.build/vybe-icon.svg",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_cGF0aWVudC1oYWdmaXNoLTY1LmNsZXJrLmFjY291bnRzLmRldiQ"}>
      <html lang="en" suppressHydrationWarning className={`${inter.className}`}>
        <body className="min-h-screen" suppressHydrationWarning>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {NAV_LINKS.length >= 2 ? (
              <SidebarProvider>
                <Sidebar />
                <SidebarInset>
                  <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
                    <SignedIn>
                      <UserButton afterSignOutUrl="/sign-in" />
                    </SignedIn>
                  </div>
                  <main className="flex-1 p-4">{children}</main>
                </SidebarInset>
              </SidebarProvider>
            ) : (
              <>
                <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
                  <SignedIn>
                    <UserButton afterSignOutUrl="/sign-in" />
                  </SignedIn>
                </div>
                <main className="flex-1 p-4">{children}</main>
              </>
            )}
            <Toaster richColors />
            <ElementSelector />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
