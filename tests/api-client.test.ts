import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const INSTANCE_URL = 'https://acme.my.salesforce.com';
const SESSION_ID = 'session-id';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlOf(call: unknown): string {
  return String((call as [RequestInfo])[0]);
}

function requestInitOf(call: unknown): RequestInit {
  return ((call as unknown[])[1] as RequestInit | undefined) ?? {};
}

describe('background API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not delete a manually managed active TraceFlag', async () => {
    const { toggleDebugLog } = await import('../entrypoints/background/api-client');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ identity: `${INSTANCE_URL}/id/00D000000000001/005000000000001` }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: '7tfManual00000001' }] }));

    const result = await toggleDebugLog(INSTANCE_URL, SESSION_ID, '7tfOwned000000001');

    expect(result).toEqual({ active: false, blockedByExistingLog: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
  });

  it('deletes only the exact TraceFlag ID recorded by SF Boost', async () => {
    const { toggleDebugLog } = await import('../entrypoints/background/api-client');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ identity: `${INSTANCE_URL}/id/00D000000000001/005000000000001` }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: '7tfOwned000000001' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await toggleDebugLog(INSTANCE_URL, SESSION_ID, '7tfOwned000000001');

    expect(result).toEqual({ active: false, removedOwnedTraceFlag: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlOf(fetchMock.mock.calls[2])).toContain('/tooling/sobjects/TraceFlag/7tfOwned000000001');
    expect(requestInitOf(fetchMock.mock.calls[2]).method).toBe('DELETE');
  });

  it('records the ID of a newly created SF Boost TraceFlag', async () => {
    const { toggleDebugLog } = await import('../entrypoints/background/api-client');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ identity: `${INSTANCE_URL}/id/00D000000000001/005000000000001` }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: '7dl000000000001' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: '7tfOwned000000001', success: true }, 201));

    const result = await toggleDebugLog(INSTANCE_URL, SESSION_ID);

    expect(result.active).toBe(true);
    expect(result.traceFlagId).toBe('7tfOwned000000001');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(urlOf(fetchMock.mock.calls[3])).toContain('/tooling/sobjects/TraceFlag');
    expect(requestInitOf(fetchMock.mock.calls[3]).method).toBe('POST');
  });

  it('keeps a partially created Permission Set and reports the failed permission', async () => {
    const { createPermissionSet } = await import('../entrypoints/background/api-client');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        fields: [{ name: 'SobjectType', picklistValues: [{ value: 'Account', active: true }] }],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: '0PS000000000001', success: true }, 201))
      .mockResolvedValueOnce(jsonResponse([{ message: 'Insufficient access rights on object id' }], 403));

    const result = await createPermissionSet(INSTANCE_URL, SESSION_ID, {
      name: 'Extracted_Profile',
      label: 'Extracted Profile',
      objectPermissions: [{
        object: 'Account',
        allowRead: true,
        allowCreate: false,
        allowEdit: false,
        allowDelete: false,
        viewAllRecords: false,
        modifyAllRecords: false,
      }],
      fieldPermissions: [],
      userPermissions: [],
      tabSettings: [],
      setupEntityAccess: [],
    });

    expect(result.success).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({ type: 'ObjectPermission', name: 'Account' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
