"use client";

import { useEffect, useState } from "react";

/**
 * Debounces a value by the specified delay in milliseconds.
 * Returns the latest value only after the delay has elapsed
 * without a new value being set.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
