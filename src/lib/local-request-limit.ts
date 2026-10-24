// Development-only compatibility while the durable DB limiter is not installed.
// Never used as a production fallback.
type Entry = { attempts: number; expires: number };
const state = globalThis as typeof globalThis & { schoolDevelopmentLimits?: Map<string, Entry> };
const limits = state.schoolDevelopmentLimits ??= new Map<string, Entry>();
export function reserveDevelopmentRequest(key: string, limit: number, seconds: number, now = Date.now()) {
  const existing = limits.get(key);
  if (!existing || existing.expires <= now) {
    for (const [id, value] of limits) if (value.expires <= now) limits.delete(id);
    if (limits.size >= 10000) return false;
    limits.set(key, { attempts: 1, expires: now + seconds * 1000 });
    return true;
  }
  existing.attempts++;
  return existing.attempts <= limit;
}
export function clearDevelopmentRequest(key: string) { limits.delete(key); }
