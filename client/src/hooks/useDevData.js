import { useState, useEffect, useCallback } from 'react';
import agentsApi, { deriveDeveloperStats } from '../utils/agentsApi';

/**
 * Shared data hook for the Developer Platform.
 * Loads all agents + each agent's history, then derives dashboard stats.
 */
const useDevData = () => {
  const [agents, setAgents] = useState([]);
  const [histories, setHistories] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await agentsApi.list();
      const ags = list.agents || [];
      const hists = await Promise.all(
        ags.map(async (a) => {
          try {
            const h = await agentsApi.history(a.apiKey);
            return (h.transactions || []).map((t) => ({ ...t, agentName: a.name, agentId: a.agentId }));
          } catch { return []; }
        })
      );
      setAgents(ags);
      setHistories(hists.flat());
      setStats(deriveDeveloperStats(ags, hists));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { agents, histories, stats, loading, error, refresh };
};

export default useDevData;