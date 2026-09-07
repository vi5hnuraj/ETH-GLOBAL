/**
 * MarketplaceController — HTTP handlers for the AI Service Marketplace &
 * Autonomous Billing. Two surfaces:
 *   - Agent-scoped (req.agent from a gpay_sk_ key): publish/manage own services,
 *     report usage, browse the marketplace, list & pay invoices.
 *   - Developer-scoped (req.organization + scopes): manage all agents' services,
 *     browse, usage/invoices dashboards, pay invoices on an agent's behalf, and
 *     marketplace revenue/analytics.
 */

import { supabase } from '../config/supabaseClient.js';
import { ethers } from 'ethers';
import {
  createService,
  updateService,
  deleteService,
  listServicesByAgent,
  listServicesByDeveloper,
  listMarketplace,
  getMarketplaceService,
  reportUsage,
  listUsage,
  listInvoices,
  listInvoicesByDeveloper,
  payInvoice,
  devPayInvoice as devPayInvoiceSvc,
  getAgentRevenue,
  getDeveloperMarketplaceStats,
  getAgentByCode,
  getInvoiceByCode
} from '../services/marketplaceService.js';
import { ok, handleError } from '../utils/respond.js';
import { attachOrgProfiles } from '../services/networkService.js';

// ==================== Agent-scoped: services ====================

