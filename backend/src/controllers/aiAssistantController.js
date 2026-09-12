/**
 * AI Assistant Controller — HTTP handler for the natural-language interface.
 */
import { processAssistantMessage } from '../services/aiAssistantService.js';
import { ok, handleError } from '../utils/respond.js';

export const chat = async (req, res) => {
  try {
    const { message, consumerAgentId, mode = 'ask' } = req.body;
    if (!message || !String(message).trim()) {
      return ok(res, { message: 'Please provide a message.', answer: 'Type a request like "Buy the safest OCR provider" or "Show risky providers".', steps: [], data: null }, 400);
    }
    const result = await processAssistantMessage(String(message).trim(), {
      consumerAgentId,
      mode,
      developerId: req.developerId,
      organizationId: req.organization?.id
    });
    return ok(res, result);
  } catch (err) {
    return handleError(res, err, 'assistant');
  }
};
