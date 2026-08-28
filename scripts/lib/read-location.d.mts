export const DEFAULT_DOWNLOAD_TIMEOUT_MS: number;
export const DEFAULT_DOWNLOAD_ATTEMPTS: number;

export interface CatalogDownloadOptions {
  allowedOrigins?: Set<string>;
  attempts?: number;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

export function catalogDownloadOptions(
  env?: Record<string, string | undefined>,
): { timeoutMs: number; attempts: number };

export function readLocation(
  location: string,
  maximumBytes: number,
  options?: CatalogDownloadOptions,
): Promise<Buffer>;
