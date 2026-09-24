const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes I, O, 0, 1 to avoid ambiguity

export function generateRecoveryCode(length = 10): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/**
 * Codes are typed by hand on phones, where keyboards freely change case and
 * people copy in stray spaces or dashes. The Firestore document ID is the
 * code verbatim, so `abcd…` and `ABCD…` would silently be two different
 * sessions — normalize before using a typed code for anything.
 */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const JOIN_PARAM = 'join';

/** A link that, when opened, offers to join the session for `code`. */
export function buildShareLink(code: string, baseUrl: string): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set(JOIN_PARAM, code);
  return url.toString();
}

/** The session code carried by a share link's query string, if any. */
export function readJoinCode(search: string): string | null {
  const raw = new URLSearchParams(search).get(JOIN_PARAM);
  if (!raw) return null;
  const code = normalizeRecoveryCode(raw);
  return code || null;
}

/** Strip the join parameter from the address bar once it has been handled. */
export function clearJoinCodeFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(JOIN_PARAM)) return;
  url.searchParams.delete(JOIN_PARAM);
  window.history.replaceState(window.history.state, '', url.toString());
}
