import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Workspace {
  id: number;
  name: string;
  type: string;
  role: 'super_admin' | 'admin' | 'member';
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  setWorkspace: (ws: Workspace | null) => void;
  isLoading: boolean;
}

const STORAGE_KEY = '@glos_workspace';

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  setWorkspace: () => {},
  isLoading: true,
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setWorkspaceState(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const setWorkspace = useCallback((ws: Workspace | null) => {
    setWorkspaceState(ws);
    if (ws) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ws)).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, []);

  const value = useMemo(
    () => ({ workspace, setWorkspace, isLoading }),
    [workspace, setWorkspace, isLoading]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
