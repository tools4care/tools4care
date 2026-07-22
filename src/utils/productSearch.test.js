import { describe, expect, it } from "vitest";
import { isCodeLikeSearch } from "./productSearch";

describe("isCodeLikeSearch", () => {
  it("does not treat a brand/product name with one incidental digit as a barcode", () => {
    // Regression: "level 3" (a real brand) was compacted to "level3" and
    // misclassified as SKU-like, so the search only matched product codes
    // starting with "3" instead of the actual brand.
    expect(isCodeLikeSearch("level 3")).toBe(false);
    expect(isCodeLikeSearch("3D Blonde")).toBe(false);
    expect(isCodeLikeSearch("babyliss")).toBe(false);
  });

  it("still treats real barcodes and SKU-style codes as code-like", () => {
    expect(isCodeLikeSearch("038276009144")).toBe(true); // pure-digit barcode
    expect(isCodeLikeSearch("ABC123")).toBe(true); // half-digit SKU
    expect(isCodeLikeSearch("SL1500")).toBe(true);
  });

  it("ignores short or empty terms", () => {
    expect(isCodeLikeSearch("")).toBe(false);
    expect(isCodeLikeSearch("V05")).toBe(false);
  });
});
