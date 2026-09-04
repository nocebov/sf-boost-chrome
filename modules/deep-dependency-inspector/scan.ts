import { sendMessage } from '../../lib/messaging';
import { escapeSoqlString } from '../../lib/salesforce-utils';

export interface DependencyRecord {
  MetadataComponentId: string;
  MetadataComponentName: string;
  MetadataComponentType: string;
  RefMetadataComponentId: string;
  RefMetadataComponentName: string;
  RefMetadataComponentType: string;
}

export type ScanDirection = 'usedBy' | 'uses';

export interface ScanResult {
  records: DependencyRecord[];
  notices: string[];
}

export async function scanDependencies(
  instanceUrl: string,
  componentId: string,
  componentType: string,
  direction: ScanDirection,
): Promise<ScanResult> {
  const safeId = escapeSoqlString(componentId);
  const whereClause = direction === 'usedBy'
    ? `RefMetadataComponentId = '${safeId}'`
    : `MetadataComponentId = '${safeId}'`;
  const sources = [{
    name: 'Metadata dependency index',
    query: `SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType, RefMetadataComponentId, RefMetadataComponentName, RefMetadataComponentType FROM MetadataComponentDependency WHERE ${whereClause}`,
    map: (record: any): DependencyRecord => record,
  }];
  const isTemplate = componentType === 'EmailTemplate';
  if (isTemplate && direction === 'usedBy') {
    sources.push({
      name: 'Email Alerts',
      query: `SELECT Id, DeveloperName FROM WorkflowAlert WHERE TemplateId = '${safeId}'`,
      map: (record: any): DependencyRecord => ({
        MetadataComponentId: record.Id,
        MetadataComponentName: record.DeveloperName,
        MetadataComponentType: 'WorkflowAlert',
        RefMetadataComponentId: componentId,
        RefMetadataComponentName: componentId,
        RefMetadataComponentType: 'EmailTemplate',
      }),
    });
  }

  const scans: { name: string; run: () => Promise<ScanResult & { truncated?: boolean }> }[] = sources.map(source => ({
    name: source.name,
    run: async () => {
      const response = await sendMessage('executeToolingQuery', { instanceUrl, query: source.query });
      if (!Array.isArray(response?.records)) throw new Error('Invalid query response');
      return {
        records: response.records.map(source.map) as DependencyRecord[],
        notices: [],
        truncated: Boolean(response.nextRecordsUrl) || response.done === false || response.totalSize > response.records.length,
      };
    },
  }));
  if (isTemplate && direction === 'usedBy') {
    scans.push({ name: 'Approval Processes', run: async () => {
      const result = await sendMessage('getEmailTemplateApprovals', { instanceUrl, templateId: componentId });
      if (!Array.isArray(result?.approvals) || !Array.isArray(result?.notices)) throw new Error('Invalid approval response');
      return { notices: result.notices, records: result.approvals.map(process => ({
        MetadataComponentId: process.id,
        MetadataComponentName: `${process.fullName} — ${process.label} (${process.active ? 'Active' : 'Inactive'})`,
        MetadataComponentType: 'ApprovalProcess',
        RefMetadataComponentId: componentId,
        RefMetadataComponentName: componentId,
        RefMetadataComponentType: 'EmailTemplate',
      })) };
    } });
  }
  const results = await Promise.allSettled(scans.map(source => source.run()));
  const notices: string[] = isTemplate ? [direction === 'usedBy'
    ? 'Coverage: direct Email Alerts, approval assignment email templates in active and inactive Classic Approval Processes, and references returned by Salesforce’s metadata dependency index. Dynamic Apex references, manual email use, Flow Approval Processes, and indirect uses through alerts are not fully covered. No matches does not prove the template is unused.'
    : 'Coverage: references returned by Salesforce’s metadata dependency index. Template content and merge fields are not scanned.'] : [];
  const records = new Map<string, DependencyRecord>();
  let succeeded = 0;
  results.forEach((result, index) => {
    const sourceName = scans[index]!.name;
    if (result.status === 'rejected') {
      notices.push(`${sourceName} could not be checked. Results are incomplete; check API access and retry.`);
      return;
    }
    succeeded++;
    notices.push(...result.value.notices);
    if (result.value.truncated) notices.push(`${sourceName} reached the query limit. Results are incomplete.`);
    for (const record of result.value.records) {
      // Salesforce may return the same ID as 15 or 18 characters across sources.
      const key = `${record.MetadataComponentType}:${record.MetadataComponentId?.slice(0, 15)}:${record.RefMetadataComponentType}:${record.RefMetadataComponentId?.slice(0, 15)}`;
      if (!records.has(key)) records.set(key, record);
    }
  });
  if (!succeeded) throw new Error('Could not check dependencies. Check Salesforce API access and retry.');
  return { records: [...records.values()], notices };
}
