'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRepolensApi, Project } from '../utils/api';

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { getProjects } = useRepolensApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // useRepolensApi returns fresh function references each render; hold the
  // latest in refs so refresh/effects stay stable and don't re-fetch in a loop.
  const getProjectsRef = useRef(getProjects);
  getProjectsRef.current = getProjects;
  const projectsRef = useRef<Project[]>(projects);
  projectsRef.current = projects;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await getProjectsRef.current();
      setProjects(response?.projects ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep statuses/counts live while an analysis is running.
  useEffect(() => {
    const interval = setInterval(() => {
      if (projectsRef.current.some((p) => p.status === 'analyzing')) {
        refresh(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <ProjectsContext.Provider value={{ projects, loading, error, refresh }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return ctx;
}
