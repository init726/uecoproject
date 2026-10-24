export type DatabaseError = { code?: string; message: string; details?: string; hint?: string };

// Fall back only for a named missing schema object. Network and permission errors stay visible.
export function isMissingSchema(error: DatabaseError | null, names: string[]) {
  if (!error || !["42703", "42P01", "PGRST204", "PGRST205", "PGRST202"].includes(error.code ?? "")) return false;
  const message = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  return names.some(name => message.includes(name));
}

export async function withSchemaFallback<T>(
  load: (extended: boolean) => PromiseLike<{ data: T | null; error: DatabaseError | null }>,
  names: string[],
) {
  const current = await load(true);
  if (!isMissingSchema(current.error, names)) return { ...current, extended: true };
  return { ...await load(false), extended: false };
}
