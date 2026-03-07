import { assertAllowedSalesforceInstanceUrl } from '../../lib/salesforce-utils';

// Cache validated sessions for 5 minutes to avoid repeated validation calls
const sessionCache = new Map<string, { sessionId: string; validatedAt: number }>();
const SESSION_CACHE_TTL = 5 * 60 * 1000;

export async function getSessionFromCookie(
  instanceUrl: string,
): Promise<{ sessionId: string } | null> {
  const normalizedInstanceUrl = assertAllowedSalesforceInstanceUrl(instanceUrl, 'instance URL');

  // Check cache first
  const cached = sessionCache.get(normalizedInstanceUrl);
  if (cached && Date.now() - cached.validatedAt < SESSION_CACHE_TTL) {
    return { sessionId: cached.sessionId };
  }

  try {
    const cookie = await chrome.cookies.get({
      url: normalizedInstanceUrl,
      name: 'sid',
    });

    let sessionId = cookie?.value ?? null;

    if (!sessionId) {
      // Fallback: try parent domain
      const url = new URL(normalizedInstanceUrl);
      const parts = url.hostname.split('.');
      if (parts.length >= 3) {
        const parentDomain = parts.slice(-3).join('.');
        const fallback = await chrome.cookies.get({
          url: `https://${parentDomain}`,
          name: 'sid',
        });
        sessionId = fallback?.value ?? null;
      }
    }

    if (!sessionId) return null;

    // Cache the session
    sessionCache.set(normalizedInstanceUrl, { sessionId, validatedAt: Date.now() });
    return { sessionId };
  } catch {
    return null;
  }
}

/** Clear cached session (e.g. on 401 response). */
export function clearSessionCache(instanceUrl?: string): void {
  if (instanceUrl) {
    try {
      sessionCache.delete(assertAllowedSalesforceInstanceUrl(instanceUrl, 'instance URL'));
    } catch {
      // Ignore invalid cache keys.
    }
  } else {
    sessionCache.clear();
  }
}
