import { create } from 'zustand';
import {
  deleteRegionQuota,
  fetchRegionQuotas,
  fetchRegionQuotaStatus,
  RegionQuotaPayload,
  upsertRegionQuota
} from '../api/regionQuota';
import { RegionQuota, RegionQuotaStatus } from '../types/entities';

interface RegionQuotaStore {
  status: RegionQuotaStatus | null;
  quotas: RegionQuota[];
  statusLoading: boolean;
  listLoading: boolean;
  loadStatus: (month?: string) => Promise<void>;
  loadQuotas: (filters?: { region?: string; month?: string }) => Promise<void>;
  save: (payload: RegionQuotaPayload) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useRegionQuotaStore = create<RegionQuotaStore>((set, get) => ({
  status: null,
  quotas: [],
  statusLoading: false,
  listLoading: false,
  async loadStatus(month) {
    set({ statusLoading: true });
    try {
      const status = await fetchRegionQuotaStatus(month);
      set({ status, statusLoading: false });
    } catch (error) {
      set({ statusLoading: false });
      throw error;
    }
  },
  async loadQuotas(filters) {
    set({ listLoading: true });
    const quotas = await fetchRegionQuotas(filters);
    set({ quotas, listLoading: false });
  },
  async save(payload) {
    await upsertRegionQuota(payload);
    await get().loadStatus();
    await get().loadQuotas();
  },
  async remove(id) {
    await deleteRegionQuota(id);
    await get().loadQuotas();
    await get().loadStatus();
  }
}));
