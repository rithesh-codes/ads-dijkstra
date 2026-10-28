import type { Metadata } from "next";
import "./globals.css";
import { AppDataProvider } from "@/components/AppData";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "RouteForge — Multi-Delivery Route Planner",
  description: "Graph-based delivery route planning with Dijkstra, a min-heap, nearest neighbour and 2-opt (C++ core).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppDataProvider>
          <AppShell>{children}</AppShell>
        </AppDataProvider>
      </body>
    </html>
  );
}
