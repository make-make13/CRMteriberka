export function getPageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(1, page), pageCount);
}

export function getPageItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = clampPage(page, getPageCount(items.length, pageSize));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
