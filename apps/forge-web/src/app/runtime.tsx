import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { ForgeRuntimeDescriptorV1 } from "@mlt-org/octo-card-spec";
import { loadRuntimeDescriptor } from "../data/client.js";

interface RuntimeState {
  runtime?: ForgeRuntimeDescriptorV1;
  loading: boolean;
  error?: string;
  reload(): void;
}

const RuntimeContext = createContext<RuntimeState | undefined>(undefined);

export function RuntimeProvider({ children }: PropsWithChildren) {
  const [revision, setRevision] = useState(0);
  const [runtime, setRuntime] = useState<ForgeRuntimeDescriptorV1>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void loadRuntimeDescriptor()
      .then((value) => { if (active) setRuntime(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const value = useMemo<RuntimeState>(() => ({
    runtime,
    loading,
    error,
    reload: () => setRevision((value) => value + 1),
  }), [runtime, loading, error]);
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeState {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("useRuntime must be used inside RuntimeProvider");
  return value;
}
