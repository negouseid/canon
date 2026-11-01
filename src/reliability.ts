import { readFileSync } from 'node:fs';
import { accessTokenIsExpired, getTokenInfo, refreshUserToken, type AccessToken } from '@twurple/auth';

export class ConfigurationError extends Error {}
export class DeadlineError extends Error {}
export async function deadline<T>(operation: Promise<T>, milliseconds = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError('External request timed out.')), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}
export function permanentFailure(error: unknown): boolean {
  const e = error as { statusCode?: number; code?: string; name?: string; constructor?: { name: string } };
  return error instanceof ConfigurationError || error instanceof SyntaxError ||
    [400, 401, 403, 404].includes(e?.statusCode || 0) ||
    ['InvalidTokenError', 'InvalidTokenTypeError', 'MissingScopeError'].includes(e?.constructor?.name || '') ||
    ['ENOENT', 'EACCES', 'EPERM', 'EROFS'].includes(e?.code || '');
}
export function readToken(path: string): AccessToken {
  const token = JSON.parse(readFileSync(path, 'utf8'));
  if (!token || typeof token.accessToken !== 'string' || !token.accessToken.trim() || typeof token.refreshToken !== 'string' || !token.refreshToken.trim() ||
    !Array.isArray(token.scope) || !token.scope.every((scope: unknown) => typeof scope === 'string') ||
    !Number.isFinite(token.obtainmentTimestamp) || token.obtainmentTimestamp < 0 ||
    (token.expiresIn !== null && (!Number.isFinite(token.expiresIn) || token.expiresIn < 0))) throw new ConfigurationError('Invalid saved token format.');
  return token;
}
export async function validateToken(token: AccessToken, clientId: string, secret: string, expected: string, scopes: string[],
  calls = { getTokenInfo, refreshUserToken }) {
  let valid = token;
  if (accessTokenIsExpired(valid)) valid = await deadline(calls.refreshUserToken(clientId, secret, valid.refreshToken!));
  let info;
  try { info = await deadline(calls.getTokenInfo(valid.accessToken, clientId)); }
  catch (error) {
    if ((error as Error)?.constructor?.name !== 'InvalidTokenError' && (error as { statusCode?: number })?.statusCode !== 401) throw error;
    valid = await deadline(calls.refreshUserToken(clientId, secret, valid.refreshToken!));
    info = await deadline(calls.getTokenInfo(valid.accessToken, clientId));
  }
  if (!info.userId || info.clientId !== clientId || info.userName?.toLowerCase() !== expected || !scopes.every(scope => info.scopes.includes(scope))) throw new ConfigurationError('Unexpected account or missing scopes.');
  return { token: valid, info };
}

/** One bounded exponential retry chain per task. No overlapping scheduled attempts. */
export function retryTask(task: () => Promise<void>, base = 2000, cap = 30_000) {
  let timer: ReturnType<typeof setTimeout> | undefined, attempt = 0, disposed = false;
  return {
    schedule() {
      if (disposed || timer) return;
      timer = setTimeout(() => { timer = undefined; void task().catch(() => {}); }, Math.min(cap, base * 2 ** Math.min(attempt++, 8)));
      timer.unref();
    },
    reset() { if (timer) clearTimeout(timer); timer = undefined; attempt = 0; },
    dispose() { disposed = true; if (timer) clearTimeout(timer); timer = undefined; }
  };
}
