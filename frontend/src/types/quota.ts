export enum QuotaStatus {
  UNCONFIGURED = 'unconfigured',
  ACTIVE = 'active',
  FULL = 'full',
  EXCEEDED = 'exceeded'
}

export interface RegionQuotaView {
  region: string;
  month: string;
  configured: boolean;
  quotaValue: number | null;
  usedValue: number;
  remaining: number | null;
  status: QuotaStatus;
}

export interface QuotaCheckResult extends RegionQuotaView {
  delta: number;
  projectedUsed: number;
  overLimit: boolean;
}
