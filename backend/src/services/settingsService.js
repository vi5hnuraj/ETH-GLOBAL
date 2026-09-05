/**
 * SettingsService — per-developer persisted platform settings.
 * Stores a JSONB document keyed by developer_id.
 */

import { supabase } from '../config/supabaseClient.js';
import { requireTables, throwMissingTable } from '../repositories/platformRepository.js';

export const DEFAULT_SETTINGS = {
  environment: 'development',
  walletProvider: 'mpc',
  allowedWalletProviders: ['mpc'],
  apiPermissions: {
    createAgents: true,
    sendPayments: true,
    readBalance: true,
    readHistory: true,
    manageKeys: true
  },
  notifications: {
    payment: true,
    agent: true,
    security: false
  },
  teamMembers: [],
  security: {
    twoFactor: false,
    ipWhitelist: []
  }
};

const mergeSettings = (stored) => ({
  ...DEFAULT_SETTINGS,
  ...(stored || {}),
  apiPermissions: { ...DEFAULT_SETTINGS.apiPermissions, ...(stored?.apiPermissions || {}) },
  notifications: { ...DEFAULT_SETTINGS.notifications, ...(stored?.notifications || {}) },
  security: { ...DEFAULT_SETTINGS.security, ...(stored?.security || {}) },
  teamMembers: stored?.teamMembers || []
});

export const getSettings = async (developerId) => {
  const { data, error } = await requireTables(() =>
    supabase.from('developer_settings').select('*').eq('developer_id', developerId).maybeSingle()
  );
  if (error) throwMissingTable(error);
  if (error) throw error;
  return {
    developerId,
    ...mergeSettings(data?.data)
  };
};

export const saveSettings = async (developerId, patch) => {
  const current = (await getSettings(developerId));
  const merged = { ...current, ...patch };

  const { error } = await requireTables(() =>
    supabase
      .from('developer_settings')
      .upsert(
        {
          developer_id: developerId,
          data: merged,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'developer_id' }
      )
      .select()
      .single()
  );
  if (error) throwMissingTable(error);
  if (error) throw error;

  return merged;
};
