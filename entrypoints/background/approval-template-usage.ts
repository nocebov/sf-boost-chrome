import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { escapeSoqlString, isValidSalesforceId } from '../../lib/salesforce-utils';
import { executeToolingQuery, fetchWithRetry } from './api-client';

const METADATA_NS = 'http://soap.sforce.com/2006/04/metadata';
const VERSION = '63.0';
const MAX_PROCESSES = 1000;
const BATCH_SIZE = 10; // readMetadata limit for ApprovalProcess
const CONCURRENCY = 3;

export interface ApprovalTemplateUsage {
  approvals: { id: string; fullName: string; label: string; active: boolean }[];
  notices: string[];
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  return value == null || value === '' ? [] : Array.isArray(value) ? value : [value];
}

/** Only fixed listMetadata/readMetadata operations are exposed; no mutation payloads. */
async function readApprovalMetadata(
  instanceUrl: string,
  sessionId: string,
  fullNames?: string[],
): Promise<any[]> {
  const operation = fullNames ? 'readMetadata' : 'listMetadata';
  const body = fullNames
    ? `<readMetadata xmlns="${METADATA_NS}"><type>ApprovalProcess</type>${fullNames.map(name => `<fullNames>${xmlEscape(name)}</fullNames>`).join('')}</readMetadata>`
    : `<listMetadata xmlns="${METADATA_NS}"><queries><type>ApprovalProcess</type></queries><asOfVersion>${VERSION}</asOfVersion></listMetadata>`;
  const response = await fetchWithRetry(`${instanceUrl}/services/Soap/m/${VERSION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: operation },
    body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header><SessionHeader xmlns="${METADATA_NS}"><sessionId>${xmlEscape(sessionId)}</sessionId></SessionHeader></soapenv:Header><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`,
  });
  const xml = await response.text();
  // No DTDs or custom entity expansion; never include a response body/session in errors.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('Invalid Approval Process metadata response');
  }
  const parsed = new XMLParser({ removeNSPrefix: true, parseTagValue: false }).parse(xml);
  const soapBody = parsed?.Envelope?.Body;
  if (!response.ok || soapBody?.Fault) {
    const authError = String(soapBody?.Fault?.faultcode ?? '').includes('INVALID_SESSION_ID');
    throw new Error(authError ? 'INVALID_SESSION_ID' : `Approval Process metadata read failed (${response.status}); check Metadata API access`);
  }
  if (!soapBody || !Object.hasOwn(soapBody, `${operation}Response`)) throw new Error('Missing Approval Process metadata response');
  const result = soapBody[`${operation}Response`];
  if (result === '') return [];
  if (!result || typeof result !== 'object') throw new Error('Invalid Approval Process metadata response');
  return fullNames ? asArray(result.result?.records) : asArray(result.result);
}

export async function getEmailTemplateApprovals(
  instanceUrl: string,
  sessionId: string,
  templateId: string,
): Promise<ApprovalTemplateUsage> {
  if (typeof templateId !== 'string' || !isValidSalesforceId(templateId) || !templateId.startsWith('00X')) {
    throw new Error('Invalid email template ID');
  }
  // Tooling FullName includes the folder/namespace, so equal template names in
  // different folders cannot be mistaken for the current template.
  const [template, listed] = await Promise.all([
    executeToolingQuery(instanceUrl, sessionId,
      `SELECT Id, FullName FROM EmailTemplate WHERE Id = '${escapeSoqlString(templateId)}' LIMIT 1`),
    readApprovalMetadata(instanceUrl, sessionId),
  ]);
  const templateFullName = template?.records?.[0]?.FullName;
  if (typeof templateFullName !== 'string' || !templateFullName) {
    throw new Error('Could not resolve the email template metadata name');
  }
  const notices: string[] = [];
  if (listed.length >= MAX_PROCESSES) notices.push('Approval Process listing reached 1,000 items; results may be incomplete.');
  const processes = listed.slice(0, MAX_PROCESSES);
  const byName = new Map<string, string>();
  for (const process of processes) {
    if (typeof process.fullName !== 'string' || !isValidSalesforceId(process.id)) {
      throw new Error('Invalid Approval Process listing');
    }
    byName.set(process.fullName, process.id);
  }
  const names = [...byName.keys()];
  const approvals: ApprovalTemplateUsage['approvals'] = [];
  let unchecked = 0;
  for (let offset = 0; offset < names.length; offset += BATCH_SIZE * CONCURRENCY) {
    const batches: string[][] = [];
    for (let i = offset; i < Math.min(offset + BATCH_SIZE * CONCURRENCY, names.length); i += BATCH_SIZE) {
      batches.push(names.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.allSettled(batches.map(batch => readApprovalMetadata(instanceUrl, sessionId, batch)));
    results.forEach((result, index) => {
      const requested = new Set(batches[index]!);
      if (result.status === 'fulfilled') {
        for (const process of result.value) {
          // A missing/nil record is not a checked process. Validate before counting.
          if (!requested.has(process.fullName) || !['true', 'false'].includes(process.active)) continue;
          requested.delete(process.fullName);
          if (process.emailTemplate === templateFullName) {
            approvals.push({ id: byName.get(process.fullName)!, fullName: process.fullName,
              label: typeof process.label === 'string' ? process.label : process.fullName,
              active: process.active === 'true' });
          }
        }
      }
      unchecked += requested.size;
    });
  }
  if (unchecked) notices.push(`${unchecked} Approval Process definition(s) could not be checked. Results are incomplete; check Metadata API access and refresh.`);
  return { approvals, notices };
}
