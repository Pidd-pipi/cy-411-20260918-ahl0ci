import { QuotaController } from '../controllers/quotaController';

export const quotaRoutes = [
  'GET /quotas/me requireAuth',
  'GET /quotas requireAuth requireRole=admin',
  'POST /quotas requireAuth requireRole=admin audit',
  'DELETE /quotas/:region/:month requireAuth requireRole=admin audit'
];

export const quotaRouteControllers = [QuotaController];
