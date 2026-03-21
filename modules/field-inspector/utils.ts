export interface FieldInfo {
  apiName: string;
  label: string;
  type: string;
  required: boolean;
  custom: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  sortable: boolean;
  calculated: boolean;
  externalId: boolean;
  unique: boolean;
  encrypted: boolean;
  nillable: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  formula?: string;
  relationshipName?: string;
  referenceTo: string[];
  inlineHelpText?: string;
}

export interface FieldIndex {
  byExactLabel: Map<string, FieldInfo[]>;
  bySimplifiedLabel: Map<string, FieldInfo[]>;
  byApiName: Map<string, FieldInfo>;
}

interface DescribeFieldLike {
  label?: unknown;
  name?: unknown;
  type?: unknown;
  nillable?: unknown;
  defaultedOnCreate?: unknown;
  custom?: unknown;
  createable?: unknown;
  updateable?: unknown;
  filterable?: unknown;
  sortable?: unknown;
  calculated?: unknown;
  externalId?: unknown;
  unique?: unknown;
  encrypted?: unknown;
  length?: unknown;
  precision?: unknown;
  scale?: unknown;
  calculatedFormula?: unknown;
  relationshipName?: unknown;
  referenceTo?: unknown;
  inlineHelpText?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => entry !== undefined);
}

export function normalizeFieldLabelText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[*:\s]+/, '')
    .replace(/[*:\s]+$/, '')
    .trim()
    .toLowerCase();
}

export function simplifyNormalizedLabel(text: string): string {
  return text
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toFieldInfo(field: DescribeFieldLike): FieldInfo | null {
  const apiName = asString(field.name);
  const label = asString(field.label);
  const type = asString(field.type);

  if (!apiName || !label || !type) {
    return null;
  }

  return {
    apiName,
    label,
    type,
    required: !asBoolean(field.nillable) && !asBoolean(field.defaultedOnCreate),
    custom: asBoolean(field.custom),
    createable: asBoolean(field.createable),
    updateable: asBoolean(field.updateable),
    filterable: asBoolean(field.filterable),
    sortable: asBoolean(field.sortable),
    calculated: asBoolean(field.calculated),
    externalId: asBoolean(field.externalId),
    unique: asBoolean(field.unique),
    encrypted: asBoolean(field.encrypted),
    nillable: asBoolean(field.nillable),
    length: asNumber(field.length),
    precision: asNumber(field.precision),
    scale: asNumber(field.scale),
    formula: asString(field.calculatedFormula),
    relationshipName: asString(field.relationshipName),
    referenceTo: asStringArray(field.referenceTo),
    inlineHelpText: asString(field.inlineHelpText),
  };
}

export function buildFieldIndex(fields: unknown): FieldIndex {
  const byExactLabel = new Map<string, FieldInfo[]>();
  const bySimplifiedLabel = new Map<string, FieldInfo[]>();
  const byApiName = new Map<string, FieldInfo>();

  if (!Array.isArray(fields)) {
    return { byExactLabel, bySimplifiedLabel, byApiName };
  }

  for (const rawField of fields) {
    if (!rawField || typeof rawField !== 'object') continue;

    const fieldInfo = toFieldInfo(rawField as DescribeFieldLike);
    if (!fieldInfo) continue;

    const exactLabel = normalizeFieldLabelText(fieldInfo.label);
    const simplifiedLabel = simplifyNormalizedLabel(exactLabel);

    byExactLabel.set(exactLabel, [...(byExactLabel.get(exactLabel) ?? []), fieldInfo]);
    bySimplifiedLabel.set(simplifiedLabel, [...(bySimplifiedLabel.get(simplifiedLabel) ?? []), fieldInfo]);
    byApiName.set(fieldInfo.apiName.toLowerCase(), fieldInfo);
  }

  return { byExactLabel, bySimplifiedLabel, byApiName };
}

export function resolveFieldInfoByApiName(index: FieldIndex, rawApiName: string): FieldInfo | null {
  const normalized = rawApiName.trim().toLowerCase();
  if (!normalized) return null;

  return index.byApiName.get(normalized) ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractApiNameFromTargetSelection(attributeValue: string, objectApiName?: string): string | null {
  const normalized = attributeValue.trim();
  if (!normalized) return null;

  const recordFieldMatch = normalized.match(
    /(?:^|[:./_-])RecordField(?:[:./_-])([A-Za-z0-9_]+)(?:[:./_-])([A-Za-z0-9_]+)(?:$|[:./_-])/i,
  );
  if (recordFieldMatch) {
    const [, candidateObjectApiName, candidateFieldApiName] = recordFieldMatch;
    if (!candidateFieldApiName) return null;
    if (!objectApiName || candidateObjectApiName?.toLowerCase() === objectApiName.toLowerCase()) {
      return candidateFieldApiName;
    }
  }

  if (!objectApiName) {
    return null;
  }

  const objectScopedMatch = normalized.match(
    new RegExp(`(?:^|[:./_-])${escapeRegExp(objectApiName)}(?:[:./_-])([A-Za-z0-9_]+)(?:$|[:./_-])`, 'i'),
  );

  return objectScopedMatch?.[1] ?? null;
}

export function resolveFieldInfoFromAttributeValue(
  index: FieldIndex,
  attributeValue: string,
  objectApiName?: string,
): FieldInfo | null {
  const normalized = attributeValue.trim();
  if (!normalized) return null;

  const exactMatch = resolveFieldInfoByApiName(index, normalized);
  if (exactMatch) return exactMatch;

  const extractedApiName = extractApiNameFromTargetSelection(normalized, objectApiName);
  if (!extractedApiName) return null;

  return resolveFieldInfoByApiName(index, extractedApiName);
}

function pickUniqueMatch(candidates: FieldInfo[] | undefined): FieldInfo | null {
  if (!candidates || candidates.length !== 1) {
    return null;
  }

  return candidates[0] ?? null;
}

export function resolveFieldInfo(index: FieldIndex, rawLabelText: string): FieldInfo | null {
  const normalized = normalizeFieldLabelText(rawLabelText);
  if (!normalized) return null;

  const exactMatch = pickUniqueMatch(index.byExactLabel.get(normalized));
  if (exactMatch) return exactMatch;

  const simplified = simplifyNormalizedLabel(normalized);
  const simplifiedMatch = pickUniqueMatch(index.bySimplifiedLabel.get(simplified));
  if (simplifiedMatch) return simplifiedMatch;

  return resolveFieldInfoByApiName(index, normalized);
}

export function buildFieldSetupUrl(instanceUrl: string, objectApiName: string, fieldApiName: string): string {
  return `${instanceUrl}/lightning/setup/ObjectManager/${encodeURIComponent(objectApiName)}/FieldsAndRelationships/${encodeURIComponent(fieldApiName)}/view`;
}

export function buildSelectSnippet(objectApiName: string, fieldApiName: string): string {
  return `SELECT ${fieldApiName} FROM ${objectApiName}`;
}
