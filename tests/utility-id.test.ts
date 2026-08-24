import { describe, expect, it } from "vitest";
import {
  isUtilityId as isUtilityIdCore,
  parseUtilityId as parseUtilityIdCore,
} from "../packages/core/src/index.js";
import { isUtilityId, parseUtilityId } from "../src/utility-id.js";

describe("utility id parser", () => {
  it("keeps the legacy entrypoint as an exact Core alias", () => {
    expect(isUtilityId).toBe(isUtilityIdCore);
    expect(parseUtilityId).toBe(parseUtilityIdCore);
  });

  it("ignores non-utility ids", () => {
    expect(isUtilityId("normal-id")).toBe(false);
    expect(isUtilityId("octo-badge-warning-status")).toBe(false);
    expect(parseUtilityId("normal-id")).toBeUndefined();
    expect(parseUtilityId("octo-badge-warning-status")).toBeUndefined();
  });

  it("parses a single utility token and uid", () => {
    expect(parseUtilityId("octo--surface-subtle--uid-panel")).toEqual({
      ok: true,
      value: {
        namespace: "octo",
        tokens: ["surface-subtle"],
        uid: "panel",
      },
    });
  });

  it("parses multiple utility tokens without giving order semantic meaning", () => {
    expect(parseUtilityId("octo--surface-subtle--inset-md--uid-panel")).toEqual({
      ok: true,
      value: {
        namespace: "octo",
        tokens: ["surface-subtle", "inset-md"],
        uid: "panel",
      },
    });
    expect(parseUtilityId("octo--inset-md--surface-subtle--uid-panel")).toEqual({
      ok: true,
      value: {
        namespace: "octo",
        tokens: ["inset-md", "surface-subtle"],
        uid: "panel",
      },
    });
  });

  it("rejects ids without a uid segment", () => {
    expect(parseUtilityId("octo--surface-subtle")).toEqual(
      expect.objectContaining({ ok: false, code: "missing_uid" })
    );
  });

  it("rejects ids without utility tokens", () => {
    expect(parseUtilityId("octo----uid-panel")).toEqual(
      expect.objectContaining({ ok: false, code: "empty_tokens" })
    );
  });

  it("rejects invalid utility tokens", () => {
    expect(parseUtilityId("octo--surface_subtle--uid-panel")).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_token" })
    );
    expect(parseUtilityId("octo--Surface-subtle--uid-panel")).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_token" })
    );
    expect(parseUtilityId("octo--surface-subtle----uid-panel")).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_token" })
    );
  });

  it("rejects invalid utility uids", () => {
    expect(parseUtilityId("octo--surface-subtle--uid-")).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_uid" })
    );
    expect(parseUtilityId("octo--surface-subtle--uid-Panel")).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_uid" })
    );
    expect(parseUtilityId("octo--surface-subtle--uid-panel_extra")).toEqual(
      expect.objectContaining({ ok: false, code: "invalid_uid" })
    );
  });

  it("rejects duplicate utility tokens", () => {
    expect(parseUtilityId("octo--surface-subtle--surface-subtle--uid-panel")).toEqual(
      expect.objectContaining({ ok: false, code: "duplicate_token" })
    );
  });
});
