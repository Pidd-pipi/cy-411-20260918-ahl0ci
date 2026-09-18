import dayjs from 'dayjs';

/** 活动记录日期 -> 所属额度月份 YYYY-MM */
export function monthOfRecordDate(recordDate: string): string {
  return dayjs(recordDate).format('YYYY-MM');
}

/** 额度月份 -> 自然月起止日期（用于按 activities.record_date 汇总） */
export function monthDateRange(month: string): { start: string; end: string } {
  const first = dayjs(`${month}-01`);
  return { start: first.format('YYYY-MM-DD'), end: first.endOf('month').format('YYYY-MM-DD') };
}

export function currentMonth(): string {
  return dayjs().format('YYYY-MM');
}

export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && dayjs(`${month}-01`).isValid();
}
