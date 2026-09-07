import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';
import { FiBox, FiPlay, FiPlus, FiEdit2, FiTrash2, FiArrowRight, FiX } from 'react-icons/fi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import PageHeader from '../../components/dev/PageHeader';
import RefreshButton from '../../components/dev/RefreshButton';
import Tabs from '../../components/dev/Tabs';
import Modal from '../../components/dev/Modal';
import ConfirmModal from '../../components/dev/ConfirmModal';
import Pagination from '../../components/dev/Pagination';
import Pill from '../../components/dev/Pill';
import StatusBadge from '../../components/dev/StatusBadge';
import useApi from '../../hooks/useApi';
import developerApi from '../../utils/developerApi';

const input = 'w-full bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const shortId = (id) => (id && typeof id === 'string' ? id.slice(0, 14) : id);

const emptyStep = () => ({ category: '', capability: '', model: '', quantity: '' });

const stepSummary = (t) => {
  const cats = (t.steps || []).map((s) => s.category || s.capability).filter(Boolean);
  return cats.length ? `${cats.length} step${cats.length === 1 ? '' : 's'}: ${cats.join(' → ')}` : '0 steps';
};

const DevWorkflows = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('templates');
  const { data: templates, loading, error, refresh, refreshing } = useApi({ fetcher: () => developerApi.workflowTemplates() });
  const agentsState = useApi({ fetcher: () => developerApi.agents() });
  const [page, setPage] = useState(1);
  const runsState = useApi({ fetcher: () => developerApi.workflowRuns({ page, perPage: 10 }), deps: [page] });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deployTarget, setDeployTarget] = useState(null);
  const [deployAgent, setDeployAgent] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const agents = agentsState.data?.agents || [];

  const beginCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', category: '', steps: [emptyStep()] });
    setFormOpen(true);
  };

  const beginEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description || '',
      category: t.category || '',
      steps: (t.steps || []).map((s) => ({
        category: s.category || '',
        capability: s.capability || '',
        model: s.model || '',
        quantity: s.quantity != null ? String(s.quantity) : ''
      }))
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(null);
  };

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const updStep = (i, k) => (e) => setForm((f) => ({ ...f, steps: f.steps.map((s, idx) => (idx === i ? { ...s, [k]: e.target.value } : s)) }));
  const addStep = () => setForm((f) => ({ ...f, steps: [...f.steps, emptyStep()] }));
  const removeStep = (i) => setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));

  const save = async (e) => {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) { toast.error('Template name is required.'); return; }
    if (!form.category.trim()) { toast.error('Category is required.'); return; }
    const steps = form.steps
      .map((s) => ({
        category: String(s.category || '').trim(),
        capability: String(s.capability || '').trim(),
        model: String(s.model || '').trim() || null,
        quantity: s.quantity === '' || s.quantity == null ? null : Number(s.quantity)
      }))
      .filter((s) => s.category && s.capability);
    if (steps.length === 0) { toast.error('Add at least one step with a category and capability.'); return; }
    const body = { name: form.name.trim(), description: form.description.trim() || null, category: form.category.trim(), steps };
    setSaving(true);
    try {
      if (editing) {
        await developerApi.updateWorkflowTemplate(editing.templateId, { ...body, isActive: editing.isActive });
        toast.success('Template updated');
      } else {
        await developerApi.createWorkflowTemplate(body);
        toast.success('Template created');
      }
      closeForm();
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const deploy = async () => {
    if (!deployTarget) return;
    if (!deployAgent) { toast.error('Select a consumer agent to run this workflow.'); return; }
    setDeploying(true);
    try {
      const { run } = await developerApi.deployWorkflowTemplate(deployTarget.templateId, { consumerAgentId: deployAgent });
      toast.success('Workflow deployed — tracking the run now');
      setDeployTarget(null);
      setDeployAgent('');
      navigate(`/developer/network/workflows/${run.runId}`);
    } catch (err) {
      toast.error(err.message || 'Failed to deploy workflow');
    } finally {
      setDeploying(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await developerApi.deleteWorkflowTemplate(deleteTarget.templateId);
      toast.success('Template deleted');
      setDeleteTarget(null);
      refresh({ background: true });
    } catch (err) {
      toast.error(err.message || 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  const runs = runsState.data?.runs || [];
  const meta = runsState.data?.meta || {};

  return (
    <div>
      <PageHeader
        title="AI Workflows"
        subtitle="Composable multi-provider pipelines — templates deploy as runs that reserve storage, GPUs, translation and more."
        actions={
          <>
            <RefreshButton
              onClick={() => (tab === 'templates' ? refresh({ background: true }) : runsState.refresh({ background: true }))}
              refreshing={tab === 'templates' ? refreshing : runsState.refreshing}
            />
            {tab === 'templates' && (
              <button type="button" onClick={beginCreate} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors">
                <FiPlus size={14} /> New template
              </button>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'templates', label: 'Templates', icon: <FiBox size={13} /> },
          { id: 'runs', label: 'Runs', icon: <FiPlay size={13} /> }
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === 'templates' ? (
        loading && !templates ? (
          <Skeleton className="h-72 rounded-2xl" />
        ) : error && !templates ? (
          <ErrorBanner message={error.message} onRetry={refresh} setupRequired={error.setupRequired} />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={FiBox}
            title="No workflow templates yet"
            description="Define a multi-step pipeline and deploy it against your provider network — the orchestrator reserves each capability automatically."
            primary={{ label: 'Create template', onClick: beginCreate, icon: <FiPlus size={13} /> }}
          />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card key={t.templateId} className="flex flex-col">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-white">{t.name}</h4>
                    <p className="text-[11px] font-mono text-zinc-600 mt-0.5 truncate" title={t.templateId}>{shortId(t.templateId)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Pill tone="violet">{t.category || 'general'}</Pill>
                    <StatusBadge status={t.isActive ? 'active' : 'inactive'}>{t.isActive ? 'Active' : 'Inactive'}</StatusBadge>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed min-h-[2.5rem]">{t.description || 'No description.'}</p>
                <p className="text-[11px] text-zinc-500 mt-2">{stepSummary(t)}</p>
                <div className="flex items-center justify-between mt-2 mb-4">
                  <span className="text-[11px] text-zinc-600">{t.deployedCount ?? 0} deploys · created {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</span>
                </div>
                <div className="flex items-center gap-2 border-t border-zinc-800 pt-3 mt-auto">
                  <button type="button" onClick={() => { setDeployTarget(t); setDeployAgent(''); }} disabled={!t.isActive} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">
                    <FiPlay size={11} /> Deploy
                  </button>
                  <button type="button" onClick={() => beginEdit(t)} className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium px-3 py-1.5 rounded-lg">
                    <FiEdit2 size={11} /> Edit
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(t)} className="ml-auto inline-flex items-center gap-1.5 border border-red-900 text-red-400 hover:bg-red-950 text-xs font-medium px-3 py-1.5 rounded-lg">
                    <FiTrash2 size={11} /> Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card
          title={`Workflow runs${runsState.data ? ` (${meta.total ?? runs.length})` : ''}`}
          subtitle="Every template deployment executes as a monitored run across the provider network"
          actions={<RefreshButton onClick={() => runsState.refresh({ background: true })} refreshing={runsState.refreshing} />}
        >
          {runsState.loading && !runsState.data ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : runsState.error && !runsState.data ? (
            <ErrorBanner message={runsState.error.message} onRetry={runsState.refresh} setupRequired={runsState.error.setupRequired} />
          ) : runs.length === 0 ? (
            <EmptyState compact icon={FiPlay} title="No workflow runs yet" description="Deploy a template to start a run — the orchestrator reserves storage, GPUs and models across your provider agents." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-zinc-500 border-b border-zinc-800">
                      <th className="pb-3 pr-4">Run</th>
                      <th className="pb-3 pr-4">Template</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Progress</th>
                      <th className="pb-3 pr-4 text-right">Est. cost</th>
                      <th className="pb-3 pr-4 text-right">Actual cost</th>
                      <th className="pb-3 text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.runId} className="border-b border-zinc-800/60 hover:bg-zinc-900/40 transition-colors last:border-0">
                        <td className="py-3 pr-4">
                          <Link to={`/developer/network/workflows/${r.runId}`} className="font-semibold text-zinc-200 hover:text-blue-400 transition-colors inline-flex items-center gap-1">
                            <span className="font-mono text-xs">{shortId(r.runId)}</span> <FiArrowRight size={11} className="text-zinc-600" />
                          </Link>
                          <p className="text-xs text-zinc-500 max-w-[220px] truncate mt-0.5">{r.name}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-zinc-400">{r.templateName || '—'}</td>
                        <td className="py-3 pr-4"><StatusBadge status={r.status}>{r.status}</StatusBadge></td>
                        <td className="py-3 pr-4 text-xs text-zinc-400">{r.currentStep ?? 0}/{r.totalSteps ?? '—'}</td>
                        <td className="py-3 pr-4 text-right font-mono text-xs text-zinc-300">{Number(r.estimatedCostBOT ?? 0).toFixed(4)} USDC</td>
                        <td className="py-3 pr-4 text-right font-mono text-xs text-zinc-300">{r.actualCostBOT != null ? `${Number(r.actualCostBOT).toFixed(4)} USDC` : '—'}</td>
                        <td className="py-3 text-right text-xs text-zinc-500">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                totalPages={meta.totalPages || 1}
                total={meta.total}
                perPage={meta.perPage || 10}
                onChange={(p) => setPage(Math.max(1, Math.min(meta.totalPages || 1, p)))}
              />
            </>
          )}
        </Card>
      )}

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit template' : 'New workflow template'}
        subtitle="Steps run in order — the orchestrator matches each to a provider capability on the network"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 font-medium mb-1.5" htmlFor="wf-name">Name *</label>
              <input id="wf-name" value={form?.name || ''} onChange={setField('name')} placeholder="e.g. Video render pipeline" className={input} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 font-medium mb-1.5" htmlFor="wf-category">Category *</label>
              <input id="wf-category" value={form?.category || ''} onChange={setField('category')} placeholder="e.g. media" className={input} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 font-medium mb-1.5">Description</label>
            <textarea value={form?.description || ''} onChange={setField('description')} rows={2} placeholder="What does this pipeline do?" className={input} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-500 font-medium">Steps *</p>
              <button type="button" onClick={addStep} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                <FiPlus size={12} /> Add step
              </button>
            </div>
            {form?.steps?.length ? (
              <div className="space-y-2">
                {form.steps.map((st, i) => (
                  <div key={i} className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-3 flex items-start gap-2 flex-wrap">
                    <span className="text-[11px] font-medium text-zinc-500 font-mono pt-2.5 shrink-0">Step {i + 1}</span>
                    <input value={st.category} onChange={updStep(i, 'category')} placeholder="category" className={`${input} flex-1 min-w-[100px]`} />
                    <input value={st.capability} onChange={updStep(i, 'capability')} placeholder="capability" className={`${input} flex-1 min-w-[120px]`} />
                    <input value={st.model} onChange={updStep(i, 'model')} placeholder="model (opt)" className={`${input} flex-1 min-w-[100px]`} />
                    <input value={st.quantity} onChange={updStep(i, 'quantity')} placeholder="qty (opt)" type="number" inputMode="decimal" min="0" className={`${input} w-24`} />
                    <button type="button" onClick={() => removeStep(i)} className="p-2 text-zinc-500 hover:text-red-400" aria-label={`Remove step ${i + 1}`}>
                      <FiX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No steps yet — add one to define the pipeline.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create template'}
            </button>
            <button type="button" onClick={closeForm} className="text-sm text-zinc-400 hover:text-white px-3 py-2">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deployTarget}
        onClose={() => { setDeployTarget(null); setDeployAgent(''); }}
        title="Deploy workflow template"
        subtitle={deployTarget ? `Runs ${deployTarget.name} — each step reserves network capacity as it goes` : ''}
      >
        <div>
          <label className="block text-xs text-zinc-500 font-medium mb-1.5" htmlFor="deploy-agent">Consumer agent (pays) *</label>
          <select id="deploy-agent" value={deployAgent} onChange={(e) => setDeployAgent(e.target.value)} className={input}>
            <option value="">Select an agent…</option>
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>{a.name || a.agentId}</option>
            ))}
          </select>
          <div className="flex items-center gap-3 mt-6">
            <button type="button" onClick={deploy} disabled={deploying || !deployAgent} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {deploying ? 'Deploying…' : 'Deploy workflow'}
            </button>
            <button type="button" onClick={() => { setDeployTarget(null); setDeployAgent(''); }} className="text-sm text-zinc-400 hover:text-white px-3 py-2">Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        busy={deleting}
        title="Delete workflow template?"
        description={deleteTarget ? (
          <>Template <span className="font-mono text-white">{deleteTarget.name}</span> will be permanently removed. Existing runs are unaffected.
          </>
        ) : ''}
        confirmLabel="Delete template"
      />
    </div>
  );
};

export default DevWorkflows;