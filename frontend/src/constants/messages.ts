export const Messages = {
  FRONTEND_ACTIVITY_SAVED: '活动记录已同步到碳账本',
  FRONTEND_GOAL_SAVED: '减排目标已更新',
  FRONTEND_PROFILE_SAVED: '个人资料已保存',
  FRONTEND_FACTOR_REQUIRED: '请先选择匹配的排放因子',
  FRONTEND_QUOTA_SAVED: '地区月度额度已设定，占用值按真实活动重算',
  FRONTEND_QUOTA_REJECTED: '本笔活动超出地区当月排放额度，已整笔拒绝',
  FRONTEND_QUOTA_DELETED: '地区月度额度配置已移除，恢复原有记录方式',
  FRONTEND_QUOTA_UNCONFIGURED: '该地区当月未配置额度，活动按原有方式记录',
  BACKEND_SHARED_COPY: '前后端耦合文案：修改文案时需要同步后端 constants/messages.ts',
  LOG_ACTIVITY_CATEGORY: 'ActivityCategory affects filters, chart legends, logs and errors',
  LOG_GOAL_STATUS: 'GoalStatus affects list badges, progress cards, logs and errors',
  LOG_QUOTA_STATUS: 'QuotaStatus affects dashboard cards, admin table, rejection toasts and error codes'
} as const;

