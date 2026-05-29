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
  isPlatformAdmin: boolean;
  setIsPlatformAdmin: (val: boolean) => void;
}

const STORAGE_KEY = '@glos_workspace';
const PLATFORM_ADMIN_KEY = '@glos_platform_admin';

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  setWorkspace: () => {},
  isLoading: true,
  isPlatformAdmin: false,
  setIsPlatformAdmin: () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null);
  const [isPlatformAdmin, setIsPlatformAdminState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(PLATFORM_ADMIN_KEY),
    ])
      .then(([wsRaw, paRaw]) => {
        if (wsRaw) setWorkspaceState(JSON.parse(wsRaw));
        if (paRaw) setIsPlatformAdminState(JSON.parse(paRaw));
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
      setIsPlatformAdminState(false);
      AsyncStorage.removeItem(PLATFORM_ADMIN_KEY).catch(() => {});
    }
  }, []);

  const setIsPlatformAdmin = useCallback((val: boolean) => {
    setIsPlatformAdminState(val);
    AsyncStorage.setItem(PLATFORM_ADMIN_KEY, JSON.stringify(val)).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ workspace, setWorkspace, isLoading, isPlatformAdmin, setIsPlatformAdmin }),
    [workspace, setWorkspace, isLoading, isPlatformAdmin, setIsPlatformAdmin]
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
