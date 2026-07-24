import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { useApi } from '../hooks/useApi';
import { useWorkspace } from './WorkspaceContext';

interface HasTeamContextValue {
  isAdmin: boolean;
  hasTeam: boolean;
  // true for admins or members who have reportees in the org chart — the
  // mobile equivalent of QA web's Sidebar.jsx `hasTeam` check.
  canSeeTeamContent: boolean;
  loading: boolean;
}

const HasTeamContext = createContext<HasTeamContextValue>({
  isAdmin: false,
  hasTeam: false,
  canSeeTeamContent: false,
  loading: true,
});

export function HasTeamProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { workspace } = useWorkspace();
  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';
  const [hasTeam, setHasTeam] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspace) return;
    if (isAdmin) { setHasTeam(true); setLoading(false); return; }
    setLoading(true);
    api.workspace.hasTeam(workspace.id)
      .then((r) => setHasTeam(!!r.data?.has_team))
      .catch(() => setHasTeam(false))
      .finally(() => setLoading(false));
  }, [workspace, isAdmin, api]);

  const value = useMemo(
    () => ({ isAdmin, hasTeam, canSeeTeamContent: isAdmin || hasTeam, loading }),
    [isAdmin, hasTeam, loading],
  );

  return <HasTeamContext.Provider value={value}>{children}</HasTeamContext.Provider>;
}

export function useHasTeam() {
  return useContext(HasTeamContext);
}
