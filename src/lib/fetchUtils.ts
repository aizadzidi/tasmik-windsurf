export const parseJsonSafe = async (response: Response) => {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return await response.json();
  }
  const text = await response.text();
  throw new Error(text || `Non-JSON response (status ${response.status})`);
};

