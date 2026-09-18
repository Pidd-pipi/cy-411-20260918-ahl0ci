import dayjs from 'dayjs';
import { ActivityCategory, ACTIVITY_CATEGORY_LABELS } from '../constants/activity';
import { GoalStatus, GOAL_STATUS_LABELS } from '../constants/goal';

export function formatDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-';
}

export function formatMoney(value: number) {
  return `¥${value.toFixed(2)}`;
}

export function formatCarbon(value: number | string | undefined) {
  return `${Number(value || 0).toFixed(2)} kg CO2e`;
}

export function formatGoalStatus(status: GoalStatus) {
  return GOAL_STATUS_LABELS[status] || status;
}

export function formatActivityCategory(category: ActivityCategory) {
  return ACTIVITY_CATEGORY_LABELS[category] || category;
}

export function formatQuotaMonth(month: string) {
  return dayjs(`${month}-01`, 'YYYY-MM-DD').isValid() ? dayjs(`${month}-01`).format('YYYY 年 MM 月') : month;
}

export function formatQuotaStatus(configured: boolean, exceeded: boolean) {
  if (!configured) return '未配置额度';
  return exceeded ? '已超限' : '额度内';
}

