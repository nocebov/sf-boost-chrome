/**
 * Salesforce-specific validation utilities.
 * Protects against SOQL injection and ensures data integrity.
 */

const SF_ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;

/**
 * Validate a Salesforce record ID format.
 * Salesforce IDs are 15 or 18 character case-sensitive alphanumeric strings.
 */
export function isValidSalesforceId(id: string): boolean {
  return SF_ID_REGEX.test(id);
}

/**
 * Assert that a value is a valid Salesforce ID.
 * Throws if validation fails — use before interpolating into SOQL queries.
 */
export function assertSalesforceId(id: string, context?: string): string {
  if (!isValidSalesforceId(id)) {
    throw new Error(
      `Invalid Salesforce ID${context ? ` for ${context}` : ''}: expected 15-18 alphanumeric characters`
    );
  }
  return id;
}

/**
 * Escape a string for safe use in SOQL single-quoted literals.
 * Handles: backslash, single quote, and newlines.
 */
export function escapeSoqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/** Validate a CSS color value (hex, rgb, hsl, or named). */
export function isValidCssColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)
    || /^(rgb|hsl)a?\([\d\s,%.]+\)$/.test(color)
    || /^[a-zA-Z]{3,20}$/.test(color);
}

/**
 * Validate allowed Salesforce domains for origin checking.
 */
const ALLOWED_DOMAIN_SUFFIXES = [
  '.salesforce.com',
  '.force.com',
  '.salesforce-setup.com',
];

export function isAllowedSalesforceDomain(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_DOMAIN_SUFFIXES.some(suffix => lower.endsWith(suffix));
}

export function isAllowedSalesforceInstanceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (url.port) return false;
    return url.hostname.toLowerCase().endsWith('.salesforce.com');
  } catch {
    return false;
  }
}

export function assertAllowedSalesforceInstanceUrl(value: string, context = 'instance URL'): string {
  if (!isAllowedSalesforceInstanceUrl(value)) {
    throw new Error(`Invalid Salesforce ${context}`);
  }

  return new URL(value).origin;
}
