import { describe, expect, it } from 'vitest';
import {
  buildFieldIndex,
  buildFieldSetupUrl,
  buildSelectSnippet,
  normalizeFieldLabelText,
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
