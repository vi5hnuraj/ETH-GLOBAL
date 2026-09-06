import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiDownload } from 'react-icons/fi';
import { downloadCsv } from '../../utils/csv';

/**
 * ExportButton — downloads CSV from a data provider.
 * `rows`: array of objects (or a function returning them / a Promise).
 * `columns`: optional [{ key, label }] to control header + ordering.
 */
const ExportButton = ({ filename = 'export.csv', rows, columns, label = 'Export CSV', className = '', disabled = false, id }) => {
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const data = typeof rows === 'function' ? await rows() : rows;
      if (!data || data.length === 0) {
        toast.error('Nothing to export yet.');
        return;
      }
      downloadCsv(filename, data, columns);
      toast.success('CSV exported.');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={doExport}
      id={id}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      <FiDownload size={14} className={busy ? 'animate-pulse' : ''} />
      {busy ? 'Exporting…' : label}
    </button>
  );
};

export default ExportButton;
