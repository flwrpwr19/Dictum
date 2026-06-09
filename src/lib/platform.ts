/** Returns true when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    "__TAURI__" in window ||
    "isTauri" in window
  );
}
