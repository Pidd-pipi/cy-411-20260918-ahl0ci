import { RegionQuotaView } from '../types/quota';
import { request } from '../utils/request';

export interface QuotaUpsertPayload {
  region: string;
  month: string;
  quotaValue: number;
}

/** 当前登录用户所在地区的当月额度状态（仪表盘用） */
export function fetchMyQuota(params?: { month?: string }): Promise<RegionQuotaView> {
  return request.get('/quotas/me', { params });
}

/** 管理员：额度配置列表 */
export function fetchQuotas(params?: { region?: string; month?: string }): Promise<RegionQuotaView[]> {
  return request.get('/quotas', { params });
}

/** 管理员：按月给地区设定可排放上限 */
export function upsertQuota(payload: QuotaUpsertPayload): Promise<{ message: string; quota: RegionQuotaView }> {
  return request.post('/quotas', payload);
}

/** 管理员：移除某地区某月配置 */
export function deleteQuota(region: string, month: string): Promise<{ message: string }> {
  return request.delete(`/quotas/${encodeURIComponent(region)}/${month}`);
}
