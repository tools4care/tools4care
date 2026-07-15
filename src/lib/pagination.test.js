import { describe, expect, it } from "vitest";
import { paginateRows } from "./pagination";

describe("report table pagination", () => {
  const rows = Array.from({ length: 201 }, (_, index) => index + 1);

  it("shows only the requested page and reports its visible range", () => {
    const result = paginateRows(rows, 2, 25);

    expect(result.rows).toEqual(Array.from({ length: 25 }, (_, index) => index + 26));
    expect(result).toMatchObject({ page: 2, totalPages: 9, from: 26, to: 50, total: 201 });
  });

  it("clamps pages when the filtered result becomes shorter", () => {
    const result = paginateRows(rows.slice(0, 12), 9, 25);

    expect(result.rows).toHaveLength(12);
    expect(result).toMatchObject({ page: 1, totalPages: 1, from: 1, to: 12 });
  });

  it("handles an empty or invalid input without an invalid range", () => {
    expect(paginateRows(null, -2, 0)).toMatchObject({
      rows: [], page: 1, pageSize: 25, total: 0, totalPages: 1, from: 0, to: 0,
    });
  });
});
