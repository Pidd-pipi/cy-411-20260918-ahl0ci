import { create } from 'zustand';
import { fetchMyQuota, fetchQuotas, QuotaUpsertPayload, upsertQuota, deleteQuota } from '../api/quota';
import { RegionQuotaView } from '../types/quota';

interface QuotaStore {
  /** 当前用户地区当月额度状态 */
  mine: RegionQuotaView | null;
  /** 管理员配置列表 */
  rows: RegionQuotaView[];
  loading: boolean;
  loadMine: (month?: string) => Promise<void>;
  loadAll: (filters?: { region?: string; month?: string }) => Promise<void>;
  save: (payload: QuotaUpsertPayload) => Promise<RegionQuotaView>;
  remove: (region: string, month: string) => Promise<void>;
}

export const useQuotaStore = create<QuotaStore>((set) => ({
  mine: null,
  rows: [],
  loading: false,
  async loadMine(month) {
    set({ loading: true });
    try {
      const mine = await fetchMyQuota(month ? { month } : undefined);
      set({ mine, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async loadAll(filters) {
    set({ loading: true });
    const rows = await fetchQuotas(filters);
    set({ rows, loading: false });
  },
  async save(payload) {
    const result = await upsertQuota(payload);
    return result.quota;
  },
  async remove(region, month) {
    await deleteQuota(region, month);
  }
}));
