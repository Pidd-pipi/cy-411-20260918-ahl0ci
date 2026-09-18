import { RegionQuotaController } from '../controllers/regionQuotaController';
import { logTemplate } from '../utils/logger';

export const regionQuotaRoutes = [
  'GET /region-quotas/status requireAuth',
  'GET /region-quotas requireAuth requireRole=admin',
  'POST /region-quotas requireAuth requireRole=admin audit',
  'DELETE /region-quotas/:id requireAuth requireRole=admin audit'
];

logTemplate('info', 'REGION_QUOTA_LIST_START', { region: 'routes', month: 'loaded' });
export const regionQuotaRouteControllers = [RegionQuotaController];
