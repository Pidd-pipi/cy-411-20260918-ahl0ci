import dayjs from 'dayjs';
import { ActivityCategory, ACTIVITY_CATEGORY_LABELS } from '../constants/activity';
import { GoalStatus, GOAL_STATUS_LABELS } from '../constants/goal';
import { QuotaStatus, QUOTA_STATUS_LABELS } from '../constants/quota';

export function formatDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-';
}

export function formatMonth(value?: string) {
  return value ? dayjs(`${value}-01`).format('YYYY-MM') : '-';
}

export function formatMoney(value: number) {
  return `¥${value.toFixed(2)}`;
}

export function formatCarbon(value: number | string | null | undefined) {
  return `${Number(value || 0).toFixed(2)} kg CO2e`;
}

export function formatGoalStatus(status: GoalStatus) {
  return GOAL_STATUS_LABELS[status] || status;
}

export function formatActivityCategory(category: ActivityCategory) {
  return ACTIVITY_CATEGORY_LABELS[category] || category;
}

export function formatQuotaStatus(status: QuotaStatus) {
  return QUOTA_STATUS_LABELS[status] || status;
}

