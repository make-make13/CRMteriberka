/**
 * Общий хелпер извлечения текста ошибки для серверного слоя.
 * Раньше идиома `error instanceof Error ? error.message : String(error)`
 * дублировалась в server.ts и серверных модулях — теперь единое место.
 */
export function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
