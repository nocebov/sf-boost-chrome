import { describe, expect, it, vi } from 'vitest';
import { extractProfileIdFromUrl, isProfileId } from '../modules/profile-to-permset/profile-page';

vi.mock('../lib/messaging', () => ({ sendMessage: vi.fn() }));
import { sendMessage } from '../lib/messaging';
import { readProfilePermissions } from '../modules/profile-to-permset/permission-reader';

const origin = 'https://acme.my.salesforce.com';
const profile = '00e000000000001';
const approval = '04a000000000001';

describe('Profile detail route allowlist', () => {
  it.each([
    `/${profile}`, `/${profile}/`, `/${profile}/view`, `/${profile}AAA`,
    `/${profile}?setupid=EnhancedProfiles&isdtp=p1`,
    `/lightning/setup/Profiles/page?address=/${profile}`,
    `/lightning/setup/EnhancedProfiles/page?address=%2F${profile}%3Fisdtp%3Dp1`,
    `/lightning/setup/EnhancedProfiles/page?address=%2F${profile}AAA`,
  ])('accepts an exact profile detail URL: %s', (path) => {
    expect(extractProfileIdFromUrl(origin + path)?.slice(0, 15)).toBe(profile);
  });

  it.each([
    `/lightning/setup/ApprovalProcesses/page?address=%2F${approval}`,
    `/lightning/setup/ApprovalProcesses/page?address=%2F${profile}`,
    `/lightning/setup/ApprovalProcesses/page?address=%2F${approval}%3FretURL%3D%2F${profile}`,
    `/lightning/setup/PermSets/page?address=%2F${profile}`,
    `/lightning/setup/EnhancedPermSets/page?address=%2F${profile}`,
    `/lightning/setup/Users/page?address=%2F${profile}`,
    `/lightning/setup/Profiles/home?address=%2F${profile}`,
    `/lightning/setup/EnhancedProfiles/page`,
    `/lightning/setup/Profiles/page?address=%2F${approval}`,
    `/lightning/setup/Profiles/page?address=%2F0PS000000000001`,
    `/lightning/setup/Profiles/page?address=%2F${profile}A`,
    `/lightning/setup/Profiles/page?address=%2F${profile}AA`,
    `/lightning/setup/Profiles/page?address=%2F${profile}AAAA`,
    `/lightning/setup/Profiles/page?address=%2F${profile}%2Fe`,
    `/lightning/setup/Profiles/page?address=%252F${profile}`,
    `/lightning/setup/Profiles/page?address=//elsewhere.example/${profile}`,
    `/lightning/setup/Profiles/page?address=https://elsewhere.example/${profile}`,
    `/lightning/setup/Profiles/page?address=%2F${profile}&address=%2F${profile}`,
    `/lightning/setup/Profiles/page?retURL=%3Faddress%3D%2F${profile}`,
    `/lightning/setup/Profiles/page?address=%E0%A4%A`,
    `/${profile}A`, `/${profile}AA`, `/${profile}AAAA`, `/${profile}/e`,
    `/${approval}?retURL=/${profile}`, `/somewhere/${profile}`,
    `/lightning/r/Account/${profile}/view`, `/00E000000000001`,
  ])('rejects unrelated, ambiguous or malformed URLs: %s', (path) => {
    expect(extractProfileIdFromUrl(origin + path)).toBeNull();
  });

  it('fails closed for invalid URLs without throwing', () => {
    for (const value of ['', '%', 'not a URL', `javascript:/${profile}`]) {
      expect(extractProfileIdFromUrl(value)).toBeNull();
    }
  });
});

describe('Profile read boundary', () => {
  it.each([approval, '0PS000000000001', `${profile}A`, `${profile}AA`, `${profile}AAAA`, 'bad'])
  ('rejects a non-profile ID before any API call: %s', async (id) => {
    vi.mocked(sendMessage).mockClear();
    expect(isProfileId(id)).toBe(false);
    await expect(readProfilePermissions(origin, id)).rejects.toThrow();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each([profile, `${profile}AAA`])('queries a valid profile ID: %s', async (id) => {
    vi.mocked(sendMessage).mockClear().mockResolvedValueOnce({ records: [] });
    expect(isProfileId(id)).toBe(true);
    await expect(readProfilePermissions(origin, id)).rejects.toThrow('Could not find PermissionSet');
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('executeSOQLAll', {
      instanceUrl: origin,
      query: `SELECT Id, Profile.Name FROM PermissionSet WHERE ProfileId = '${id}' LIMIT 1`,
    });
  });
});
