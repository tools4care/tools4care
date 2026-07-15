import { describe, expect, it } from "vitest";
import { hasLocationRestriction, restrictLocationsForUser } from "./locationAccess";

const locations = [
  { id: "van-a", nombre: "VAN A" },
  { id: "store", nombre: "Physical Store" },
  { id: "online", nombre: "Online Store" },
];

describe("location access", () => {
  it("keeps backward-compatible access when no assignments exist", () => {
    expect(restrictLocationsForUser(locations, [], "vendedor")).toEqual(locations);
    expect(hasLocationRestriction([], "vendedor")).toBe(false);
  });

  it("limits a user once assignments exist", () => {
    const assignments = [{ van_id: "store", activo: true }];
    expect(restrictLocationsForUser(locations, assignments, "vendedor")).toEqual([locations[1]]);
    expect(hasLocationRestriction(assignments, "vendedor")).toBe(true);
  });

  it("does not grant inactive assignments", () => {
    const assignments = [{ van_id: "store", activo: false }];
    expect(restrictLocationsForUser(locations, assignments, "supervisor")).toEqual([]);
  });

  it("always gives administrators all locations", () => {
    const assignments = [{ van_id: "store", activo: true }];
    expect(restrictLocationsForUser(locations, assignments, "admin")).toEqual(locations);
    expect(hasLocationRestriction(assignments, "admin")).toBe(false);
  });
});
