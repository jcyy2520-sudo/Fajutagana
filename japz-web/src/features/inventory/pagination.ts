import { useState } from "react";
export function usePagination<T>(rows: T[], resetKey: string, size = 12) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  const page = state.key === resetKey ? state.page : 1;
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    current = Math.min(page, pages);
  return {
    rows: rows.slice((current - 1) * size, current * size),
    total: rows.length,
    size,
    current,
    pages,
    setPage: (page: number) => setState({ page, key: resetKey }),
  };
}
