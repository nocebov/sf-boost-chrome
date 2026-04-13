import { describe, it, expect } from 'vitest';
import {
  detectOrgType,
  buildInstanceUrl,
  getCanonicalOrgSettingsKey,
  getOrgSettingsFallbackKeys,
  getSalesforceOrgContextFromUrl,
  isExperienceBuilderHost,
  isSalesforceOrgHost,
  parseLightningUrl,
} from '../lib/salesforce-urls';

describe('isExperienceBuilderHost', () => {
  it('accepts Experience Builder org hosts', () => {
    expect(isExperienceBuilderHost('acme--qa.sandbox.builder.salesforce-experience.com')).toBe(true);
    expect(isExperienceBuilderHost('acme.builder.salesforce-experience.com')).toBe(true);
  });

  it('rejects non-Experience Builder hosts', () => {
    expect(isExperienceBuilderHost('acme.my.salesforce.com')).toBe(false);
  });
});

describe('isSalesforceOrgHost', () => {
  it('accepts classic Salesforce pod hosts', () => {
    expect(isSalesforceOrgHost('na123.salesforce.com')).toBe(true);
    expect(isSalesforceOrgHost('cs88.salesforce.com')).toBe(true);
  });

  it('accepts supported authenticated org hosts', () => {
    expect(isSalesforceOrgHost('acme.my.salesforce.com')).toBe(true);
    expect(isSalesforceOrgHost('acme.lightning.force.com')).toBe(true);
    expect(isSalesforceOrgHost('acme.salesforce-setup.com')).toBe(true);
    expect(isSalesforceOrgHost('acme--qa.sandbox.builder.salesforce-experience.com')).toBe(true);
  });

  it('rejects public Salesforce web properties', () => {
    expect(isSalesforceOrgHost('help.salesforce.com')).toBe(false);
    expect(isSalesforceOrgHost('login.salesforce.com')).toBe(false);
    expect(isSalesforceOrgHost('developer.salesforce.com')).toBe(false);
    expect(isSalesforceOrgHost('trailhead.salesforce.com')).toBe(false);
  });
});

// ─── detectOrgType ──────────────────────────────────────────────────────────

describe('detectOrgType', () => {
  describe('sandbox detection', () => {
    it('detects sandbox with standard hostname pattern', () => {
      const result = detectOrgType('acme--qa.sandbox.my.salesforce.com');
      expect(result.orgType).toBe('sandbox');
      expect(result.myDomain).toBe('acme');
      expect(result.sandboxName).toBe('qa');
    });

    it('detects sandbox with multi-word sandbox name', () => {
      const result = detectOrgType('bigcorp--staging01.sandbox.my.salesforce.com');
      expect(result.orgType).toBe('sandbox');
      expect(result.myDomain).toBe('bigcorp');
      expect(result.sandboxName).toBe('staging01');
    });

    it('detects sandbox even without matching double-dash', () => {
      const result = detectOrgType('something.sandbox.my.salesforce.com');
      expect(result.orgType).toBe('sandbox');
      // Without double-dash pattern, myDomain fallback is hostname
      expect(result.sandboxName).toBeUndefined();
    });

    it('detects sandbox on Lightning domain', () => {
      const result = detectOrgType('acme--qa.sandbox.lightning.force.com');
      expect(result.orgType).toBe('sandbox');
    });
  });

  describe('trailhead/trailblaze detection', () => {
    it('detects trailblaze hostname', () => {
      const result = detectOrgType('myorg.trailblaze.my.salesforce.com');
      expect(result.orgType).toBe('trailhead');
      expect(result.myDomain).toBe('myorg');
    });

    it('detects trailblaze in any position', () => {
      const result = detectOrgType('trailblaze-something.salesforce.com');
      expect(result.orgType).toBe('trailhead');
    });
  });

  describe('developer edition detection', () => {
    it('detects -dev-ed hostname', () => {
      const result = detectOrgType('myorg-dev-ed.my.salesforce.com');
      expect(result.orgType).toBe('developer');
      expect(result.myDomain).toBe('myorg-dev-ed');
    });

    it('detects .develop. hostname', () => {
      const result = detectOrgType('myorg.develop.my.salesforce.com');
      expect(result.orgType).toBe('developer');
      expect(result.myDomain).toBe('myorg');
    });
  });

  describe('scratch org detection', () => {
    it('detects scratch org hostname', () => {
      const result = detectOrgType('speed-data-1234.scratch.my.salesforce.com');
      expect(result.orgType).toBe('scratch');
      expect(result.myDomain).toBe('speed-data-1234');
    });
  });

  describe('production detection (default)', () => {
    it('detects production for standard my.salesforce.com', () => {
      const result = detectOrgType('acme.my.salesforce.com');
      expect(result.orgType).toBe('production');
      expect(result.myDomain).toBe('acme');
    });

    it('detects production for lightning.force.com', () => {
      const result = detectOrgType('acme.lightning.force.com');
      expect(result.orgType).toBe('production');
      expect(result.myDomain).toBe('acme');
    });

    it('defaults to production for unknown patterns', () => {
      const result = detectOrgType('custom-domain.salesforce.com');
      expect(result.orgType).toBe('production');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = detectOrgType('');
      expect(result.orgType).toBe('production');
      expect(result.myDomain).toBe('');
    });

    it('handles single segment hostname', () => {
      const result = detectOrgType('localhost');
      expect(result.orgType).toBe('production');
      expect(result.myDomain).toBe('localhost');
    });
  });
});

