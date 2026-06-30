// Pull the KOL id / handle from a social account or link.
// "instagram.com/@johndoe" / "instagram.com/johndoe/" / "@johndoe" -> "@johndoe".
export function extractHandle(socialAccount?: string, kolLink?: string): string {
  const src = (socialAccount || kolLink || "").trim();
  if (!src) return "";
  const at = src.match(/@([A-Za-z0-9._]+)/);
  if (at) return "@" + at[1];
  const seg = src
    .replace(/^https?:\/\//i, "")
    .replace(/[?#].*$/, "")
    .split("/")
    .filter(Boolean);
  if (seg.length >= 2) return "@" + seg[seg.length - 1];
  return "";
}

// Strip characters that are illegal in filenames.
export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|@]/g, "").trim() || "contract";
}
