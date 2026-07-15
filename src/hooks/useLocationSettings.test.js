import { describe, expect, it } from "vitest";
import { normalizeLocationSettings } from "../lib/locationSettings";

describe("normalizeLocationSettings", () => {
  it("normalizes the legacy tax configuration", () => {
    expect(normalizeLocationSettings({
      enabled: true,
      rate: "8.25",
      name: "State Tax",
      includeInPrice: true,
    })).toMatchObject({
      tax_enabled: true,
      tax_rate: 8.25,
      tax_name: "State Tax",
      tax_included: true,
    });
  });

  it("keeps unsafe tax rates inside the valid range", () => {
    expect(normalizeLocationSettings({ tax_rate: 150 }).tax_rate).toBe(100);
    expect(normalizeLocationSettings({ tax_rate: -2 }).tax_rate).toBe(0);
  });
});
