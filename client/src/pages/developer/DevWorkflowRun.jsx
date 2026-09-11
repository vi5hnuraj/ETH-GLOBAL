import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, Link } from 'react-router-dom';
import { FiArrowLeft, FiActivity, FiLayers, FiDollarSign, FiTrendingDown, FiXCircle, FiExternalLink, FiCpu, FiShare2 } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import StatCard from '../../components/dev/StatCard';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import ConfirmModal from '../../components/dev/ConfirmModal';
import StatusBadge from '../../components/dev/StatusBadge';
import Pill from '../../components/dev/Pill';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const shortId = (id) => (id && typeof id === 'string' ? id.slice(0, 14) : id);

const DevWorkflowRun = () => {
  const { runId } = useParams();
  const { data, loading, error, refresh, refreshing } = useApi({ fetcher: () => developerApi.workflowRun(runId) });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!data?.run || !['running', 'partial'].includes(data.run.status)) return undefined;
    const timer = setInterval(() => refresh({ background: true }), 5000);
    return () => clearInterval(timer);
  }, [data?.run?.status, refresh]);

  const cancelRun = async () => {
    setCancelling(true);
    try {
      await developerApi.cancelWorkflowRun(runId);
      toast.success('Workflow run cancelled');
      setConfirmCancel(false);
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to cancel run');
    } finally {
      setCancelling(false);
    }
  };

  const payWorkflow = async () => {
    setPaying(true);
    try {
      const result = await developerApi.payWorkflowRun(runId);
      if (result.success) toast.success(result.message || 'Workflow payment settled');
      else toast.error(result.message || 'Workflow payment failed');
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Workflow payment failed');
      refresh({ background: true });
    } finally {
      setPaying(false);
    }
  };

  if (loading && !data) return <Skeleton className="h-72 rounded-2xl" />;
  if (error && !data) return (
    <div>
      <PageHeader title="Workflow run" subtitle={runId} />
      <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
    </div>
  );

  const run = data?.run;
  const steps = data?.steps || [];
  const workflowTotal = steps.reduce((sum, step) => sum + Number(step.estimatedCostBOT || 0), 0);
  const x402Steps = steps.filter((step) => step.requireX402 || step.x402Price);
  const payable = steps.some((step) => step.sessionId && ['awaiting_payment', 'payment_failed'].includes(step.status)) && ['running', 'partial'].includes(run?.status);

  const deps = (run?.dependencies || []).map((d) => `step ${d.step} → ${(d.dependsOn || []).map((x) => `step ${x + 1}`).join(', ')}`);

  return (
    <div>
      <div className="mb-4">
        <Link to="/developer/network/workflows" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          <FiArrowLeft size={14} /> Workflows
        </Link>
      </div>

      <PageHeader
        title={run?.name}
          subtitle={`Created ${run?.createdAt ? new Date(run.createdAt).toLocaleString() : '—'}`}
        actions={
          <>
            <RefreshButton onClick={() => refresh({ background: true })} refreshing={refreshing} />
            {payable && (
              <button type="button" onClick={payWorkflow} disabled={paying} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50">
                {paying ? 'Paying workflow…' : `Pay workflow · ${workflowTotal.toFixed(4)} USDC`}
              </button>
            )}
            {run?.status === 'running' && (
              <button type="button" onClick={() => setConfirmCancel(true)} disabled={cancelling} className="inline-flex items-center gap-2 border border-red-900 text-red-400 hover:bg-red-950 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors">
                <FiXCircle size={14} /> Cancel run
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<FiActivity size={18} />} label="Status" value={<StatusBadge status={run?.status}>{run?.status}</StatusBadge>} accent="text-emerald-400" />
        <StatCard icon={<FiLayers size={18} />} label="Progress" value={`${run?.currentStep ?? 0}/${run?.totalSteps ?? '—'}`} sub="Steps completed" accent="text-blue-400" />
        <StatCard icon={<FiDollarSign size={18} />} label="Estimated Cost" value={`${Number(run?.estimatedCostBOT ?? 0).toFixed(4)} USDC`} accent="text-violet-400" />
        <StatCard icon={<FiTrendingDown size={18} />} label="Actual Cost" value={run?.actualCostBOT != null ? `${Number(run.actualCostBOT).toFixed(4)} USDC` : '—'} accent="text-amber-400" />
      </div>
      {x402Steps.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3 text-xs text-amber-200">
          {x402Steps.length} workflow service{x402Steps.length === 1 ? '' : 's'} also require x402 per API request. The workflow payment covers service access/settlement; each direct invocation may require an additional x402 payment.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title={<span className="flex items-center gap-2"><FiShare2 size={14} /> Payment & execution</span>} subtitle="Provider payments and sequential service execution">
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-zinc-500 font-medium mb-2">Execution order</p>
              {deps.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {deps.map((d, i) => (
                    <span key={i} className="text-[11px] text-zinc-400 bg-zinc-950/50 border border-zinc-800 rounded-full px-2.5 py-0.5">{d.replace(/step (\d+) → step (\d+)/, 'Step $1 follows Step $2')}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Steps run sequentially — no cross-step dependencies.</p>
              )}
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500 flex items-center gap-1.5"><FiCpu size={12} /> Consumer agent</span>
              <span className="text-xs text-zinc-200" title={run?.consumerAgentId || ''}>Paying agent</span>
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-medium mb-2">Provider payments</p>
              <div className="flex flex-wrap gap-1.5">
                {(run?.sessionIds || []).filter(Boolean).length ? run.sessionIds.filter(Boolean).map((id) => (
                  <Link key={id} to={`/developer/commerce/sessions/${id}`} className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-300 bg-blue-600/10 border border-blue-800/40 rounded-full px-2.5 py-0.5 hover:bg-blue-600/20">
                    Open payment <FiExternalLink size={10} />
                  </Link>
                )) : <span className="text-xs text-zinc-600">None attached yet.</span>}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-medium mb-2">Invoices</p>
              <div className="flex flex-wrap gap-1.5">
                    {(run?.invoiceIds || []).filter(Boolean).length ? run.invoiceIds.filter(Boolean).map((id) => (
                  <Link key={id} to={`/developer/marketplace/invoices/${id}`} className="inline-flex items-center gap-1 text-[11px] font-mono text-violet-300 bg-violet-600/10 border border-violet-800/40 rounded-full px-2.5 py-0.5 hover:bg-violet-600/20">
                    Invoice <FiExternalLink size={10} />
                  </Link>
                )) : <span className="text-xs text-zinc-600">Invoices appear after provider payment confirms.</span>}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Steps" subtitle={`${steps.length} orchestrated steps — status per provider reservation`}>
          {steps.length === 0 ? (
            <p className="text-sm text-zinc-600">No steps recorded for this run yet.</p>
          ) : (
            <div className="space-y-2">
              {steps.map((st) => (
                <div key={st.id} className={`bg-zinc-950/50 border rounded-lg px-3.5 py-3 ${st.status === 'failed' ? 'border-red-900' : 'border-zinc-800'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-semibold text-zinc-500 bg-zinc-900/60 border border-zinc-800 rounded-md px-1.5 py-0.5">Step {st.stepIndex + 1}</span>
                    <StatusBadge status={st.status}>{st.status}</StatusBadge>
                    {st.failoverTried && <Pill tone="amber">failover</Pill>}
                  </div>
                  <p className="text-sm text-zinc-200 mt-2">{st.serviceTitle || st.capability || st.category}{st.quantity ? ` ×${st.quantity}` : ''}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px] text-zinc-500">
                    {st.providerAgentId && <span title={st.providerAgentId}>Provider: {st.providerName || 'Provider agent'}</span>}
                    {st.serviceId && <span title={st.serviceId}>Marketplace service</span>}
                    <span>est {Number(st.estimatedCostBOT ?? 0).toFixed(4)} USDC</span>
                    {st.actualCostBOT != null && <span>actual {Number(st.actualCostBOT).toFixed(4)} USDC</span>}
                  </div>
                  {(st.sessionId || st.invoiceId) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {st.sessionId && <Link to={`/developer/commerce/sessions/${st.sessionId}`} title={st.sessionId} className="inline-flex items-center gap-1 text-[11px] text-blue-300 bg-blue-600/10 border border-blue-800/40 rounded-full px-2.5 py-0.5 hover:bg-blue-600/20">Open session <FiExternalLink size={10} /></Link>}
                      {st.invoiceId && <Link to={`/developer/marketplace/invoices/${st.invoiceId}`} title={st.invoiceId} className="inline-flex items-center gap-1 text-[11px] text-violet-300 bg-violet-600/10 border border-violet-800/40 rounded-full px-2.5 py-0.5 hover:bg-violet-600/20">Open invoice <FiExternalLink size={10} /></Link>}
                    </div>
                  )}
                  {st.error && <p className="text-xs text-red-400 mt-2 font-mono break-all">{st.error}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancelRun}
        busy={cancelling}
        title="Cancel workflow run?"
        description="This run will be cancelled. No further steps will be matched or executed, and pending reservations will be released."
        confirmLabel="Cancel run"
      />
    </div>
  );
};

export default DevWorkflowRun;
