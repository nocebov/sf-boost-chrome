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
