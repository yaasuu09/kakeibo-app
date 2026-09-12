"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LineChart } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-t border-border/50 pb-safe">
      <div className="container mx-auto max-w-md h-16 flex items-center justify-around px-4">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
            pathname === "/" ? "text-primary" : "text-muted-foreground hover:text-primary/80"
          }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-medium">入力</span>
        </Link>
        <Link
          href="/analysis"
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
            pathname === "/analysis" ? "text-primary" : "text-muted-foreground hover:text-primary/80"
          }`}
        >
          <LineChart className="w-6 h-6" />
          <span className="text-[10px] font-medium">AI分析</span>
        </Link>
      </div>
    </nav>
  );
}
