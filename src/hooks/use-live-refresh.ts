import { useEffect, useRef } from "react";
import {
  isTabActive,
  isTabVisible,
  subscribeRefresh,
} from "@/lib/live-refresh";

/**
 * Keep a page's data fresh without a manual reload.
 *
 * - Fetches immediately on mount.
 * - Refetches instantly whenever `emitRefresh()` fires in-app (e.g. a record
 *   was approved/rejected on the Approvals page).
 * - Polls every `pollMs` — but ONLY while the tab is visible AND focused.
 *   Background/hidden tabs never poll; on regaining focus the data refetches
 *   immediately.
 */
export function useLiveRefresh(
  refetch: () => void,
  pollMs = 15_000,
  options?: { fetchOnMount?: boolean }
): void {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const fetchOnMount = options?.fetchOnMount ?? true;

  useEffect(() => {
    if (fetchOnMount) {
      refetchRef.current();
    }

    const unsubscribe = subscribeRefresh(() => {
      refetchRef.current();
    });

    let interval: ReturnType<typeof setInterval> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearPolling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const startPolling = () => {
      clearPolling();
      interval = setInterval(() => {
        if (isTabActive()) {
          refetchRef.current();
        }
      }, pollMs);
    };

    const handleActive = () => {
      if (isTabActive()) {
        refetchRef.current();
        startPolling();
      } else {
        clearPolling();
      }
    };

    const handleVisibility = () => {
      if (isTabVisible()) {
        refetchRef.current();
        startPolling();
      } else {
        clearPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleActive);
    window.addEventListener("blur", handleActive);

    if (isTabActive()) {
      startPolling();
    }

    return () => {
      unsubscribe();
      clearPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleActive);
      window.removeEventListener("blur", handleActive);
    };
  }, [pollMs]);
}