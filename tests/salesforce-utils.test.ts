import { describe, it, expect } from 'vitest';
import {
  isValidSalesforceId,
  assertSalesforceId,
  escapeSoqlString,
  isValidCssColor,
  isAllowedSalesforceDomain,
  isAllowedSalesforceInstanceUrl,
  assertAllowedSalesforceInstanceUrl,
} from '../lib/salesforce-utils';

// ─── isValidSalesforceId ────────────────────────────────────────────────────

describe('isValidSalesforceId', () => {
  it('accepts valid 15-character ID', () => {
    expect(isValidSalesforceId('001000000000001')).toBe(true);
  });

  it('accepts valid 18-character ID', () => {
    expect(isValidSalesforceId('001000000000001AAA')).toBe(true);
  });

  it('accepts alphanumeric characters', () => {
    expect(isValidSalesforceId('a0B1C2d3E4f5G6h')).toBe(true);
  });

  it('rejects ID shorter than 15 characters', () => {
    expect(isValidSalesforceId('00100000000')).toBe(false);
  });

  it('rejects ID longer than 18 characters', () => {
    expect(isValidSalesforceId('001000000000001AAAB')).toBe(false);
  });

  it('rejects ID with special characters', () => {
    expect(isValidSalesforceId('001000000000001!')).toBe(false);
  });

  it('rejects ID with spaces', () => {
    expect(isValidSalesforceId('001 00000000001')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSalesforceId('')).toBe(false);
  });

  it('rejects ID with underscores', () => {
    expect(isValidSalesforceId('001_000_000_0001')).toBe(false);
  });

  it('rejects ID with hyphens', () => {
    expect(isValidSalesforceId('001-000-000-0001')).toBe(false);
  });

  it('accepts exactly 16 characters (between 15 and 18)', () => {
    expect(isValidSalesforceId('0010000000000012')).toBe(true);
  });

  it('accepts exactly 17 characters', () => {
    expect(isValidSalesforceId('00100000000000123')).toBe(true);
  });
});

// ─── assertSalesforceId ─────────────────────────────────────────────────────

describe('assertSalesforceId', () => {
  it('returns the ID when valid', () => {
    expect(assertSalesforceId('001000000000001AAA')).toBe('001000000000001AAA');
  });

  it('throws for invalid ID', () => {
    expect(() => assertSalesforceId('invalid')).toThrow('Invalid Salesforce ID');
  });

  it('includes context in error message', () => {
    expect(() => assertSalesforceId('bad', 'record ID'))
      .toThrow('Invalid Salesforce ID for record ID');
  });

  it('throws for empty string', () => {
    expect(() => assertSalesforceId('')).toThrow();
  });
});

// ─── escapeSoqlString ───────────────────────────────────────────────────────

