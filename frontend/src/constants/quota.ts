import { QuotaStatus } from '../types/quota';

export { QuotaStatus };

export const QUOTA_STATUS_LABELS: Record<QuotaStatus, string> = {
  [QuotaStatus.UNCONFIGURED]: '未配置',
  [QuotaStatus.ACTIVE]: '额度内',
  [QuotaStatus.FULL]: '已用尽',
  [QuotaStatus.EXCEEDED]: '已超限'
};

export const QUOTA_STATUS_COLORS: Record<QuotaStatus, string> = {
  [QuotaStatus.UNCONFIGURED]: 'default',
  [QuotaStatus.ACTIVE]: 'success',
  [QuotaStatus.FULL]: 'warning',
  [QuotaStatus.EXCEEDED]: 'error'
};
