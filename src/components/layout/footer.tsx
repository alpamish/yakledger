'use client';

import * as React from 'react';

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-card px-4 py-3 transition-colors">
      <div className="flex flex-col items-center justify-between gap-1 text-xs text-muted-foreground sm:flex-row">
        <p>
          &copy; {new Date().getFullYear()} Yakhshi Ledger. All rights reserved.
        </p>
        <p className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-md bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            v1.0.0
          </span>
          <span>Built with Next.js</span>
        </p>
      </div>
    </footer>
  );
}