// ─── buildInstanceUrl ───────────────────────────────────────────────────────

describe('buildInstanceUrl', () => {
  it('converts lightning.force.com to my.salesforce.com', () => {
    expect(buildInstanceUrl('acme.lightning.force.com'))
      .toBe('https://acme.my.salesforce.com');
  });

  it('converts sandbox lightning to sandbox salesforce', () => {
    expect(buildInstanceUrl('acme--qa.sandbox.lightning.force.com'))
      .toBe('https://acme--qa.sandbox.my.salesforce.com');
  });

  it('converts salesforce-setup.com to salesforce.com', () => {
    expect(buildInstanceUrl('acme.my.salesforce-setup.com'))
      .toBe('https://acme.my.salesforce.com');
  });

  it('converts trailblaze salesforce-setup.com', () => {
    expect(buildInstanceUrl('foo.trailblaze.my.salesforce-setup.com'))
      .toBe('https://foo.trailblaze.my.salesforce.com');
  });

  it('keeps my.salesforce.com hostname unchanged', () => {
    expect(buildInstanceUrl('acme.my.salesforce.com'))
      .toBe('https://acme.my.salesforce.com');
  });

  it('converts Experience Builder sandbox host to sandbox my.salesforce.com', () => {
    expect(buildInstanceUrl('acme--qa.sandbox.builder.salesforce-experience.com'))
      .toBe('https://acme--qa.sandbox.my.salesforce.com');
  });

  it('converts Experience Builder production host to my.salesforce.com', () => {
    expect(buildInstanceUrl('acme.builder.salesforce-experience.com'))
      .toBe('https://acme.my.salesforce.com');
  });

  it('adds https:// prefix', () => {
    expect(buildInstanceUrl('custom.salesforce.com'))
      .toBe('https://custom.salesforce.com');
  });
});

describe('org settings context helpers', () => {
  it('builds canonical org keys without sandbox collisions', () => {
    expect(getCanonicalOrgSettingsKey('acme.my.salesforce.com')).toBe('acme');
    expect(getCanonicalOrgSettingsKey('acme--qa.sandbox.lightning.force.com')).toBe('acme--qa');
  });

  it('builds fallback keys for current host, instance host, and legacy myDomain', () => {
    expect(getOrgSettingsFallbackKeys('acme--qa.sandbox.lightning.force.com', 'acme')).toEqual([
      'acme--qa.sandbox.lightning.force.com',
      'acme--qa.sandbox.my.salesforce.com',
      'acme',
    ]);
  });

  it('extracts Salesforce org context from a tab URL', () => {
    expect(getSalesforceOrgContextFromUrl(
      'https://acme--qa.sandbox.lightning.force.com/lightning/setup/ObjectManager/home',
    )).toEqual({
      hostname: 'acme--qa.sandbox.lightning.force.com',
      orgType: 'sandbox',
      myDomain: 'acme',
      orgSettingsKey: 'acme--qa',
      sandboxName: 'qa',
    });
  });

  it('extracts Experience Builder org context from a tab URL', () => {
    expect(getSalesforceOrgContextFromUrl(
      'https://acme--qa.sandbox.builder.salesforce-experience.com/sfsites/picasso/core/config/commeditor.jsp',
    )).toEqual({
      hostname: 'acme--qa.sandbox.builder.salesforce-experience.com',
      orgType: 'sandbox',
      myDomain: 'acme',
      orgSettingsKey: 'acme--qa',
      sandboxName: 'qa',
    });
  });

  it('returns null for non-Salesforce URLs', () => {
    expect(getSalesforceOrgContextFromUrl('https://example.com/path')).toBeNull();
  });
});

