/**
 * Invitation utilities for Drocsid
 * Handles invite link generation, URL code extraction, and pending invite persistence.
 */

const PENDING_INVITE_KEY = 'pending_invite';

/**
 * Extracts an invite code from any input string:
 * - Full URL: https://drocsid.site/invite/code-Invitation
 * - URL with query/hash: https://drocsid.site/invite/code-Invitation?ref=123
 * - Hash route: #/invite/code-Invitation
 * - Domain + path: drocsid.site/invite/code-Invitation
 * - Relative path: /invite/code-Invitation
 * - Query param: ?invite=code-Invitation
 * - Raw code: code-Invitation
 */
export function extractInviteCode(input: string): string {
  if (!input) return '';
  let str = input.trim();

  // If there's an /invite/ path anywhere in the string
  if (str.includes('/invite/')) {
    const after = str.split(/\/invite\//i)[1];
    if (after) {
      const code = after.split(/[/?#&]/)[0];
      if (code) return code.trim();
    }
  }

  // If there's an invite query parameter e.g. ?invite=code
  const paramMatch = str.match(/[?&]invite=([a-zA-Z0-9_-]+)/i);
  if (paramMatch && paramMatch[1]) {
    return paramMatch[1].trim();
  }

  // Remove scheme and domain if user pasted something like drocsid.site/xyz
  str = str.replace(/^https?:\/\/[^\/]+/i, '');
  // Remove leading / or invite/
  str = str.replace(/^\/?(invite\/)?/i, '');
  // Remove any trailing slashes, queries, or hashes
  str = str.split(/[/?#&]/)[0].trim();

  return str;
}

export function buildInviteUrl(code: string): string {
  if (!code) return '';
  const defaultBaseUrl = (import.meta.env.VITE_APP_URL as string) || 'https://drocsid.site';
  let baseUrl = defaultBaseUrl;

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    // Only use window.location.origin if it's a standard web HTTP/HTTPS origin
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      baseUrl = origin;
    }
  }

  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/invite/${encodeURIComponent(code.trim())}`;
}

/**
 * Detects an invite code in the current window location (path, hash, query)
 */
export function detectInviteFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const { pathname, search, hash } = window.location;

  // 1. Pathname: /invite/:code
  const pathMatch = pathname.match(/\/invite\/([a-zA-Z0-9_-]+)/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  // 2. Hash: #/invite/:code
  if (hash) {
    const hashMatch = hash.match(/\/invite\/([a-zA-Z0-9_-]+)/i);
    if (hashMatch && hashMatch[1]) {
      return hashMatch[1];
    }
  }

  // 3. Search query: ?invite=:code
  if (search) {
    try {
      const searchParams = new URLSearchParams(search);
      const code = searchParams.get('invite');
      if (code) return code.trim();
    } catch {
      // Ignore URLSearchParams error
    }
  }

  return null;
}

/**
 * Retrieves the pending invite code from storage (sessionStorage or localStorage)
 */
export function getPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY) || localStorage.getItem(PENDING_INVITE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Stores a pending invite code in both sessionStorage and localStorage
 * so it survives tab reloads, login/registration, and OAuth redirects.
 */
export function setPendingInvite(code: string): void {
  try {
    if (!code) return;
    const cleanCode = extractInviteCode(code);
    sessionStorage.setItem(PENDING_INVITE_KEY, cleanCode);
    localStorage.setItem(PENDING_INVITE_KEY, cleanCode);
  } catch (e) {
    console.error('Failed to store pending invite:', e);
  }
}

/**
 * Clears the pending invite code from storage
 */
export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch (e) {
    console.error('Failed to clear pending invite:', e);
  }
}
