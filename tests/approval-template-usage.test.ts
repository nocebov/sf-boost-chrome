import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEmailTemplateApprovals } from '../entrypoints/background/approval-template-usage';

const INSTANCE = 'https://example.my.salesforce.com';
const TEMPLATE = '00X000000000123AAA';
const ID = '04a000000000123AAA';
function soap(body: string, status = 200) {
  return new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${body}</s:Body></s:Envelope>`, { status });
}
function list(names = ['Case.Test_case_ap']) {
  return soap(`<listMetadataResponse xmlns="http://soap.sforce.com/2006/04/metadata">${names.map(fullName => `<result><fullName>${fullName}</fullName><id>${ID}</id></result>`).join('')}</listMetadataResponse>`);
}
function metadata(fullName = 'Case.Test_case_ap', template = 'unfiled$public/SalesNewCustomerEmail', active = 'false') {
  return `<records><fullName>${fullName}</fullName><label>Test case ap</label><active>${active}</active><emailTemplate>${template}</emailTemplate></records>`;
}
function mockRequests(reads: () => Response, listed = () => list()) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/tooling/query/')) return Response.json({ records: [{ Id: TEMPLATE, FullName: 'unfiled$public/SalesNewCustomerEmail' }] });
    if (String(init?.body).includes('<listMetadata ')) return listed();
    return reads();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe('approval assignment template usage', () => {
  it.each(['true', 'false'])('finds assignment templates in active=%s processes using read-only SOAP', async active => {
    const fetchMock = mockRequests(() => soap(`<readMetadataResponse><result>${metadata(undefined, undefined, active)}</result></readMetadataResponse>`));
    expect(await getEmailTemplateApprovals(INSTANCE, 'session-secret', TEMPLATE)).toEqual({
      approvals: [{ id: ID, fullName: 'Case.Test_case_ap', label: 'Test case ap', active: active === 'true' }], notices: [],
    });
    const soapCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/services/Soap/'));
    expect(soapCalls).toHaveLength(2);
    expect(soapCalls.every(([, init]) => init?.method === 'POST')).toBe(true);
    expect(soapCalls.map(([, init]) => init?.body).join('')).not.toMatch(/<(?:create|update|delete|deploy)/);
  });

  it('does not confuse templates with the same name in different folders', async () => {
    mockRequests(() => soap(`<readMetadataResponse><result>${metadata(undefined, 'OtherFolder/SalesNewCustomerEmail')}</result></readMetadataResponse>`));
    expect((await getEmailTemplateApprovals(INSTANCE, 'secret', TEMPLATE)).approvals).toEqual([]);
  });

  it('returns an empty checked list for orgs without approval processes', async () => {
    const fetchMock = mockRequests(() => { throw new Error('unexpected read'); }, () => soap('<listMetadataResponse/>'));
    expect(await getEmailTemplateApprovals(INSTANCE, 'secret', TEMPLATE)).toEqual({ approvals: [], notices: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports missing or denied definitions as unchecked', async () => {
    mockRequests(() => soap('<readMetadataResponse><result><records xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/></result></readMetadataResponse>'));
    expect((await getEmailTemplateApprovals(INSTANCE, 'secret', TEMPLATE)).notices.join('')).toContain('1 Approval Process definition(s) could not be checked');
  });

  it('preserves successful batches when a later batch fails', async () => {
    let batch = 0;
    const names = Array.from({ length: 11 }, (_, index) => `Case.Process${index}`);
    const fetchMock = mockRequests(() => ++batch === 1
      ? soap(`<readMetadataResponse><result>${names.slice(0, 10).map(name => metadata(name)).join('')}</result></readMetadataResponse>`)
      : soap('<s:Fault><faultcode>DENIED</faultcode><faultstring>secret</faultstring></s:Fault>', 500), () => list(names));
    const result = await getEmailTemplateApprovals(INSTANCE, 'secret', TEMPLATE);
    expect(result.approvals).toHaveLength(10);
    expect(result.notices.join('')).toContain('1 Approval Process definition(s)');
    const reads = fetchMock.mock.calls.filter(([, init]) => String(init?.body).includes('<readMetadata '));
    expect(reads.map(([, init]) => String(init?.body).match(/<fullNames>/g)?.length)).toEqual([10, 1]);
    expect(result.notices.join('')).not.toContain('secret');
  });

  it('rejects invalid input before making requests', async () => {
    const fetchMock = mockRequests(() => soap(''));
    await expect(getEmailTemplateApprovals(INSTANCE, 'secret', "00X'bad")).rejects.toThrow('Invalid email template ID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed or entity-bearing metadata without exposing the body', async () => {
    mockRequests(() => soap(''), () => new Response('<!DOCTYPE x [<!ENTITY y "private">]><x/>'));
    await expect(getEmailTemplateApprovals(INSTANCE, 'secret', TEMPLATE)).rejects.toThrow('Invalid Approval Process metadata response');
  });
});
