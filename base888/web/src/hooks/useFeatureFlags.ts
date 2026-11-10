import { useEffect, useState } from "react";
import { appConfig } from "@/config/appConfig";
import { apiClient } from "@/api/axiosClient";

// Reconstruction of Base44's useFeatureFlags: seeds from the pre-auth flags in
// the runtime config, then overlays server-provided flags once available.
export function useFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>(appConfig.PRE_AUTH_FLAGS ?? {});

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiClient.get("/api/feature-flags");
        setFlags((prev) => ({ ...prev, ...(res.data?.flags ?? {}) }));
      } catch { /* keep pre-auth flags */ }
    })();
  }, []);

  return {
    flags,
    isEnabled: (key: string) => Boolean(flags[key])
  };
}
