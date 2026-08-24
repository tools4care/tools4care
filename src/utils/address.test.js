import { describe, expect, it } from "vitest";
import { canonicalAddress, serializeCanonicalAddress } from "./address";

describe("canonical client addresses", () => {
  it("normalizes objects into a stable four-field shape", () => {
    expect(canonicalAddress({
      calle: "  18   Main Street ", ciudad: " Lawrence ", estado: "ma", zip: " 01840 ",
    })).toEqual({ calle: "18 Main Street", ciudad: "Lawrence", estado: "MA", zip: "01840" });
  });

  it("keeps legacy free text without losing information", () => {
    expect(canonicalAddress("18 Main Street, Lawrence MA 01840")).toEqual({
      calle: "18 Main Street, Lawrence MA 01840", ciudad: "", estado: "", zip: "",
    });
  });

  it("serializes JSON consistently and stores an empty address as null", () => {
    expect(serializeCanonicalAddress({ calle: "18 Main", ciudad: "Lawrence", estado: "ma", zip: "01840" }))
      .toBe('{"calle":"18 Main","ciudad":"Lawrence","estado":"MA","zip":"01840"}');
    expect(serializeCanonicalAddress({})).toBeNull();
  });
});
