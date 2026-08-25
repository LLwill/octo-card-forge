import { decodeForgeRuntimeDescriptorV1, type ForgeRuntimeDescriptorV1 } from "@mlt-org/octo-card-spec";

export interface ForgeWebBootstrap {
  runtime?: unknown;
  snapshot?: unknown;
  artifacts?: Record<string, unknown>;
  snapshotUrl?: string;
  artifactBaseUrl?: string;
}

declare global {
  interface Window {
    __OCTO_BASE_PATH__?: string;
    __OCTO_FORGE_BOOTSTRAP__?: ForgeWebBootstrap;
  }
}

export function bootstrap(): ForgeWebBootstrap {
  return window.__OCTO_FORGE_BOOTSTRAP__ ?? {};
}

export function serverPath(pathname: string): string {
  return `${window.__OCTO_BASE_PATH__ ?? ""}${pathname}`;
}

export async function loadJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status} ${response.statusText || "Unknown"})`);
  return response.json() as Promise<T>;
}

export async function loadRuntimeDescriptor(): Promise<ForgeRuntimeDescriptorV1> {
  const input = bootstrap().runtime ?? await loadJson<unknown>(serverPath("/api/v1/runtime"));
  const decoded = decodeForgeRuntimeDescriptorV1(input);
  if (!decoded.ok) throw new Error(decoded.issues.map((issue) => issue.message).join("; "));
  return decoded.value;
}
