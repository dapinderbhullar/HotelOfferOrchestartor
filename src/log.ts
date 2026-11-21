export function log(level: 'info' | 'error', event: string, context: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context }));
}

export function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
