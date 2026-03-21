import { escapeSoqlString, isValidSalesforceId } from '../../lib/salesforce-utils';

export interface DependencyComponentCandidate {
  componentType: string;
  componentId?: string;
  objectToken?: string;
  componentName?: string;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractSalesforceIdFromAddress(value: string | null): string | null {
  if (!value) return null;

  const rawCandidate = value.match(/([a-zA-Z0-9]{15,18})/)?.[1];
  if (rawCandidate) return rawCandidate;

  try {
    return decodeURIComponent(value).match(/([a-zA-Z0-9]{15,18})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function buildIdBackedCandidate(
  componentType: string,
  rawComponentToken: string,
  objectToken?: string,
): DependencyComponentCandidate {
  const componentToken = decodePathSegment(rawComponentToken);

  if (isValidSalesforceId(componentToken)) {
    return {
      componentType,
      componentId: componentToken,
      objectToken: objectToken ? decodePathSegment(objectToken) : undefined,
    };
  }

  return {
    componentType,
    objectToken: objectToken ? decodePathSegment(objectToken) : undefined,
    componentName: componentToken,
  };
}

export function parseDependencyComponentCandidate(
  pathname: string,
  search: string,
): DependencyComponentCandidate | null {
  const fieldMatch = pathname.match(
    /^\/lightning\/setup\/ObjectManager\/([^/]+)\/FieldsAndRelationships\/([^/]+)\//,
  );
  if (fieldMatch?.[1] && fieldMatch[2]) {
    return buildIdBackedCandidate('CustomField', fieldMatch[2], fieldMatch[1]);
  }

  const validationMatch = pathname.match(
    /^\/lightning\/setup\/ObjectManager\/([^/]+)\/ValidationRules\/([^/]+)\//,
  );
  if (validationMatch?.[1] && validationMatch[2]) {
    return buildIdBackedCandidate('ValidationRule', validationMatch[2], validationMatch[1]);
  }

  if (pathname.includes('/lightning/setup/ApexClasses/')) {
    const classId = extractSalesforceIdFromAddress(new URLSearchParams(search).get('address'));
    if (classId) return { componentType: 'ApexClass', componentId: classId };
  }

  if (pathname.includes('/lightning/setup/ApexTriggers/')) {
    const triggerId = extractSalesforceIdFromAddress(new URLSearchParams(search).get('address'));
    if (triggerId) return { componentType: 'ApexTrigger', componentId: triggerId };
  }

  const flowMatch = pathname.match(/\/lightning\/setup\/Flows\/([a-zA-Z0-9]{15,18})\/view/);
  if (flowMatch?.[1]) {
    return { componentType: 'Flow', componentId: flowMatch[1] };
  }

  const flowBuilderMatch = pathname.match(/\/builder_platform_interaction\/([a-zA-Z0-9]{15,18})/);
  if (flowBuilderMatch?.[1]) {
    return { componentType: 'Flow', componentId: flowBuilderMatch[1] };
  }

  if (pathname.includes('/lightning/setup/LightningComponentBundles/')) {
    const lwcId = extractSalesforceIdFromAddress(new URLSearchParams(search).get('address'));
    if (lwcId) return { componentType: 'LightningComponentBundle', componentId: lwcId };
  }

  if (pathname.includes('/lightning/setup/AuraBundleDefinitions/')) {
    const auraId = extractSalesforceIdFromAddress(new URLSearchParams(search).get('address'));
    if (auraId) return { componentType: 'AuraDefinitionBundle', componentId: auraId };
  }

  return null;
}

export function buildEntityDefinitionLookupQuery(objectId: string): string {
  return `SELECT QualifiedApiName FROM EntityDefinition WHERE Id = '${escapeSoqlString(objectId)}' LIMIT 1`;
}

export function buildFieldDefinitionLookupQuery(objectApiName: string, fieldApiName: string): string {
  return `SELECT Id, DurableId FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${escapeSoqlString(objectApiName)}' AND QualifiedApiName = '${escapeSoqlString(fieldApiName)}' LIMIT 1`;
}

export function buildValidationRuleLookupQuery(objectApiName: string, validationName: string): string {
  return `SELECT Id FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${escapeSoqlString(objectApiName)}' AND ValidationName = '${escapeSoqlString(validationName)}' LIMIT 1`;
}

export function pickResolvedComponentId(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null;

  const maybeRecord = record as { Id?: unknown; DurableId?: unknown };
  if (typeof maybeRecord.Id === 'string' && maybeRecord.Id.trim()) {
    return maybeRecord.Id.trim();
  }
  if (typeof maybeRecord.DurableId === 'string' && maybeRecord.DurableId.trim()) {
    return maybeRecord.DurableId.trim();
  }

  return null;
}
