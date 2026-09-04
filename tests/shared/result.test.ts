import { describe, expect, it } from "vitest";

import { DomainError } from "../../src/shared/errors.js";
import { commandFailure, commandSuccess } from "../../src/shared/result.js";

describe("command results", () => {
  it("returns stable domain error details without a stack", () => {
    const result = commandFailure(new DomainError("FORBIDDEN", "scope denied"));

    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "scope denied" },
    });
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("hides unexpected exception details", () => {
    expect(commandFailure(new Error("database password leaked"))).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "服务暂时不可用" },
    });
  });

  it("wraps successful data", () => {
    expect(commandSuccess({ id: "family-1" })).toEqual({
      ok: true,
      data: { id: "family-1" },
    });
  });
});
