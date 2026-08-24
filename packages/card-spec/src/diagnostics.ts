import type { JsonObject } from "./json.js";

export type DecodeIssueCode =
  | "contract.root_type"
  | "contract.required"
  | "contract.type"
  | "contract.enum"
  | "contract.pattern"
  | "contract.unknown_property"
  | "contract.unsupported_version"
  | "contract.duplicate"
  | "contract.invariant";

export interface DecodeIssue {
  code: DecodeIssueCode;
  /** RFC 6901 JSON Pointer. */
  path: string;
  message: string;
  details?: JsonObject;
}

export type DecodeResult<T> =
  | { ok: true; value: T; notices: DecodeIssue[] }
  | { ok: false; issues: DecodeIssue[] };

export class ContractDecodeError extends Error {
  readonly issues: DecodeIssue[];

  constructor(contract: string, issues: DecodeIssue[]) {
    super(`${contract} decode failed: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "ContractDecodeError";
    this.issues = issues;
  }
}

export function parseOrThrow<T>(contract: string, result: DecodeResult<T>): T {
  if (!result.ok) throw new ContractDecodeError(contract, result.issues);
  return result.value;
}

export function issue(
  code: DecodeIssueCode,
  path: string,
  message: string,
  details?: JsonObject
): DecodeIssue {
  return details ? { code, path, message, details } : { code, path, message };
}
