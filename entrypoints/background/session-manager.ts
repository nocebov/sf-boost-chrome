export async function getSessionFromCookie(
  instanceUrl: string
): Promise<{ sessionId: string } | null> {
  try {
    const cookie = await chrome.cookies.get({
      url: instanceUrl,
      name: 'sid',
    });

    if (cookie?.value) {
      return { sessionId: cookie.value };
    }

    // Fallback: try parent domain
    const url = new URL(instanceUrl);
    const parentDomain = url.hostname.split('.').slice(-3).join('.');
    const fallback = await chrome.cookies.get({
      url: `https://${parentDomain}`,
      name: 'sid',
    });

    if (fallback?.value) {
      return { sessionId: fallback.value };
    }

    return null;
  } catch {
    return null;
  }
}
