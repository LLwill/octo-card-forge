import { issue, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject } from "./json.js";

export type ForgeRuntimeMode = "published" | "workspace";

export interface ForgeRuntimeCapabilitiesV1 {
  cardCatalog: boolean;
  componentCatalog: boolean;
  templateDataPreview: boolean;
  rawCardPreview: boolean;
  handoffDownload: boolean;
}

export interface ForgeRuntimeDescriptorV1 {
  schemaVersion: 1;
  mode: ForgeRuntimeMode;
  capabilities: ForgeRuntimeCapabilitiesV1;
}

const RUNTIME_KEYS = new Set(["schemaVersion", "mode", "capabilities"]);
const CAPABILITY_KEYS = new Set([
  "cardCatalog",
  "componentCatalog",
  "templateDataPreview",
  "rawCardPreview",
  "handoffDownload",
]);

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: DecodeIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(issue(
        "contract.unknown_property",
        `${path}/${escapePointer(key)}`,
        `unknown property ${key}`,
      ));
    }
  }
}

export function decodeForgeRuntimeDescriptorV1(
  input: unknown,
): DecodeResult<ForgeRuntimeDescriptorV1> {
  const issues: DecodeIssue[] = [];
  if (!isJsonObject(input)) {
    return {
      ok: false,
      issues: [issue("contract.root_type", "", "runtime descriptor must be a JSON object")],
    };
  }

  unknownKeys(input, RUNTIME_KEYS, "", issues);
  if (input.schemaVersion !== 1) {
    issues.push(issue(
      "contract.unsupported_version",
      "/schemaVersion",
      "only runtime descriptor schemaVersion 1 is supported",
    ));
  }
  if (input.mode !== "published" && input.mode !== "workspace") {
    issues.push(issue("contract.enum", "/mode", "mode must be published or workspace"));
  }

  const rawCapabilities = input.capabilities;
  let capabilities: ForgeRuntimeCapabilitiesV1 | undefined;
  if (!isJsonObject(rawCapabilities)) {
    issues.push(issue("contract.required", "/capabilities", "capabilities must be an object"));
  } else {
    unknownKeys(rawCapabilities, CAPABILITY_KEYS, "/capabilities", issues);
    for (const key of CAPABILITY_KEYS) {
      if (typeof rawCapabilities[key] !== "boolean") {
        issues.push(issue("contract.type", `/capabilities/${key}`, `${key} must be a boolean`));
      }
    }
    if ([...CAPABILITY_KEYS].every((key) => typeof rawCapabilities[key] === "boolean")) {
      capabilities = {
        cardCatalog: rawCapabilities.cardCatalog as boolean,
        componentCatalog: rawCapabilities.componentCatalog as boolean,
        templateDataPreview: rawCapabilities.templateDataPreview as boolean,
        rawCardPreview: rawCapabilities.rawCardPreview as boolean,
        handoffDownload: rawCapabilities.handoffDownload as boolean,
      };
    }
  }

  if (
    issues.length > 0 ||
    (input.mode !== "published" && input.mode !== "workspace") ||
    !capabilities
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    notices: [],
    value: {
      schemaVersion: 1,
      mode: input.mode,
      capabilities,
    },
  };
}
