import React from 'react';
import { FiCheckCircle, FiShield, FiStar, FiGlobe } from 'react-icons/fi';

const LEVELS = {
  unverified: { label: 'Unverified', tone: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: null },
  community: { label: 'Community', tone: 'bg-sky-600/10 text-sky-300 border-sky-800/40', icon: FiGlobe },
  startup: { label: 'Startup', tone: 'bg-violet-600/10 text-violet-300 border-violet-800/40', icon: FiStar },
  enterprise: { label: 'Enterprise', tone: 'bg-blue-600/10 text-blue-300 border-blue-800/40', icon: FiShield },
  verified_company: { label: 'Verified Company', tone: 'bg-emerald-600/10 text-emerald-300 border-emerald-800/40', icon: FiCheckCircle },
  government_partner: { label: 'Gov Partner', tone: 'bg-amber-600/10 text-amber-300 border-amber-800/40', icon: FiShield }
};

const SIZES = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-[11px] px-2.5 py-0.5 gap-1.5',
  lg: 'text-xs px-3 py-1 gap-2'
};

/**
 * VerificationBadge — visual provider-verification level (Phase 5 network).
 * `level` must be one of the network VERIFICATION_LEVELS strings.
 */
const VerificationBadge = ({ level, size = 'md', className = '' }) => {
  const key = LEVELS[level] ? level : 'unverified';
  const { label, tone, icon: Icon } = LEVELS[key];
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${tone} ${SIZES[size] || SIZES.md} ${className}`}
      title={`Provider verification: ${label}`}
    >
      {Icon && <Icon size={size === 'sm' ? 9 : 11} />}
      {label}
    </span>
  );
};

export default VerificationBadge;