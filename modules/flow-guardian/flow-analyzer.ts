/**
 * Flow definition analysis for detecting common anti-patterns.
 *
 * The Flow Definition JSON structure (simplified):
 * {
 *   loops: [{ name, nextValueConnector: { targetReference }, noMoreValuesConnector: { targetReference } }],
 *   recordLookups: [{ name, connector: { targetReference }, faultConnector, ... }],
 *   recordUpdates: [{ name, connector: { targetReference }, ... }],
 *   recordCreates: [{ name, connector: { targetReference }, ... }],
 *   recordDeletes: [{ name, connector: { targetReference }, ... }],
 *   decisions: [{ name, ... }],
 *   assignments: [{ name, connector: { targetReference }, ... }],
 *   ...
 * }
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface FlowIssue {
  severity: IssueSeverity;
  elementName: string;
  elementType: string;
  message: string;
  detail: string;
}

interface FlowElement {
  name: string;
  connector?: { targetReference: string };
  faultConnector?: { targetReference: string };
  nextValueConnector?: { targetReference: string };
  noMoreValuesConnector?: { targetReference: string };
  defaultConnector?: { targetReference: string };
  filterLogic?: string;
  filters?: Array<{ field: string; operator: string; value?: { stringValue?: string; elementReference?: string } }>;
  [key: string]: any;
}

interface FlowDefinition {
  loops?: FlowElement[];
  recordLookups?: FlowElement[];
  recordUpdates?: FlowElement[];
  recordCreates?: FlowElement[];
  recordDeletes?: FlowElement[];
  decisions?: FlowElement[];
  assignments?: FlowElement[];
  screens?: FlowElement[];
  subflows?: FlowElement[];
  actionCalls?: FlowElement[];
  [key: string]: any;
}

/** Build a map of element name → element type for quick lookup */
function buildElementMap(definition: FlowDefinition): Map<string, string> {
  const map = new Map<string, string>();
  const types: Array<[string, string]> = [
    ['loops', 'Loop'],
    ['recordLookups', 'Get Records'],
    ['recordUpdates', 'Update Records'],
    ['recordCreates', 'Create Records'],
    ['recordDeletes', 'Delete Records'],
    ['decisions', 'Decision'],
    ['assignments', 'Assignment'],
    ['screens', 'Screen'],
    ['subflows', 'Subflow'],
    ['actionCalls', 'Action'],
  ];

  for (const [key, type] of types) {
    const elements = definition[key] as FlowElement[] | undefined;
    if (elements) {
      for (const el of elements) {
        if (el.name) map.set(el.name, type);
      }
    }
  }
  return map;
}

/** Get all elements reachable from a loop's nextValueConnector (the loop body) */
function getLoopBodyElements(
  definition: FlowDefinition,
  loop: FlowElement,
  elementMap: Map<string, string>
): Set<string> {
  const bodyElements = new Set<string>();
  const loopExitTarget = loop.noMoreValuesConnector?.targetReference;
  const startTarget = loop.nextValueConnector?.targetReference;

  if (!startTarget) return bodyElements;

  // BFS through the loop body
  const queue = [startTarget];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current) || current === loop.name) continue;
    // Stop if we reach the loop exit
    if (current === loopExitTarget) continue;
    visited.add(current);
    bodyElements.add(current);

    // Find the element and its connectors
    const allElements = getAllElements(definition);
    const el = allElements.find(e => e.name === current);
    if (!el) continue;

    // Follow all connectors
    const targets = getConnectorTargets(el);
    for (const target of targets) {
      if (!visited.has(target) && target !== loop.name) {
        queue.push(target);
      }
    }
  }

  return bodyElements;
}

