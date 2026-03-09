import { useCallback, useEffect, useState } from "react";
import type { GraphNodeJson } from "./agentGraphPlugin";

export interface ProfileIndex {
  profile: string;
  agents: string[];
}

export interface AgentGraphState {
  profiles: ProfileIndex[];
  loading: boolean;
  selectedProfile: string | null;
  selectedAgent: string | null;
  graph: GraphNodeJson[] | null;
  graphLoading: boolean;
  selectAgent: (profile: string, agent: string) => void;
}

export function useAgentGraph(): AgentGraphState {
  const [profiles, setProfiles] = useState<ProfileIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphNodeJson[] | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  useEffect(() => {
    fetch("/api/agent-graph")
      .then((r) => r.json())
      .then((data: ProfileIndex[]) => {
        setProfiles(data);
        // Auto-select first agent of first profile
        if (data.length > 0 && data[0].agents.length > 0) {
          setSelectedProfile(data[0].profile);
          setSelectedAgent(data[0].agents[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProfile || !selectedAgent) return;
    setGraphLoading(true);
    fetch(`/api/agent-graph/${encodeURIComponent(selectedProfile)}/${encodeURIComponent(selectedAgent)}`)
      .then((r) => r.json())
      .then((data: GraphNodeJson[]) => setGraph(data))
      .finally(() => setGraphLoading(false));
  }, [selectedProfile, selectedAgent]);

  const selectAgent = useCallback((profile: string, agent: string) => {
    setSelectedProfile(profile);
    setSelectedAgent(agent);
  }, []);

  return { profiles, loading, selectedProfile, selectedAgent, graph, graphLoading, selectAgent };
}
