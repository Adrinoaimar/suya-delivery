function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return;
  }
}

export function isSafeSupabasePublishableKey(key) {
  if (!key || /REPLACE_ME/i.test(key)) return false;
  if (key.startsWith('sb_publishable_')) return key.length >= 30;
  if (!key.startsWith('eyJ')) return false;

  const payload = decodeJwtPayload(key);
  return payload?.role === 'anon';
}
