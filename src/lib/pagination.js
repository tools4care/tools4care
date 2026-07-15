export const REPORT_PAGE_SIZES = [25, 50, 100];

export function paginateRows(rows, requestedPage = 1, requestedPageSize = 25) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const parsedPageSize = Math.trunc(Number(requestedPageSize));
  const pageSize = parsedPageSize > 0 ? parsedPageSize : 25;
  const total = safeRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const parsedPage = Math.trunc(Number(requestedPage));
  const page = Math.min(Math.max(parsedPage || 1, 1), totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);

  return {
    rows: safeRows.slice(startIndex, endIndex),
    page,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : startIndex + 1,
    to: endIndex,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}
