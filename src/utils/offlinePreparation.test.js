import { describe, expect, it, vi } from "vitest";
import { fetchAllCustomersForOffline } from "./offlinePreparation";

function fakeDb(pages) {
  const range = vi.fn((from) => Promise.resolve({
    data: pages[from / 2] || [],
    error: null,
  }));
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range,
  };
  return {
    from: vi.fn(() => query),
    range,
  };
}

describe("offline customer preparation", () => {
  it("loads every page instead of stopping at Supabase's first 1000 rows", async () => {
    const db = fakeDb([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }, { id: 4 }],
      [{ id: 5 }],
    ]);

    const result = await fetchAllCustomersForOffline(db, {
      pageSize: 2,
      maxRows: 10,
    });

    expect(result.map((row) => row.id)).toEqual([1, 2, 3, 4, 5]);
    expect(db.range).toHaveBeenCalledTimes(3);
  });
});