/** Get all connector targets from an element */
function getConnectorTargets(el: FlowElement): string[] {
  const targets: string[] = [];
  if (el.connector?.targetReference) targets.push(el.connector.targetReference);
  if (el.faultConnector?.targetReference) targets.push(el.faultConnector.targetReference);
  if (el.nextValueConnector?.targetReference) targets.push(el.nextValueConnector.targetReference);
  if (el.noMoreValuesConnector?.targetReference) targets.push(el.noMoreValuesConnector.targetReference);
  if (el.defaultConnector?.targetReference) targets.push(el.defaultConnector.targetReference);

  // Decision rules have their own connectors
  if (el.rules) {
    for (const rule of el.rules) {
      if (rule.connector?.targetReference) targets.push(rule.connector.targetReference);
    }
  }

  return targets;
}

/** Get all flow elements as a flat array */
function getAllElements(definition: FlowDefinition): FlowElement[] {
  const elements: FlowElement[] = [];
  const keys = ['loops', 'recordLookups', 'recordUpdates', 'recordCreates', 'recordDeletes',
    'decisions', 'assignments', 'screens', 'subflows', 'actionCalls'];
  for (const key of keys) {
    const arr = definition[key] as FlowElement[] | undefined;
    if (arr) elements.push(...arr);
  }
  return elements;
}

// --- Detectors ---

/** Detect SOQL/DML operations inside loops */
function detectSoqlInLoop(definition: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const elementMap = buildElementMap(definition);
  const loops = definition.loops || [];
  const dmlTypes = ['Get Records', 'Update Records', 'Create Records', 'Delete Records'];

  for (const loop of loops) {
    const bodyElements = getLoopBodyElements(definition, loop, elementMap);

    for (const elName of Array.from(bodyElements)) {
      const elType = elementMap.get(elName);
      if (elType && dmlTypes.includes(elType)) {
        const severity = elType === 'Get Records' ? 'error' : 'error';
        issues.push({
          severity,
          elementName: elName,
          elementType: elType,
          message: `${elType} inside Loop "${loop.name}"`,
          detail: `This will cause "Too many SOQL queries: 101" or "Too many DML statements" error during bulk operations. Move ${elType.toLowerCase()} outside the loop and use a collection variable instead.`,
        });
      }
    }
  }

  return issues;
}

/** Detect Get Records without null check */
function detectMissingNullCheck(definition: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const elementMap = buildElementMap(definition);
  const recordLookups = definition.recordLookups || [];

  for (const lookup of recordLookups) {
    const nextTarget = lookup.connector?.targetReference;
    if (!nextTarget) continue;

    const nextType = elementMap.get(nextTarget);

    // If the next element is a Decision, that's likely a null check (OK)
    if (nextType === 'Decision') continue;

    // If there's a fault connector, that provides some error handling (OK)
    if (lookup.faultConnector?.targetReference) continue;

    issues.push({
      severity: 'warning',
      elementName: lookup.name,
      elementType: 'Get Records',
      message: `No null check after Get Records "${lookup.name}"`,
      detail: `The next element is "${nextTarget}" (${nextType || 'unknown'}). Add a Decision element to check if the record was found before using it, to prevent "Unhandled Fault" errors.`,
    });
  }

  return issues;
}

/** Detect hardcoded record IDs in filters */
function detectHardcodedIds(definition: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const idPattern = /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/;
  const recordLookups = definition.recordLookups || [];

  for (const lookup of recordLookups) {
    if (!lookup.filters) continue;
    for (const filter of lookup.filters) {
      const val = filter.value?.stringValue;
      if (val && idPattern.test(val)) {
        issues.push({
          severity: 'info',
          elementName: lookup.name,
          elementType: 'Get Records',
          message: `Hardcoded ID in Get Records "${lookup.name}"`,
          detail: `Filter on "${filter.field}" uses hardcoded ID "${val}". This will break in other environments (sandbox, production). Use a Custom Setting, Custom Metadata, or variable instead.`,
        });
      }
    }
  }

  return issues;
}

// --- Main Analysis ---

export function analyzeFlowDefinition(definition: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];

  issues.push(...detectSoqlInLoop(definition));
  issues.push(...detectMissingNullCheck(definition));
  issues.push(...detectHardcodedIds(definition));

  // Sort by severity: error > warning > info
  const severityOrder: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return issues;
}
