import React from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

const LegalLayout = ({ title, lastUpdated, children }) => {
  return (
    <div className="min-h-screen bg-[#0c0c0c] text-white font-sans">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Back Link */}
        <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-emerald-400 transition-colors mb-8 text-sm">
          <FiArrowLeft size={14} />
          Back to Home
        </Link>

        {/* Title */}
        <h1 className="text-4xl font-black tracking-tight mb-2">{title}</h1>
        <p className="text-zinc-500 text-sm mb-10">Last updated: {lastUpdated}</p>

        {/* Content */}
        <div className="prose prose-invert prose-zinc max-w-none space-y-6">
          {children}
        </div>

        {/* Footer Links */}
        <div className="mt-16 pt-8 border-t border-zinc-800 flex flex-wrap gap-6 text-sm text-zinc-500">
          <Link to="/privacy" className="hover:text-emerald-400 transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-emerald-400 transition-colors">Terms of Service</Link>
          <Link to="/refund" className="hover:text-emerald-400 transition-colors">Refund Policy</Link>
          <Link to="/cookies" className="hover:text-emerald-400 transition-colors">Cookie Policy</Link>
          <Link to="/disclaimer" className="hover:text-emerald-400 transition-colors">Disclaimer</Link>
          <Link to="/security" className="hover:text-emerald-400 transition-colors">Security Policy</Link>
          <Link to="/acceptable-use" className="hover:text-emerald-400 transition-colors">Acceptable Use</Link>
        </div>
      </div>
    </div>
  );
};

export default LegalLayout;
