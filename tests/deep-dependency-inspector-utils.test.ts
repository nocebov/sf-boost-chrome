import { describe, expect, it } from 'vitest';
import {
  buildEntityDefinitionLookupQuery,
  buildFieldDefinitionLookupQuery,
  buildValidationRuleLookupQuery,
  parseDependencyComponentCandidate,
  pickResolvedComponentId,
} from '../modules/deep-dependency-inspector/utils';

describe('deep-dependency-inspector utils', () => {
  describe('parseDependencyComponentCandidate', () => {
    it.each([
      ['/00X000000000123', ''],
      ['/00X000000000123AAA', '?setupid=CommunicationTemplatesEmail'],
      ['/email/author/emailtemplate.jsp', '?id=00X000000000123AAA'],
      ['/lightning/setup/CommunicationTemplatesEmail/page', '?address=%2F00X000000000123AAA'],
      ['/lightning/setup/CommunicationTemplatesEmail/home', '?address=%2Femail%2Fauthor%2Femailtemplate.jsp%3Fid%3D00X000000000123AAA'],
    ])('recognizes the current Classic email template at %s', (path, search) => {
      const result = parseDependencyComponentCandidate(path, search);
      expect(result?.componentType).toBe('EmailTemplate');
      expect(result?.componentId?.slice(0, 15)).toBe('00X000000000123');
    });

    it.each([
      ['/lightning/setup/CommunicationTemplatesEmail/home', ''],
      ['/lightning/setup/CommunicationTemplatesEmail/page', '?address=%2F00X'],
      ['/lightning/setup/CommunicationTemplatesEmail/page', '?address=%2F00X%3FretURL%3D%2F00X000000000123AAA'],
      ['/lightning/setup/CommunicationTemplatesEmail/page', '?address=https%3A%2F%2Fexample.com%2F00X000000000123AAA'],
      ['/lightning/setup/CommunicationTemplatesEmail/page', '?address=%2F%2Fexample.com%2F00X000000000123AAA'],
      ['/email/author/emailtemplate.jsp', '?id=001000000000123AAA&retURL=%2F00X000000000123AAA'],
      ['/email/author/emailtemplate.jsp', '?id=00X000000000123AB'],
      ['/00X000000000123AAA/edit', ''],
      ['/unrelated', '?id=00X000000000123AAA'],
    ])('does not mistake list, return, edit or unrelated URLs for a template: %s %s', (path, search) => {
      expect(parseDependencyComponentCandidate(path, search)).toBeNull();
    });

    it('treats field api-name URLs as resolvable custom-field candidates', () => {
      expect(
        parseDependencyComponentCandidate(
          '/lightning/setup/ObjectManager/Opportunity/FieldsAndRelationships/ForecastCategoryName/view',
          '',
        ),
      ).toEqual({
        componentType: 'CustomField',
        objectToken: 'Opportunity',
        componentName: 'ForecastCategoryName',
      });
    });

    it('keeps explicit metadata ids for custom-field URLs', () => {
      expect(
        parseDependencyComponentCandidate(
          '/lightning/setup/ObjectManager/Opportunity/FieldsAndRelationships/00N000000000123AAA/view',
          '',
        ),
      ).toEqual({
        componentType: 'CustomField',
        componentId: '00N000000000123AAA',
        objectToken: 'Opportunity',
      });
    });

    it('treats validation-rule slugs as resolvable candidates', () => {
      expect(
        parseDependencyComponentCandidate(
          '/lightning/setup/ObjectManager/Case/ValidationRules/Prevent_Close_Without_Reason/view',
          '',
        ),
      ).toEqual({
        componentType: 'ValidationRule',
        objectToken: 'Case',
        componentName: 'Prevent_Close_Without_Reason',
      });
    });

    it('extracts apex class ids from the address parameter', () => {
      expect(
        parseDependencyComponentCandidate(
          '/lightning/setup/ApexClasses/page',
          '?address=%2F01p000000000123AAA',
        ),
      ).toEqual({
        componentType: 'ApexClass',
        componentId: '01p000000000123AAA',
      });
    });
  });

  describe('query builders', () => {
    it('builds field-definition lookup queries', () => {
      expect(buildFieldDefinitionLookupQuery('Opportunity', 'ForecastCategoryName')).toBe(
        "SELECT Id, DurableId FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND QualifiedApiName = 'ForecastCategoryName' LIMIT 1",
      );
    });

    it('builds validation-rule lookup queries', () => {
      expect(buildValidationRuleLookupQuery('Case', 'Prevent_Close_Without_Reason')).toBe(
        "SELECT Id FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Case' AND ValidationName = 'Prevent_Close_Without_Reason' LIMIT 1",
      );
    });

    it('escapes single quotes in lookup queries', () => {
      expect(buildEntityDefinitionLookupQuery("01I'bad")).toBe(
        "SELECT QualifiedApiName FROM EntityDefinition WHERE Id = '01I\\'bad' LIMIT 1",
      );
    });
  });

  describe('pickResolvedComponentId', () => {
    it('prefers the record id when present', () => {
      expect(
        pickResolvedComponentId({ Id: '00N000000000123AAA', DurableId: 'Opportunity.ForecastCategoryName' }),
      ).toBe('00N000000000123AAA');
    });

    it('falls back to durable id when no record id is present', () => {
      expect(
        pickResolvedComponentId({ DurableId: 'Opportunity.ForecastCategoryName' }),
      ).toBe('Opportunity.ForecastCategoryName');
    });

    it('returns null for non-object inputs', () => {
      expect(pickResolvedComponentId(null)).toBeNull();
    });
  });
});
