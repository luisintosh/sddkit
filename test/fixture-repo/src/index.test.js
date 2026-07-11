import { describe, it, expect } from "vitest";
import { main } from "./index.js";

describe("fixture-repo smoke test", () => {
  it("main is a function", () => {
    expect(typeof main).toBe("function");
  });
});
