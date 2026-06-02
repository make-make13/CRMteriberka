export function getErrorMessage(error: unknown, fallback?: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback ?? String(error);
}

export function getErrorConflict(error: unknown): { contractId?: string; status?: string; number?: string } | undefined {
  if (error instanceof Error && (error as any).data?.conflict) {
    return (error as any).data.conflict;
  }
  return undefined;
}