export const agentCreateService = async (req, res) => {
  try {
    const { title, description, category, pricingModel, unitPrice, unitLabel, metadata } = req.body;
    const service = await createService({ agent: req.agent, title, description, category, pricingModel, unitPrice, unitLabel, metadata });
    return ok(res, { message: `📦 Service published: ${service.title}`, service }, 201);
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

export const agentListServices = async (req, res) => {
  try {
    const services = await listServicesByAgent(req.agent);
    return ok(res, { count: services.length, services });
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

export const agentUpdateService = async (req, res) => {
  try {
    const service = await updateService({ agent: req.agent, serviceId: req.params.serviceId, patch: req.body });
    return ok(res, { message: '✅ Service updated', service });
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

export const agentDeleteService = async (req, res) => {
  try {
    const result = await deleteService({ agent: req.agent, serviceId: req.params.serviceId });
    return ok(res, { message: '🗑️ Service deleted', ...result });
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

// ==================== Marketplace browse ====================

export const agentMarketplaceList = async (req, res) => {
  try {
    const result = await listMarketplace({
      search: req.query.search,
      category: req.query.category,
      sort: req.query.sort,
      order: req.query.order,
      page: req.query.page,
      perPage: req.query.perPage,
      excludeAgentId: req.agent.id
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'marketplace');
  }
};

export const agentMarketplaceGet = async (req, res) => {
  try {
    const service = await getMarketplaceService(req.params.serviceId);
    return ok(res, { service });
  } catch (err) {
    return handleError(res, err, 'marketplace');
  }
};

// ==================== Usage metering ====================

export const agentReportUsage = async (req, res) => {
  try {
    const { serviceId, quantity, consumerAgentId, metadata, sessionId } = req.body;
    const result = await reportUsage({ agent: req.agent, serviceId, quantity, consumerAgentId, metadata, sessionId });
    return ok(res, { message: `🧮 Usage recorded (prepaid) — ${result.amountBOT} USDC. No invoice generated (payment is settled at purchase time).`, ...result });
  } catch (err) {
    return handleError(res, err, 'usage');
  }
};

export const agentListUsage = async (req, res) => {
  try {
    const result = await listUsage({
      agent: req.agent,
      role: req.query.role || 'all',
      page: req.query.page,
      perPage: req.query.perPage
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'usage');
  }
};

// ==================== Invoices & settlement ====================

export const agentListInvoices = async (req, res) => {
  try {
    const result = await listInvoices({
      agent: req.agent,
      role: req.query.role || 'all',
      status: req.query.status,
      page: req.query.page,
      perPage: req.query.perPage
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'invoice');
  }
};

export const agentPayInvoice = async (req, res) => {
  try {
    const result = await payInvoice({ agent: req.agent, invoiceId: req.params.invoiceId });
    if (result.alreadyPaid) {
      return ok(res, { message: `ℹ️ Invoice ${result.invoiceId} was already paid.`, ...result });
    }
    return ok(res, { message: `✅ Invoice paid — ${result.amountBOT} USDC settled to ${result.to}.`, ...result });
  } catch (err) {
    return handleError(res, err, 'invoice');
  }
};

export const agentRevenue = async (req, res) => {
  try {
    const stats = await getAgentRevenue(req.agent);
    return ok(res, stats);
  } catch (err) {
    return handleError(res, err, 'revenue');
  }
};

// ==================== Developer-scoped ====================

const requireOwnedAgent = async ({ developerId, organizationId, agentId }) => {
  const agent = await getAgentByCode(agentId);
  if (!agent) throw Object.assign(new Error('Agent not found.'), { status: 404 });
  const owned = organizationId ? agent.organization_id === organizationId : agent.developer_id === developerId;
  if (!owned) throw Object.assign(new Error('You do not own this agent.'), { status: 403 });
  return agent;
};

export const devCreateService = async (req, res) => {
  try {
    const { agentId, title, description, category, pricingModel, unitPrice, unitLabel, metadata, endpointUrl, healthCheckUrl } = req.body;
    const agent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization?.id, agentId });
    const service = await createService({ agent, title, description, category, pricingModel, unitPrice, unitLabel, metadata, endpointUrl, healthCheckUrl });
    return ok(res, { message: `📦 Service published: ${service.title}`, service }, 201);
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

export const devListServices = async (req, res) => {
  try {
    const services = await listServicesByDeveloper(req.developerId, req.organization?.id);
    return ok(res, { count: services.length, services });
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

export const devUpdateService = async (req, res) => {
  try {
    const agent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization?.id, agentId: req.body.agentId });
    const service = await updateService({ agent, serviceId: req.params.serviceId, patch: req.body });
    return ok(res, { message: '✅ Service updated', service });
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

export const devDeleteService = async (req, res) => {
  try {
    const agent = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization?.id, agentId: req.body.agentId });
    const result = await deleteService({ agent, serviceId: req.params.serviceId });
    return ok(res, { message: '🗑️ Service deleted', ...result });
  } catch (err) {
    return handleError(res, err, 'service');
  }
};

export const devMarketplaceList = async (req, res) => {
  try {
    const result = await listMarketplace({
      search: req.query.search,
      category: req.query.category,
      sort: req.query.sort,
      order: req.query.order,
      page: req.query.page,
      perPage: req.query.perPage
    });
    if (Array.isArray(result.services)) {
      result.services = await attachOrgProfiles(result.services);
    }
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'marketplace');
  }
};

export const devMarketplaceGet = async (req, res) => {
  try {
    const service = await getMarketplaceService(req.params.serviceId);
    if (service) {
      const [enriched] = await attachOrgProfiles([service]);
      return ok(res, { service: enriched || service });
    }
    return ok(res, { service });
  } catch (err) {
    return handleError(res, err, 'marketplace');
  }
};

export const devListUsage = async (req, res) => {
  try {
    const { data: agentRows } = await supabase
      .from('ai_agents')
      .select('id')
      .eq(req.organization?.id ? 'organization_id' : 'developer_id', req.organization?.id || req.developerId);
    const ids = (agentRows || []).map((a) => a.id);

    if (ids.length === 0) {
      return ok(res, { usage: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 0, hasMore: false } });
    }

    let q = supabase
      .from('usage_reports')
      .select('*, ai_services(service_id, title, category)', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (req.query.role === 'consumer') q = q.in('consumer_agent_id', ids);
    else if (req.query.role === 'provider') q = q.in('provider_agent_id', ids);
    else q = q.or(`consumer_agent_id.in.(${ids.join(',')}),provider_agent_id.in.(${ids.join(',')})`);

    const per = Math.min(Number(req.query.perPage) || 20, 100);
    const page = Math.max(1, Number(req.query.page) || 1);
    q = q.range((page - 1) * per, (page - 1) * per + per - 1);

    const { data, count, error } = await q;
    if (error) throw new Error(`Usage list failed: ${error.message}`);

    const rows = (data || []).map((u) => ({
      usageId: u.usage_id,
      serviceId: u.service_code,
      serviceTitle: u.ai_services?.title || null,
      serviceCategory: u.ai_services?.category || null,
      consumerAgentId: u.consumer_agent_code,
      providerAgentId: u.provider_agent_code,
      quantity: u.quantity,
      unit: u.unit,
      amountBOT: ethers.formatEther(u.amount_wei),
      status: u.status,
      createdAt: u.created_at
    }));

    return ok(res, {
      usage: rows,
      meta: { page, perPage: per, total: count || 0, totalPages: Math.ceil((count || 0) / per), hasMore: (count || 0) > page * per }
    });
  } catch (err) {
    return handleError(res, err, 'usage');
  }
};

export const devListInvoices = async (req, res) => {
  try {
    const result = await listInvoicesByDeveloper({
      developerId: req.developerId,
      organizationId: req.organization?.id,
      role: req.query.role || 'all',
      status: req.query.status,
      page: req.query.page,
      perPage: req.query.perPage,
      callerDefaulted: Boolean(req.callerDefaulted),
      orgExplicit: Boolean(req.header('x-organization-id'))
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'invoice');
  }
};

export const devGetInvoice = async (req, res) => {
  try {
    const invoice = await getInvoiceByCode(req.params.invoiceId);
    if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });

    let q = supabase.from('ai_agents').select('id').in('id', [invoice.consumer_agent_id, invoice.provider_agent_id]);
    if (req.organization?.id) q = q.eq('organization_id', req.organization.id);
    else q = q.eq('developer_id', req.developerId);
    const { data: owned } = await q;
    if (!owned || owned.length === 0) throw Object.assign(new Error('Invoice not found in this workspace.'), { status: 403 });

    return ok(res, {
      invoice: {
        invoiceId: invoice.invoice_id,
        serviceId: invoice.service_code,
        consumerAgentId: invoice.consumer_agent_code,
        providerAgentId: invoice.provider_agent_code,
        quantity: invoice.quantity,
        unit: invoice.unit,
        amountBOT: ethers.formatEther(invoice.amount_wei),
        status: invoice.status,
        txHash: invoice.tx_hash,
        explorerUrl: invoice.tx_hash ? `${process.env.ARC_EXPLORER_URL || process.env.EXPLORER_URL || 'https://testnet.arcscan.app/'}tx/${invoice.tx_hash}` : null,
        paidAt: invoice.paid_at,
        dueAt: invoice.due_at,
        createdAt: invoice.created_at
      }
    });
  } catch (err) {
    return handleError(res, err, 'invoice');
  }
};

export const devPayInvoice = async (req, res) => {
  try {
    const result = await devPayInvoiceSvc({
      developerId: req.developerId,
      organizationId: req.organization?.id,
      consumerAgentId: req.body.consumerAgentId,
      invoiceId: req.params.invoiceId
    });
    if (result.alreadyPaid) return ok(res, { message: `ℹ️ Invoice ${result.invoiceId} was already paid.`, ...result });
    return ok(res, { message: `✅ Invoice paid — ${result.amountBOT} USDC settled to ${result.to}.`, ...result });
  } catch (err) {
    return handleError(res, err, 'invoice');
  }
};

export const devReportUsage = async (req, res) => {
  try {
    const { serviceId, quantity, consumerAgentId, metadata, sessionId } = req.body;
    const consumer = await requireOwnedAgent({ developerId: req.developerId, organizationId: req.organization?.id, agentId: consumerAgentId });
    const result = await reportUsage({ agent: consumer, serviceId, quantity, consumerAgentId, metadata, sessionId });
    return ok(res, { message: `🧮 Usage recorded (prepaid) — ${result.amountBOT} USDC. No invoice generated (payment is settled at purchase time).`, ...result }, 201);
  } catch (err) {
    return handleError(res, err, 'usage');
  }
};

export const devMarketplaceStats = async (req, res) => {
  try {
    const stats = await getDeveloperMarketplaceStats({ developerId: req.developerId, organizationId: req.organization?.id });
    return ok(res, stats);
  } catch (err) {
    return handleError(res, err, 'revenue');
  }
};
