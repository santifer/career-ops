import { describe, it, expect } from "vitest";
import { success, failure, assertProtocol } from "../envelope.js";
import { PROTOCOL_VERSION } from "../../contracts/envelope.js";
import type { BridgeError } from "../../contracts/envelope.js";

describe("envelope helpers", () => {
  it("success wraps result with protocol and ok:true", () => {
    const res = success("req-1", { value: 42 });
    expect(res.ok).toBe(true);
    expect(res.protocol).toBe(PROTOCOL_VERSION);
    expect(res.requestId).toBe("req-1");
    expect(res.result).toEqual({ value: 42 });
    expect(res.serverTimestamp).toBeTruthy();
  });

  it("failure wraps error with ok:false", () => {
    const err: BridgeError = { code: "BAD_REQUEST", message: "oops" };
    const res = failure("req-2", err);
    expect(res.ok).toBe(false);
    expect(res.error).toEqual(err);
    expect(res.requestId).toBe("req-2");
  });

  it("assertProtocol accepts matching major version", () => {
    expect(() => assertProtocol({
      protocol: PROTOCOL_VERSION,
      requestId: "x",
      clientTimestamp: "",
      payload: {},
    })).not.toThrow();
  });

  it("assertProtocol rejects different major version", () => {
    expect(() => assertProtocol({
      protocol: "2.0.0" as unknown as typeof PROTOCOL_VERSION,
      requestId: "x",
      clientTimestamp: "",
      payload: {},
    })).toThrow();
  });
});
