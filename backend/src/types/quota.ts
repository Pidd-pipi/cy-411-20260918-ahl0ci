export enum QuotaStatus {
  /** 该地区当月未配置额度，沿用原有记录方式 */
  UNCONFIGURED = 'unconfigured',
  /** 已配置且尚有剩余 */
  ACTIVE = 'active',
  /** 已用恰好达到上限 */
  FULL = 'full',
  /** 已用超过上限（管理员调低额度或历史数据导致） */
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
  /** 本次操作（新增/修改）试图额外占用的排放量；删除时为负值 */
  delta: number;
  /** 提交后预计占用值 */
  projectedUsed: number;
  /** 提交后是否会超限 */
  overLimit: boolean;
}
