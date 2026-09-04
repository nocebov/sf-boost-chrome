/** A Profile ID is exactly 15 or 18 characters and has the 00e key prefix. */
export function isProfileId(value: string): boolean {
  return /^00e[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(value);
}

function profileIdFromPath(path: string): string | null {
  const match = path.match(/^\/(00e[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)(?:\/view)?\/?$/);
  return match?.[1] ?? null;
}

/** Fail closed: an ID in a return URL or an unrelated Setup page is not a profile. */
export function extractProfileIdFromUrl(href: string = window.location.href): string | null {
  try {
    const url = new URL(href);
    if (!['https:', 'http:'].includes(url.protocol)) return null;

    if (/^\/lightning\/setup\/(?:EnhancedProfiles|Profiles)\/page\/?$/.test(url.pathname)) {
      const addresses = url.searchParams.getAll('address');
      if (addresses.length !== 1) return null;
      // URLSearchParams decodes once. Do not decode the entire outer URL, which
      // would turn nested query parameters into apparent top-level parameters.
      const address = addresses[0]!;
      if (!address.startsWith('/') || address.startsWith('//') || address.includes('\\')) return null;
      const target = new URL(address, url.origin);
      if (target.origin !== url.origin) return null;
      return profileIdFromPath(target.pathname);
    }

    return profileIdFromPath(url.pathname);
  } catch {
    return null;
  }
}
