/**
 * Passport Controller — Human-Backed Agent Identity endpoints.
 *
 *   GET  /api/developers/passport/agent/:agentId   → full Agent Passport
 *   GET  /api/developers/passport/service/:serviceId → Passport for a service's provider
 *   GET  /api/developers/passport/publisher        → publisher-level continuity record
 *   GET  /api/developers/passport/summary/:agentId → compact passport (badges/lists)
 *
 * The passport fuses World identity (World ID + AgentBook) with GlobalPay's
 * publisher-level reputation and The Graph settlement intelligence.
 */
import { ok, handleError } from '../utils/respond.js';
import { getAgentByCode } from '../services/marketplaceService.js';
import {
  buildAgentPassport,
  buildAgentProfile,
  buildPublisherPassport,
  passportSummary
} from '../services/agentPassportService.js';
import { getServiceByCode } from '../services/marketplaceService.js';

/** GET /passport/agent/:agentId — full Agent Passport. */
export const agentPassport = async (req, res) => {
  try {
    const agent = await getAgentByCode(req.params.agentId);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found.' });
    const passport = await buildAgentPassport(agent);
    return ok(res, { passport });
  } catch (err) {
    return handleError(res, err, 'passport');
  }
};

/** GET /passport/service/:serviceId — passport of the service's provider agent. */
export const servicePassport = async (req, res) => {
  try {
    const service = await getServiceByCode(req.params.serviceId);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found or inactive.' });
    const agent = await getAgentByCode(service.agent_code);
    if (!agent) return res.status(404).json({ success: false, message: 'Provider agent not found.' });
    const passport = await buildAgentPassport(agent);
    return ok(res, { passport, serviceId: service.service_id, serviceTitle: service.title });
  } catch (err) {
    return handleError(res, err, 'passport');
  }
};

/** GET /passport/profile/:agentId — Enterprise Trust profile (passport + service context). */
export const agentProfile = async (req, res) => {
  try {
    const { agentId, serviceId } = req.query;
    let serviceRow = null;
    if (serviceId) {
      serviceRow = await getServiceByCode(String(serviceId));
    }
    const result = await buildAgentProfile({ agentId: agentId || req.params.agentId, serviceRow });
    return ok(res, {
      passport: result.passport,
      service: result.service,
      // Enterprise Trust checklist the UI renders directly.
      trustOverview: {
        verifiedHuman: result.passport.humanVerified,
        agentBookRegistered: result.passport.agentBookRegistered,
        trustScore: result.passport.trustScore,
        settlementVolume: result.passport.intelligence?.settlementVolume ?? 0,
        successfulPayments: result.passport.intelligence?.successfulPayments ?? 0,
        uniqueBuyers: result.passport.intelligence?.uniqueBuyers ?? 0,
        riskLevel: result.passport.riskLevel,
        publisherContinuity: Boolean(result.passport.continuity?.active)
      }
    });
  } catch (err) {
    return handleError(res, err, 'passport');
  }
};

/** GET /passport/publisher — publisher-level record (all verified wallets of the caller). */
export const publisherPassport = async (req, res) => {
  try {
    const record = await buildPublisherPassport({
      developerId: req.developerId,
      organizationId: req.organization?.id || null
    });
    return ok(res, { publisher: record });
  } catch (err) {
    return handleError(res, err, 'passport');
  }
};

/** GET /passport/summary/:agentId — compact passport for cards/lists. */
export const agentPassportSummary = async (req, res) => {
  try {
    const agent = await getAgentByCode(req.params.agentId);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found.' });
    const passport = await buildAgentPassport(agent);
    return ok(res, { summary: passportSummary(passport) });
  } catch (err) {
    return handleError(res, err, 'passport');
  }
};
