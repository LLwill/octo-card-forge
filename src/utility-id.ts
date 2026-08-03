export interface ParsedUtilityId {
  namespace: "octo";
  tokens: string[];
  uid: string;
}

export type UtilityIdParseResult =
  | { ok: true; value: ParsedUtilityId }
  | { ok: false; code: UtilityIdParseErrorCode; message: string };

export type UtilityIdParseErrorCode =
  | "missing_uid"
  | "empty_tokens"
  | "invalid_token"
  | "invalid_uid"
  | "duplicate_token";

const UTILITY_ID_PREFIX = "octo--";
const UID_DELIMITER = "--uid-";
const TOKEN_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function invalid(
  code: UtilityIdParseErrorCode,
  message: string
): UtilityIdParseResult {
  return { ok: false, code, message };
}

export function isUtilityId(id: string): boolean {
  return id.startsWith(UTILITY_ID_PREFIX);
}

export function parseUtilityId(id: string): UtilityIdParseResult | undefined {
  if (!isUtilityId(id)) return undefined;

  const uidDelimiterIndex = id.indexOf(UID_DELIMITER, UTILITY_ID_PREFIX.length);
  if (uidDelimiterIndex < 0) {
    return invalid("missing_uid", "Utility id must end with --uid-<unique-name>");
  }

  const tokenPart = id.slice(UTILITY_ID_PREFIX.length, uidDelimiterIndex);
  const uid = id.slice(uidDelimiterIndex + UID_DELIMITER.length);
  if (!tokenPart) {
    return invalid("empty_tokens", "Utility id must include at least one token");
  }
  if (!TOKEN_PATTERN.test(uid)) {
    return invalid("invalid_uid", `Invalid utility uid: ${uid || "<empty>"}`);
  }

  const tokens = tokenPart.split("--");
  const seen = new Set<string>();
  for (const token of tokens) {
    if (!TOKEN_PATTERN.test(token)) {
      return invalid("invalid_token", `Invalid utility token: ${token || "<empty>"}`);
    }
    if (seen.has(token)) {
      return invalid("duplicate_token", `Duplicate utility token: ${token}`);
    }
    seen.add(token);
  }

  return {
    ok: true,
    value: {
      namespace: "octo",
      tokens,
      uid,
    },
  };
}
