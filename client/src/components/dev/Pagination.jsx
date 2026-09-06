import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const Pagination = ({ page, totalPages, total, perPage, onChange, onPageChange }) => {
  const handleChange = onPageChange || onChange;
  if (!totalPages || totalPages <= 1) return null;

  const pages = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, page + 2);
  for (let i = from; i <= to; i += 1) pages.push(i);

  return (
    <nav role="navigation" aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
      {total != null ? (
        <span className="text-xs text-zinc-400">
          Showing {(page - 1) * (perPage || 1) + 1}–{Math.min(page * (perPage || 1), total)} of {total}
        </span>
      ) : (
        <span className="text-xs text-zinc-400">
          Page {page} of {totalPages}
        </span>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Previous page"
        >
          <FiChevronLeft size={16} />
        </button>
        {from > 1 && <span className="px-1 text-zinc-500">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handleChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`px-2.5 py-1 rounded-md text-xs font-medium ${
              p === page ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            {p}
          </button>
        ))}
        {to < totalPages && <span className="px-1 text-zinc-500">…</span>}
        <button
          type="button"
          onClick={() => handleChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Next page"
        >
          <FiChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
};

export default Pagination;