// ─── parseLightningUrl ──────────────────────────────────────────────────────

describe('parseLightningUrl', () => {
  describe('record pages', () => {
    it('parses standard record view URL', () => {
      const result = parseLightningUrl('/lightning/r/Account/001000000000001AAA/view');
      expect(result.pageType).toBe('record');
      expect(result.objectApiName).toBe('Account');
      expect(result.recordId).toBe('001000000000001AAA');
    });

    it('parses custom object record URL', () => {
      const result = parseLightningUrl('/lightning/r/My_Custom_Object__c/a00000000000001AAA/view');
      expect(result.pageType).toBe('record');
      expect(result.objectApiName).toBe('My_Custom_Object__c');
      expect(result.recordId).toBe('a00000000000001AAA');
    });

    it('parses 15-character record ID', () => {
      const result = parseLightningUrl('/lightning/r/Contact/003000000000001/view');
      expect(result.pageType).toBe('record');
      expect(result.recordId).toBe('003000000000001');
    });
  });

  describe('list pages', () => {
    it('parses object list URL', () => {
      const result = parseLightningUrl('/lightning/o/Account/list');
      expect(result.pageType).toBe('list');
      expect(result.objectApiName).toBe('Account');
    });

    it('parses object home URL', () => {
      const result = parseLightningUrl('/lightning/o/Opportunity/home');
      expect(result.pageType).toBe('list');
      expect(result.objectApiName).toBe('Opportunity');
    });

    it('parses pipeline inspection URL', () => {
      const result = parseLightningUrl('/lightning/o/Opportunity/pipelineInspection');
      expect(result.pageType).toBe('list');
      expect(result.objectApiName).toBe('Opportunity');
    });
  });

  describe('setup pages', () => {
    it('parses setup URL', () => {
      const result = parseLightningUrl('/lightning/setup/ObjectManager/home');
      expect(result.pageType).toBe('setup');
    });

    it('parses nested setup URL', () => {
      const result = parseLightningUrl('/lightning/setup/CustomPermissions/page');
      expect(result.pageType).toBe('setup');
    });

    it('parses classic setup paths', () => {
      const result = parseLightningUrl('/setup/forcecomHomepage.apexp');
      expect(result.pageType).toBe('setup');
    });

    it('parses classic setup query parameters on legacy pages', () => {
      const result = parseLightningUrl('/00e123456789012', '?setupid=EnhancedProfiles&isdtp=p1');
      expect(result.pageType).toBe('setup');
    });
  });

  describe('home page', () => {
    it('parses /lightning/page/home', () => {
      expect(parseLightningUrl('/lightning/page/home').pageType).toBe('home');
    });

    it('parses /lightning', () => {
      expect(parseLightningUrl('/lightning').pageType).toBe('home');
    });
  });

  describe('flow builder', () => {
    it('detects flow builder URL', () => {
      const result = parseLightningUrl('/builder_platform_interaction/flowBuilder.app?flowId=301xx');
      expect(result.pageType).toBe('flow-builder');
    });
  });

  describe('change set pages', () => {
    it('detects change set management URL', () => {
      expect(parseLightningUrl('/changemgmt/outboundChangeSet').pageType).toBe('change-set');
    });

    it('detects add-to-change-set URL', () => {
      expect(parseLightningUrl('/changemgmt/addToChangeSet').pageType).toBe('change-set');
    });
  });

  describe('other pages', () => {
    it('returns "other" for unrecognized paths', () => {
      expect(parseLightningUrl('/some/random/path').pageType).toBe('other');
    });

    it('returns "other" for root path', () => {
      expect(parseLightningUrl('/').pageType).toBe('other');
    });

    it('returns "other" for empty path', () => {
      expect(parseLightningUrl('').pageType).toBe('other');
    });
  });
});
