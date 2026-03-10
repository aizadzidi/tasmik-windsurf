"use client";

import { createContext, useContext } from "react";
import type { ProgramScope } from "@/types/programs";
import { useTeachingMode, type TeachingMode } from "@/hooks/useTeachingMode";

interface TeachingModeContextValue {
  mode: TeachingMode | null;
  setMode: (m: TeachingMode) => void;
  programScope: ProgramScope;
}

const TeachingModeContext = createContext<TeachingModeContextValue>({
  mode: null,
  setMode: () => {},
  programScope: "campus",
});

export function TeachingModeProvider({
  programScope,
  children,
}: {
  programScope: ProgramScope;
  children: React.ReactNode;
}) {
  const { mode, setMode } = useTeachingMode(programScope);

  return (
    <TeachingModeContext.Provider value={{ mode, setMode, programScope }}>
      {children}
    </TeachingModeContext.Provider>
  );
}

export function useTeachingModeContext() {
  return useContext(TeachingModeContext);
}
