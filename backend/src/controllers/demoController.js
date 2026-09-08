/**
 * Demo Controller — one-click autonomous demo endpoint.
 */
import { runAutonomousDemo } from '../services/demoService.js';

/**
 * POST /api/developers/demo/autonomous
 * Run the full autonomous demo lifecycle.
 */
export const runDemo = async (req, res, next) => {
  try {
    const { developerId, organizationId } = req;
    const report = await runAutonomousDemo({ developerId, organizationId });
    return res.json({ success: report.success, report });
  } catch (err) {
    next(err);
  }
};
