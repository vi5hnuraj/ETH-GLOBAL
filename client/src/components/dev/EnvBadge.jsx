/**
 * EnvBadge — shows the active runtime environment (Development/Production) and
 * maintenance state, read live from /platform/environment.
 */

import React, { useEffect, useState } from 'react';
import developerApi from '../../utils/developerApi.js';

const EnvBadge = () => {
  const [env, setEnv] = useState(null);

  useEffect(() => {
    let cancelled = false;
    developerApi.environment()
      .then((e) => { if (!cancelled) setEnv(e); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const isDev = env ? env.isDevelopment : true;
  const maintenance = env?.maintenanceMode;

  return (
    <div className="flex items-center gap-2">
      <span
        title="Active environment"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
          isDev
            ? 'bg-amber-900/30 text-amber-400 border-amber-800/60'
            : 'bg-emerald-900/40 text-emerald-400 border-emerald-800'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        {isDev ? 'Development' : 'Production'}
      </span>
      {maintenance && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-900/40 text-red-400 border border-red-800">
          Maintenance
        </span>
      )}
    </div>
  );
};

export default EnvBadge;