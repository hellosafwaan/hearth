/** Normalizes "https://www.YouTube.com/x" / "www.youtube.com" → "youtube.com". */
export function normalizeSite(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = raw.includes('://') ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
