import { useState, useEffect, useCallback } from "react";
import type { TaskLogGroup } from "./types";

interface UseLogBrowserResult {
  groups: TaskLogGroup[];
  loading: boolean;
  selectedFile: string | null;
  fileContent: string | null;
  fileLoading: boolean;
  selectFile: (filename: string | null) => void;
  refresh: () => void;
}

export function useLogBrowser(): UseLogBrowserResult {
  const [groups, setGroups] = useState<TaskLogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      setGroups(data);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const selectFile = useCallback(async (filename: string | null) => {
    setSelectedFile(filename);
    if (!filename) {
      setFileContent(null);
      return;
    }
    setFileLoading(true);
    try {
      const res = await fetch(`/api/logs/${encodeURIComponent(filename)}`);
      setFileContent(await res.text());
    } catch {
      setFileContent("Failed to load file");
    } finally {
      setFileLoading(false);
    }
  }, []);

  return {
    groups,
    loading,
    selectedFile,
    fileContent,
    fileLoading,
    selectFile,
    refresh: fetchGroups,
  };
}
