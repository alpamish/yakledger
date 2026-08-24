export const REFRESH_EVENT = "yakledger:refresh";

export function emitRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

export function subscribeRefresh(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(REFRESH_EVENT, handler);
  return () => window.removeEventListener(REFRESH_EVENT, handler);
}

export function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden" && !document.hidden;
}

export function isTabFocused(): boolean {
  if (typeof document === "undefined") return true;
  return document.hasFocus();
}

export function isTabActive(): boolean {
  return isTabVisible() && isTabFocused();
}