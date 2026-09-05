import React, { useState, useCallback } from 'react';
import {
  FiSearch, FiFileText, FiDownload, FiRefreshCw, FiShield, FiUser,
  FiGlobe, FiPackage, FiCalendar
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import Pagination from '../../components/dev/Pagination';
import EmptyState from '../../components/dev/EmptyState';
import useApi from '../../hooks/useApi';
import adminApi from '../../utils/adminApi';

const PER_PAGE = 50;

const actionColor = (action) => {
  if (!action) return 'text-zinc-400';
  if (action.includes('delete') || action.includes('remove')) return 'text-rose-400';
  if (action.includes('suspend')) return 'text-amber-400';
  if (action.includes('approve') || action.includes('create')) return 'text-emerald-400';
  if (action.includes('refund')) return 'text-violet-400';
  return 'text-blue-400';
};

const AdminAuditLogs = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    adminId: '',
    organizationId: '',
    developerId: '',
    serviceId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const { data, loading, error, refresh, refreshing } = useApi({
    fetcher: useCallback(() => adminApi.auditLogs({
      q: search || undefined,
      adminId: filters.adminId || undefined,
      organizationId: filters.organizationId || undefined,
      developerId: filters.developerId || undefined,
      serviceId: filters.serviceId || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page,
      perPage: PER_PAGE
    }), [search, page, filters])
  });

  const logs = data?.logs || data?.auditLogs || data?.results || [];
  const total = data?.total || logs.length;
  const totalPages = Math.ceil(total / PER_PAGE);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleExport = async (format) => {
    try {
      const result = await adminApi.auditLogsExport({
        q: search || undefined,
        adminId: filters.adminId || undefined,
        organizationId: filters.organizationId || undefined,
        developerId: filters.developerId || undefined,
        serviceId: filters.serviceId || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      }, format);

      if (format === 'csv' && typeof result === 'string') {
        const blob = new Blob([result], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exported');
      } else {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin-audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('JSON exported');
      }
    } catch (err) {
      toast.error(err.message || 'Export failed');
    }
  };

  return (
    <div>
      <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-zinc-400 mt-1">Every admin action recorded. Search by admin, org, developer, service, or date range.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium px-3 py-2 rounded-lg"
          >
            <FiDownload size={12} /> CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium px-3 py-2 rounded-lg"
          >
            <FiDownload size={12} /> JSON
          </button>
          <button
            onClick={() => refresh({ background: true })}
            disabled={refreshing}
            className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            <FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <Card dense className="mb-4">
        <div className="relative">
          <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search audit logs..."
            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mt-3 text-xs text-zinc-400 hover:text-white flex items-center gap-1"
        >
          <FiCalendar size={12} /> {showFilters ? 'Hide filters' : 'Show advanced filters'}
        </button>
      </Card>

      {showFilters && (
        <Card dense className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Admin ID</label>
              <input
                type="text"
                value={filters.adminId}
                onChange={(e) => updateFilter('adminId', e.target.value)}
                placeholder="Filter by admin..."
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Organization ID</label>
              <input
                type="text"
                value={filters.organizationId}
                onChange={(e) => updateFilter('organizationId', e.target.value)}
                placeholder="Filter by org..."
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Developer ID</label>
              <input
                type="text"
                value={filters.developerId}
                onChange={(e) => updateFilter('developerId', e.target.value)}
                placeholder="Filter by developer..."
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Service ID</label>
              <input
                type="text"
                value={filters.serviceId}
                onChange={(e) => updateFilter('serviceId', e.target.value)}
                placeholder="Filter by service..."
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Date From</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Date To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </Card>
      )}

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : error && !data ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-sm">{error.message}</p>
          <button onClick={refresh} className="mt-3 text-blue-400 text-sm hover:underline">Retry</button>
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={FiFileText} title="No audit logs found" description="No admin actions have been recorded yet, or your filters returned no results." />
      ) : (
        <>
          <Card dense>
            <div className="space-y-0">
              {logs.map((log, idx) => (
                <div key={log.id || idx} className="flex items-start gap-3 py-3 border-b border-zinc-800/50 last:border-0">
                  <div className={`shrink-0 rounded-full p-2 bg-zinc-800 ${actionColor(log.action)}`}>
                    <FiShield size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${actionColor(log.action)}`}>
                        {log.action || 'Unknown action'}
                      </span>
                      {log.targetType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase tracking-wider">
                          {log.targetType}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                      {log.adminId && <span className="flex items-center gap-1"><FiUser size={10} /> {log.adminName || log.adminId}</span>}
                      {log.targetId && <span className="flex items-center gap-1"><FiGlobe size={10} /> {log.targetName || log.targetId}</span>}
                      <span>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</span>
                    </div>
                    {log.metadata && typeof log.metadata === 'object' && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-1.5 text-[11px] text-zinc-600 font-mono">
                        {Object.entries(log.metadata).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="mr-3">{k}: {typeof v === 'string' ? v : JSON.stringify(v)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Pagination page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} onChange={setPage} />
        </>
      )}
    </div>
  );
};

export default AdminAuditLogs;
