import { describe, expect, it } from 'vitest';
import {
  buildFieldIndex,
  buildFieldSetupUrl,
  buildSelectSnippet,
  normalizeFieldLabelText,
  resolveFieldInfoByApiName,
  resolveFieldInfoFromAttributeValue,
  resolveFieldInfo,
} from '../modules/field-inspector/utils';

describe('field-inspector utils', () => {
  it('normalizes label text from Salesforce UI chrome', () => {
    expect(normalizeFieldLabelText('  Account Name *:  ')).toBe('account name');
  });

  it('resolves a field by exact label match', () => {
    const index = buildFieldIndex([
      {
        label: 'Account Name',
        name: 'Name',
        type: 'string',
        nillable: false,
        defaultedOnCreate: false,
      },
    ]);

    expect(resolveFieldInfo(index, 'Account Name')).toMatchObject({
      apiName: 'Name',
      required: true,
    });
  });

  it('resolves a field after stripping parenthetical suffixes', () => {
    const index = buildFieldIndex([
      {
        label: 'Parent Account',
        name: 'ParentId',
        type: 'reference',
        nillable: true,
        defaultedOnCreate: false,
      },
    ]);

    expect(resolveFieldInfo(index, 'Parent Account (Lookup)')).toMatchObject({
      apiName: 'ParentId',
    });
  });

  it('resolves a field by api name case-insensitively', () => {
    const index = buildFieldIndex([
      {
        label: 'Expected Revenue',
        name: 'ExpectedRevenue',
        type: 'currency',
        nillable: true,
        defaultedOnCreate: false,
      },
    ]);

    expect(resolveFieldInfoByApiName(index, 'expectedrevenue')).toMatchObject({
      apiName: 'ExpectedRevenue',
    });
  });

  it('resolves a field from a Lightning target-selection attribute', () => {
    const index = buildFieldIndex([
      {
        label: 'Primary Campaign Source',
        name: 'CampaignId',
        type: 'reference',
        nillable: true,
        defaultedOnCreate: false,
      },
    ]);

    expect(
      resolveFieldInfoFromAttributeValue(index, 'sfdc:RecordField.Opportunity.CampaignId', 'Opportunity'),
    ).toMatchObject({
      apiName: 'CampaignId',
    });
  });

  it('ignores dotted relationship paths that are not real field api names', () => {
    const index = buildFieldIndex([
      {
        label: 'Account Name',
        name: 'AccountId',
        type: 'reference',
        nillable: true,
        defaultedOnCreate: false,
      },
      {
        label: 'Opportunity Name',
        name: 'Name',
        type: 'string',
        nillable: false,
        defaultedOnCreate: false,
      },
    ]);

    expect(resolveFieldInfoFromAttributeValue(index, 'Account.Name', 'Opportunity')).toBeNull();
  });

  it('skips ambiguous labels instead of returning the wrong field', () => {
    const index = buildFieldIndex([
      {
        label: 'Status',
        name: 'Status__c',
        type: 'picklist',
        nillable: true,
        defaultedOnCreate: false,
      },
      {
        label: 'Status',
        name: 'Legacy_Status__c',
        type: 'picklist',
        nillable: true,
        defaultedOnCreate: false,
      },
    ]);

    expect(resolveFieldInfo(index, 'Status')).toBeNull();
  });

  it('builds copy helpers for setup and SOQL actions', () => {
    expect(buildSelectSnippet('Account', 'OwnerId')).toBe('SELECT OwnerId FROM Account');
    expect(buildFieldSetupUrl('https://acme.my.salesforce.com', 'Account', 'OwnerId')).toBe(
      'https://acme.my.salesforce.com/lightning/setup/ObjectManager/Account/FieldsAndRelationships/OwnerId/view',
    );
  });
});
