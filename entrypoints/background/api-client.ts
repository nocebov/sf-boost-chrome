import { getCachedDescribe, setCachedDescribe } from '../../lib/storage';

const API_VERSION = 'v62.0';

export async function describeObject(
  instanceUrl: string,
  sessionId: string,
  objectApiName: string
): Promise<any> {
  const cacheKey = `${instanceUrl}:${objectApiName}`;
  const cached = await getCachedDescribe(cacheKey);
  if (cached) return cached;

  const url = `${instanceUrl}/services/data/${API_VERSION}/sobjects/${objectApiName}/describe/`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Describe failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  await setCachedDescribe(cacheKey, data);
  return data;
}

export async function executeSOQL(
  instanceUrl: string,
  sessionId: string,
  query: string
): Promise<any> {
  const url = `${instanceUrl}/services/data/${API_VERSION}/query/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`SOQL query failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
