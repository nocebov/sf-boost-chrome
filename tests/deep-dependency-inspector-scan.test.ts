import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from '../lib/messaging';
import { scanDependencies } from '../modules/deep-dependency-inspector/scan';

vi.mock('../lib/messaging', () => ({ sendMessage: vi.fn() }));
const query = vi.mocked(sendMessage);
const instanceUrl = 'https://example.my.salesforce.com';
const templateId = '00X000000000123AAA';
const alert = { Id: '01W000000000123AAA', DeveloperName: 'Send_Welcome' };
const indexedAlert = {
  MetadataComponentId: alert.Id.slice(0, 15), MetadataComponentName: alert.DeveloperName,
  MetadataComponentType: 'WorkflowAlert', RefMetadataComponentId: templateId,
  RefMetadataComponentName: 'Welcome', RefMetadataComponentType: 'EmailTemplate',
};

describe('email template dependency scan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    query.mockResolvedValue({ approvals: [], notices: [] });
  });

  it('includes inactive approval processes even when the other sources find nothing', async () => {
    query.mockResolvedValueOnce({ records: [] });
    query.mockResolvedValueOnce({ records: [] });
    query.mockResolvedValueOnce({ approvals: [{ id: '04a000000000123AAA', fullName: 'Case.Test_case_ap', label: 'Test case ap', active: false }], notices: [] });
    const result = await scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'usedBy');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ MetadataComponentType: 'ApprovalProcess', MetadataComponentName: expect.stringContaining('Inactive') });
    expect(query).toHaveBeenNthCalledWith(3, 'getEmailTemplateApprovals', { instanceUrl, templateId });
  });

  it('combines indexed dependencies and direct alerts without duplicate 15/18-character IDs', async () => {
    query.mockResolvedValueOnce({ records: [indexedAlert], done: true });
    query.mockResolvedValueOnce({ records: [alert], done: true });
    const result = await scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'usedBy');
    expect(result.records).toHaveLength(1);
    expect(query).toHaveBeenNthCalledWith(2, 'executeToolingQuery', {
      instanceUrl, query: `SELECT Id, DeveloperName FROM WorkflowAlert WHERE TemplateId = '${templateId}'`,
    });
    expect(result.notices.join(' ')).toContain('No matches does not prove');
  });

  it('keeps direct alerts when the dependency index is unavailable', async () => {
    query.mockRejectedValueOnce(new Error('INVALID_TYPE'));
    query.mockResolvedValueOnce({ records: [alert] });
    const result = await scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'usedBy');
    expect(result.records[0]?.MetadataComponentName).toBe('Send_Welcome');
    expect(result.notices.join(' ')).toContain('Metadata dependency index could not be checked');
  });

  it('keeps indexed records when alert access is denied and reports the gap', async () => {
    query.mockResolvedValueOnce({ records: [indexedAlert] });
    query.mockRejectedValueOnce(new Error('INSUFFICIENT_ACCESS'));
    const result = await scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'usedBy');
    expect(result.records).toHaveLength(1);
    expect(result.notices.join(' ')).toContain('Email Alerts could not be checked');
  });

  it('treats total failure as an error, not an empty successful scan', async () => {
    query.mockRejectedValue(new Error('No session'));
    await expect(scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'usedBy')).rejects.toThrow('Could not check');
  });

  it('does not treat malformed API responses as checked empty sources', async () => {
    query.mockResolvedValue({});
    await expect(scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'usedBy')).rejects.toThrow('Could not check');
  });

  it('reports a pagination limit even if the background bridge sets done to true', async () => {
    query.mockResolvedValueOnce({ records: [indexedAlert], done: true, nextRecordsUrl: '/next' });
    query.mockResolvedValueOnce({ records: [] });
    const result = await scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'usedBy');
    expect(result.notices.join(' ')).toContain('reached the query limit');
  });

  it('does not query alerts for outgoing dependencies', async () => {
    query.mockResolvedValue({ records: [] });
    const result = await scanDependencies(instanceUrl, templateId, 'EmailTemplate', 'uses');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toMatchObject({ query: expect.stringContaining(`WHERE MetadataComponentId = '${templateId}'`) });
    expect(result.notices.join(' ')).toContain('merge fields are not scanned');
  });

  it('preserves the single indexed scan for other components', async () => {
    query.mockResolvedValue({ records: [] });
    expect(await scanDependencies(instanceUrl, '01p000000000123AAA', 'ApexClass', 'usedBy')).toEqual({ records: [], notices: [] });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
