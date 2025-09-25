import { useEffect, useState, useCallback } from "react";
import { fetchGradingSystems, type GradingSystem } from "@/lib/data/getGradingSystems";

export function useGradingSystems() {
  const [data, setData] = useState<GradingSystem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await fetchGradingSystems();
      setData(rows);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const rows = await fetchGradingSystems();
        if (alive) setData(rows);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { data, loading, error, refetch: load };
}