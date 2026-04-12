import { describe, it, expect } from "vitest";
import { bridgeError, httpStatusFor, toBridgeError } from "../errors.js";

describe("error helpers", () => {
  it("bridgeError creates well-formed error", () => {
    const err = bridgeError("BAD_REQUEST", "bad", { key: "val" });
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("bad");
    expect(err.detail).toEqual({ key: "val" });
  });

  it("bridgeError omits detail when undefined", () => {
    const err = bridgeError("INTERNAL", "fail");
    expect(err.detail).toBeUndefined();
  });

  it("httpStatusFor maps all codes", () => {
    expect(httpStatusFor("UNAUTHORIZED")).toBe(401);
    expect(httpStatusFor("BAD_REQUEST")).toBe(400);
    expect(httpStatusFor("NOT_FOUND")).toBe(404);
    expect(httpStatusFor("RATE_LIMITED")).toBe(429);
    expect(httpStatusFor("TIMEOUT")).toBe(504);
    expect(httpStatusFor("INTERNAL")).toBe(500);
    expect(httpStatusFor("BRIDGE_NOT_READY")).toBe(503);
    expect(httpStatusFor("REPO_LOCKED")).toBe(423);
    expect(httpStatusFor("EVAL_FAILED")).toBe(422);
    expect(httpStatusFor("PROTOCOL_MISMATCH")).toBe(426);
  });

  it("toBridgeError normalizes Error to INTERNAL", () => {
    const result = toBridgeError(new Error("uh oh"));
    expect(result.code).toBe("INTERNAL");
    expect(result.message).toBe("uh oh");
  });

  it("toBridgeError passes through BridgeError-shaped objects", () => {
    const input = { code: "BAD_REQUEST", message: "nope" };
    const result = toBridgeError(input);
    expect(result.code).toBe("BAD_REQUEST");
  });

  it("toBridgeError normalizes strings", () => {
    const result = toBridgeError("just a string");
    expect(result.code).toBe("INTERNAL");
    expect(result.message).toBe("just a string");
  });
});
