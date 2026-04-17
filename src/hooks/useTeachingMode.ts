"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProgramScope } from "@/types/programs";

export type TeachingMode = "campus" | "online";

const STORAGE_KEY = "teacher_scope_mode";

type UseTeachingModeReturn = {
  mode: TeachingMode | null;
  setMode: (m: TeachingMode) => void;
};

export function useTeachingMode(programScope: ProgramScope): UseTeachingModeReturn {
  const [mode, setModeState] = useState<TeachingMode | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (programScope === "mixed") {
      const stored = localStorage.getItem(STORAGE_KEY);
      setModeState(stored === "online" ? "online" : "campus");
    } else if (programScope === "online") {
      setModeState("online");
    } else if (programScope === "campus") {
      setModeState("campus");
    } else {
      setModeState(null);
    }
  }, [programScope]);

  // If scope changes away from mixed, clear stored preference
  useEffect(() => {
    if (programScope !== "mixed") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [programScope]);

  const setMode = useCallback(
    (newMode: TeachingMode) => {
      setModeState(newMode);
      if (programScope === "mixed") {
        localStorage.setItem(STORAGE_KEY, newMode);
      }
    },
    [programScope]
  );

  return { mode, setMode };
}
