import { RegionQuota, RegionQuotaStatus } from '../types/entities';
import { request } from '../utils/request';

export interface RegionQuotaPayload {
  region: string;
  month: string;
  quotaValue: number;
}

export function fetchRegionQuotaStatus(month?: string): Promise<RegionQuotaStatus> {
  return request.get('/region-quotas/status', { params: month ? { month } : undefined });
}

export function fetchRegionQuotas(params?: { region?: string; month?: string }): Promise<RegionQuota[]> {
  return request.get('/region-quotas', { params });
}

export function upsertRegionQuota(payload: RegionQuotaPayload): Promise<{ quota: RegionQuota }> {
  return request.post('/region-quotas', payload);
}

export function deleteRegionQuota(id: number): Promise<{ message: string }> {
  return request.delete(`/region-quotas/${id}`);
}