describe('escapeSoqlString', () => {
  it('escapes single quotes', () => {
    expect(escapeSoqlString("O'Brien")).toBe("O\\'Brien");
  });

  it('escapes backslashes', () => {
    expect(escapeSoqlString('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes newlines', () => {
    expect(escapeSoqlString('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes carriage returns', () => {
    expect(escapeSoqlString('line1\rline2')).toBe('line1\\rline2');
  });

  it('escapes combined special characters', () => {
    expect(escapeSoqlString("It's a \\ new\nline"))
      .toBe("It\\'s a \\\\ new\\nline");
  });

  it('returns empty string unchanged', () => {
    expect(escapeSoqlString('')).toBe('');
  });

  it('returns safe string unchanged', () => {
    expect(escapeSoqlString('AccountName')).toBe('AccountName');
  });

  it('handles multiple consecutive quotes', () => {
    expect(escapeSoqlString("'''")).toBe("\\'\\'\\'");
  });

  it('escapes backslash before quote correctly (order matters)', () => {
    // backslash is escaped first, then quote
    expect(escapeSoqlString("\\'")).toBe("\\\\\\'");
  });
});

// ─── isValidCssColor ────────────────────────────────────────────────────────

describe('isValidCssColor', () => {
  describe('hex colors', () => {
    it('accepts 3-digit hex', () => {
      expect(isValidCssColor('#fff')).toBe(true);
    });

    it('accepts 4-digit hex (with alpha)', () => {
      expect(isValidCssColor('#fff0')).toBe(true);
    });

    it('accepts 6-digit hex', () => {
      expect(isValidCssColor('#ff0000')).toBe(true);
    });

    it('accepts 8-digit hex (with alpha)', () => {
      expect(isValidCssColor('#ff000080')).toBe(true);
    });

    it('accepts uppercase hex', () => {
      expect(isValidCssColor('#FF0000')).toBe(true);
    });

    it('rejects hex without hash', () => {
      expect(isValidCssColor('ff0000')).toBe(false);
    });

    it('rejects 2-digit hex', () => {
      expect(isValidCssColor('#ff')).toBe(false);
    });

    it('rejects 5-digit hex', () => {
      expect(isValidCssColor('#ff000')).toBe(false);
    });
  });

  describe('named colors', () => {
    it('accepts standard named colors', () => {
      expect(isValidCssColor('red')).toBe(true);
      expect(isValidCssColor('blue')).toBe(true);
      expect(isValidCssColor('green')).toBe(true);
    });

    it('accepts long named colors', () => {
      expect(isValidCssColor('cornflowerblue')).toBe(true);
    });

    it('rejects very long strings (>20 chars)', () => {
      expect(isValidCssColor('aaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    });

    it('rejects strings with spaces', () => {
      expect(isValidCssColor('light blue')).toBe(false);
    });

    it('rejects single/two char names', () => {
      expect(isValidCssColor('ab')).toBe(false);
    });
  });

  describe('rgb/hsl colors', () => {
    it('accepts rgb()', () => {
      expect(isValidCssColor('rgb(255,0,0)')).toBe(true);
    });

    it('accepts rgba()', () => {
      expect(isValidCssColor('rgba(255,0,0,0.5)')).toBe(true);
    });

    it('accepts hsl()', () => {
      expect(isValidCssColor('hsl(120,50%,50%)')).toBe(true);
    });

    it('accepts hsla()', () => {
      expect(isValidCssColor('hsla(120,50%,50%,0.5)')).toBe(true);
    });

    it('accepts rgb with spaces', () => {
      expect(isValidCssColor('rgb(255, 0, 0)')).toBe(true);
    });
  });

  describe('invalid values', () => {
    it('rejects empty string', () => {
      expect(isValidCssColor('')).toBe(false);
    });

    it('rejects random strings', () => {
      expect(isValidCssColor('not-a-color')).toBe(false);
    });

    it('rejects numbers', () => {
      expect(isValidCssColor('12345')).toBe(false);
    });
  });
});

// ─── isAllowedSalesforceDomain ──────────────────────────────────────────────

describe('isAllowedSalesforceDomain', () => {
  it('allows .salesforce.com', () => {
    expect(isAllowedSalesforceDomain('acme.my.salesforce.com')).toBe(true);
  });

  it('allows .force.com', () => {
    expect(isAllowedSalesforceDomain('acme.lightning.force.com')).toBe(true);
  });

  it('allows .salesforce-setup.com', () => {
    expect(isAllowedSalesforceDomain('acme.my.salesforce-setup.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedSalesforceDomain('Acme.MY.Salesforce.COM')).toBe(true);
  });

  it('rejects non-Salesforce domains', () => {
    expect(isAllowedSalesforceDomain('evil.com')).toBe(false);
  });

  it('rejects domains containing salesforce but not ending correctly', () => {
    expect(isAllowedSalesforceDomain('salesforce.com.evil.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedSalesforceDomain('')).toBe(false);
  });

  it('rejects just the suffix without subdomain', () => {
    // "salesforce.com" itself ends with ".salesforce.com"? No, because .salesforce.com requires a dot before it
    expect(isAllowedSalesforceDomain('salesforce.com')).toBe(false);
  });
});

// ─── isAllowedSalesforceInstanceUrl ─────────────────────────────────────────

describe('isAllowedSalesforceInstanceUrl', () => {
  it('accepts valid Salesforce HTTPS URL', () => {
    expect(isAllowedSalesforceInstanceUrl('https://acme.my.salesforce.com')).toBe(true);
  });

  it('rejects HTTP (not HTTPS)', () => {
    expect(isAllowedSalesforceInstanceUrl('http://acme.my.salesforce.com')).toBe(false);
  });

  it('rejects URL with username', () => {
    expect(isAllowedSalesforceInstanceUrl('https://user@acme.my.salesforce.com')).toBe(false);
  });

  it('rejects URL with password', () => {
    expect(isAllowedSalesforceInstanceUrl('https://user:pass@acme.my.salesforce.com')).toBe(false);
  });

  it('rejects URL with port', () => {
    expect(isAllowedSalesforceInstanceUrl('https://acme.my.salesforce.com:8080')).toBe(false);
  });

  it('rejects non-Salesforce domain', () => {
    expect(isAllowedSalesforceInstanceUrl('https://evil.com')).toBe(false);
  });

  it('rejects force.com (only .salesforce.com is allowed for instance URL)', () => {
    expect(isAllowedSalesforceInstanceUrl('https://acme.lightning.force.com')).toBe(false);
  });

  it('rejects invalid URL format', () => {
    expect(isAllowedSalesforceInstanceUrl('not-a-url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedSalesforceInstanceUrl('')).toBe(false);
  });

  it('accepts URL with path (checks origin only)', () => {
    expect(isAllowedSalesforceInstanceUrl('https://acme.my.salesforce.com/services/data')).toBe(true);
  });
});

// ─── assertAllowedSalesforceInstanceUrl ─────────────────────────────────────

describe('assertAllowedSalesforceInstanceUrl', () => {
  it('returns origin for valid URL', () => {
    expect(assertAllowedSalesforceInstanceUrl('https://acme.my.salesforce.com/path'))
      .toBe('https://acme.my.salesforce.com');
  });

  it('throws for invalid URL', () => {
    expect(() => assertAllowedSalesforceInstanceUrl('https://evil.com'))
      .toThrow('Invalid Salesforce instance URL');
  });

  it('includes custom context in error', () => {
    expect(() => assertAllowedSalesforceInstanceUrl('bad', 'API endpoint'))
      .toThrow('Invalid Salesforce API endpoint');
  });
});
