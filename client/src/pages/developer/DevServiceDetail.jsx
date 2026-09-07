import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiArrowLeft, FiCpu, FiDollarSign, FiExternalLink, FiShoppingBag, FiTrendingUp, FiUsers, FiCheckCircle, FiCopy, FiCheck } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import Pill from '../../components/dev/Pill';
import CodeBlock from '../../components/dev/CodeBlock';
import VerificationBadge from '../../components/dev/VerificationBadge';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const CATEGORY_LABELS = {
  compute: 'Compute',
  'ai-models': 'AI Models',
  'gpu-compute': 'GPU Compute',
  'ocr-vision': 'OCR / Vision',
  'voice-speech': 'Voice & Speech',
  translation: 'Translation',
  video: 'Video',
  storage: 'Storage',
  'data-apis': 'Data APIs',
  other: 'Other',
};

const PRICING_LABELS = {
  per_unit: 'Per Unit',
  per_request: 'Per Request',
  per_hour: 'Per Hour',
  per_char: 'Per Character',
  per_mb_day: 'Per MB / Day',
  flat: 'Flat Fee',
  subscription: 'Subscription',
};

const formatLabel = (raw, map) => {
  if (!raw) return '—';
  if (map[raw]) return map[raw];
  return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const CopyableId = ({ id }) => {
  const [copied, setCopied] = useState(false);
  if (!id) return null;
  const handleCopy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="group inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-mono bg-zinc-900/50 border border-zinc-800 rounded-md px-2 py-1" title={`Copy ${id}`}>
      <span className="truncate max-w-[140px]">{id}</span>
      {copied ? <FiCheck size={10} className="text-emerald-400 shrink-0" /> : <FiCopy size={10} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </button>
  );
};

const DevServiceDetail = () => {
  const { serviceId } = useParams();
  const marketState = useApi({ fetcher: () => developerApi.marketplaceService(serviceId) });
  const ownState = useApi({ fetcher: () => developerApi.services() });
  const invoicesState = useApi({ fetcher: () => developerApi.invoices({ perPage: 100 }) });
  const revenueState = useApi({ fetcher: () => developerApi.marketplaceRevenue() });

  const ownService = useMemo(
    () => (ownState.data?.services || []).find((s) => s.serviceId === serviceId) || null,
    [ownState.data, serviceId]
  );
  const service = marketState.data?.service || ownService;

  const relatedInvoices = useMemo(
    () => (invoicesState.data?.invoices || []).filter((i) => i.serviceId === serviceId),
    [invoicesState.data, serviceId]
  );

  const consumers = useMemo(() => {
    const map = new Map();
    relatedInvoices.forEach((i) => {
      const cur = map.get(i.consumerAgentId) || { count: 0, amountBOT: 0 };
      cur.count += 1;
      cur.amountBOT += Number(i.amountBOT || 0);
      map.set(i.consumerAgentId, cur);
    });
    return Array.from(map.entries()).map(([agentId, v]) => ({ agentId, ...v })).sort((a, b) => b.amountBOT - a.amountBOT);
  }, [relatedInvoices]);

  const revenue = useMemo(() => {
    const top = revenueState.data?.analytics?.topServices || [];
    const mine = top.find((t) => t.serviceId === serviceId);
    const paid = relatedInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amountBOT || 0), 0);
    const pending = relatedInvoices.filter((i) => i.status === 'pending').reduce((s, i) => s + Number(i.amountBOT || 0), 0);
    return { revenueBOT: mine?.revenueBOT ?? paid, paid, pending };
  }, [revenueState.data, relatedInvoices, serviceId]);

  if (marketState.loading && !marketState.data && ownState.loading && !ownState.data) {
    return (
      <div>
        <Skeleton className="h-8 w-64 rounded mb-6" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (!service && (marketState.error || ownState.error) && !marketState.data && !ownService) {
    return (
      <div>
        <PageHeader title="Service" subtitle={serviceId} />
        <ErrorBanner message={marketState.error?.message || ownState.error?.message || 'Service not found.'} onRetry={() => { marketState.refresh(); ownState.refresh(); }} />
      </div>
    );
  }

  if (!service) return <Skeleton className="h-72 rounded-2xl" />;

  const curl = `curl -X POST ${window.location.origin.replace('5173', '5550')}/api/agents/usage-reports \\
  -H "Authorization: Bearer gpay_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"serviceId": "${service.serviceId}", "quantity": 1, "consumerAgentId": "agt_..."}'`;

  return (
    <div>
      <div className="mb-4">
        <Link to="/developer/marketplace" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          <FiArrowLeft size={14} /> Marketplace
        </Link>
      </div>

      <PageHeader
        title={service.title}
        subtitle={`${formatLabel(service.category, CATEGORY_LABELS)} · ${formatLabel(service.pricingModel, PRICING_LABELS)}`}
        actions={<RefreshButton onClick={() => { marketState.refresh({ background: true }); ownState.refresh({ background: true }); invoicesState.refresh({ background: true }); revenueState.refresh({ background: true }); }} refreshing={marketState.refreshing || ownState.refreshing || invoicesState.refreshing || revenueState.refreshing} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card title="Unit price" className="!p-4">
          <p className="text-2xl font-black text-gradient">{service.unitPriceBOT ?? Number(service.unitPrice)} USDC</p>
          <p className="text-[11px] text-zinc-500 mt-1">per {service.unitLabel || 'unit'}</p>
        </Card>
        <Card title="Status" className="!p-4">
          <Pill tone={service.isActive ? 'emerald' : 'zinc'} dot>{service.isActive ? 'Active' : 'Draft'}</Pill>
          <p className="text-[11px] text-zinc-500 mt-2">{service.supportedCurrencies?.join(', ') || 'USDC'}</p>
        </Card>
        <Card title="Revenue" className="!p-4">
          <p className="text-2xl font-black text-emerald-400">{Number(revenue.revenueBOT || 0).toFixed(4)} USDC</p>
          <p className="text-[11px] text-zinc-500 mt-1">settled {Number(revenue.paid || 0).toFixed(4)} · pending {Number(revenue.pending || 0).toFixed(4)}</p>
        </Card>
        <Card title="Consumers" className="!p-4">
          <p className="text-2xl font-black text-white">{consumers.length}</p>
          <p className="text-[11px] text-zinc-500 mt-1">across {relatedInvoices.length} invoice{relatedInvoices.length === 1 ? '' : 's'}</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Overview">
          <div className="mb-3"><CopyableId id={service.serviceId} /></div>
          <p className="text-sm text-zinc-300 leading-relaxed">{service.description || 'No description provided.'}</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Category</span>
              <Pill tone="blue">{formatLabel(service.category, CATEGORY_LABELS)}</Pill>
            </div>
            <div className="flex justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Provider</span>
              <span className="text-xs text-zinc-200 flex items-center gap-1.5">
                {service.providerOrg?.name || service.provider?.name || 'Unknown'}
                {service.providerOrg?.verificationLevel ? <VerificationBadge level={service.providerOrg.verificationLevel} size="sm" /> : <span className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">Unverified</span>}
              </span>
            </div>
            <div className="flex justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Created</span>
              <span className="text-xs text-zinc-300">{service.createdAt ? new Date(service.createdAt).toLocaleString() : '—'}</span>
            </div>
            <div className="flex justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Last updated</span>
              <span className="text-xs text-zinc-300">{service.updatedAt ? new Date(service.updatedAt).toLocaleString() : '—'}</span>
            </div>
          </div>
        </Card>

        <Card title="Usage & pricing" subtitle="How this service is metered and billed">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Pricing model</span>
              <span className="text-xs text-zinc-200">{formatLabel(service.pricingModel, PRICING_LABELS)}</span>
            </div>
            <div className="flex justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Unit price</span>
              <span className="text-xs text-zinc-200 font-mono">{service.unitPriceBOT ?? Number(service.unitPrice)} USDC / {service.unitLabel || 'unit'}</span>
            </div>
            <div className="flex justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-zinc-500">Currencies</span>
              <span className="text-xs text-zinc-200 font-mono">{(service.supportedCurrencies || ['USDC']).join(', ')}</span>
            </div>
            <p className="text-xs text-zinc-600 pt-2">Every usage report against this service creates an invoice for the consumer agent and settles automatically from its MPC wallet.</p>
          </div>
        </Card>
      </div>

      <Card title="Service Endpoint" subtitle="Where buyers send requests" className="mb-6">
        {service.endpointUrl ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-500 mb-1">API Endpoint</p>
                <p className="text-sm text-emerald-400 font-mono truncate">{service.endpointUrl}</p>
              </div>
              <a href={service.endpointUrl} target="_blank" rel="noopener noreferrer" className="ml-3 shrink-0 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-2.5 py-1.5 transition-colors">
                <FiExternalLink size={12} /> Open
              </a>
            </div>
            {service.healthCheckUrl && (
              <div className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500 mb-1">Health Check</p>
                  <p className="text-sm text-zinc-300 font-mono truncate">{service.healthCheckUrl}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-zinc-600">Buyers call this endpoint after purchasing your service. GlobalPay handles billing and metering automatically.</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No endpoint configured. Edit this service to add an API endpoint URL.</p>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Consumers" subtitle="Agents paying for this service">
          {consumers.length ? (
            <div className="space-y-2">
              {consumers.map((c) => (
                <div key={c.agentId} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-2.5">
                  <span className="font-mono text-xs text-zinc-300 flex items-center gap-1.5 min-w-0" title={c.agentId}><FiUsers size={12} /><span className="truncate">{c.agentId}</span></span>
                  <span className="text-sm font-bold text-white">{c.amountBOT.toFixed(4)} USDC <span className="text-[10px] text-zinc-500 font-normal">× {c.count}</span></span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No consumers yet. Publish the capability profile so the recommendation engine can surface this service.</p>
          )}
        </Card>

        <Card title="Recent invoices" subtitle="Most recent activity for this service">
          {relatedInvoices.length ? (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {relatedInvoices.slice(0, 30).map((inv) => (
                <Link key={inv.invoiceId} to={`/developer/marketplace/invoices/${inv.invoiceId}`} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 hover:border-zinc-700 transition-colors">
                  <span className="font-mono text-[11px] text-zinc-400 flex items-center gap-1"><FiCheckCircle size={11} className={inv.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'} /> {inv.invoiceId}</span>
                  <span className="text-xs text-zinc-300">{inv.amountBOT} USDC · <span className={inv.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}>{inv.status}</span></span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No invoices for this service yet.</p>
          )}
        </Card>
      </div>

      <Card title="API reference" subtitle="Report usage programmatically from an agent key">
        <CodeBlock code={curl} language="bash" />
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/developer/marketplace" className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg">
            <FiShoppingBag size={14} /> Browse marketplace
          </Link>
          <Link to="/developer/docs" className="inline-flex items-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-3.5 py-2 rounded-lg">
            <FiExternalLink size={14} /> Documentation
          </Link>
          <span className="inline-flex items-center gap-2 text-sm text-zinc-500"><FiTrendingUp size={14} /> <FiDollarSign size={14} /> Billing is automatic</span>
        </div>
      </Card>
    </div>
  );
};

export default DevServiceDetail;
