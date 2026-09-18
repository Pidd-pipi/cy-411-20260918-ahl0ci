import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { RegionQuota } from '../models/regionQuota';
import { QuotaCheckResult, QuotaStatus, RegionQuotaView } from '../types/quota';
import { AppError } from '../utils/AppError';
import { isValidMonth, monthDateRange, monthOfRecordDate } from '../utils/quotaPeriod';
import { logTemplate } from '../utils/logger';

export interface QuotaUpsertInput {
  region: string;
  month: string;
  quotaValue: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function buildView(row: RegionQuota | null, region: string, month: string, usedOverride?: number): RegionQuotaView {
  if (!row) {
    return { region, month, configured: false, quotaValue: null, usedValue: round2(usedOverride ?? 0), remaining: null, status: QuotaStatus.UNCONFIGURED };
  }
  const usedValue = round2(usedOverride ?? Number(row.usedValue));
  const quotaValue = Number(row.quotaValue);
  const remaining = round2(quotaValue - usedValue);
  let status: QuotaStatus = QuotaStatus.ACTIVE;
  if (usedValue > quotaValue) status = QuotaStatus.EXCEEDED;
  else if (remaining === 0) status = QuotaStatus.FULL;
  return { region, month, configured: true, quotaValue, usedValue, remaining, status };
}

@Injectable()
export class QuotaService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ---------------------------------------------------------------- 管理员

  async list(region?: string, month?: string) {
    logTemplate('info', 'QUOTA_LIST_START', { region: region || '-', month: month || '-' });
    const rows = await this.dataSource.getRepository(RegionQuota).find({
      where: {
        ...(region ? { region } : {}),
        ...(month ? { month } : {})
      },
      order: { month: 'DESC', region: 'ASC' }
    });
    return rows.map((row) => buildView(row, row.region, row.month));
  }

  /** 管理员按月给地区设定可排放上限；重复设定为整笔覆盖，随后按真实活动重算占用值 */
  async upsert(input: QuotaUpsertInput): Promise<{ message: string; quota: RegionQuotaView }> {
    logTemplate('info', 'QUOTA_UPSERT_START', { region: input.region, month: input.month, quotaValue: input.quotaValue });
    const region = (input.region || '').trim();
    if (!region) {
      logTemplate('warn', 'QUOTA_UPSERT_FAILED', { region: input.region, field: 'RegionQuota.region', reason: 'empty' });
      throw new AppError(ErrorCodes.QUOTA_VALUE_INVALID, `RegionQuota[region=${input.region}] upsert failed: region empty`, HttpStatus.BAD_REQUEST);
    }
    if (!isValidMonth(input.month)) {
      logTemplate('warn', 'QUOTA_UPSERT_FAILED', { region, field: 'RegionQuota.month', reason: 'invalid month' });
      throw new AppError(ErrorCodes.QUOTA_MONTH_INVALID, `RegionQuota[region=${region}] upsert failed: month ${input.month} invalid, expected YYYY-MM`, HttpStatus.BAD_REQUEST);
    }
    if (!Number.isFinite(input.quotaValue) || input.quotaValue < 0) {
      logTemplate('warn', 'QUOTA_UPSERT_FAILED', { region, field: 'RegionQuota.quota_value', reason: 'invalid value' });
      throw new AppError(ErrorCodes.QUOTA_VALUE_INVALID, `RegionQuota[region=${region}] upsert failed: quota_value must be a non-negative number`, HttpStatus.BAD_REQUEST);
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RegionQuota);
      let row = await repo.findOne({ where: { region, month: input.month }, lock: { mode: 'pessimistic_write' } });
      if (row) {
        row.quotaValue = String(round2(input.quotaValue));
        row = await repo.save(row);
      } else {
        row = await repo.save(
          repo.create({ region, month: input.month, quotaValue: String(round2(input.quotaValue)), usedValue: '0.00' })
        );
      }
      const usedValue = await this.recalculateUsed(manager, region, input.month);
      logTemplate('info', 'QUOTA_UPSERT_SUCCESS', { id: row.id, region, month: input.month, quotaValue: row.quotaValue });
      return { message: Messages.QUOTA_CONFIGURED, quota: buildView({ ...row, usedValue: String(usedValue) }, region, input.month, usedValue) };
    });
  }

  async remove(region: string, month: string): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RegionQuota);
      const row = await repo.findOne({ where: { region, month }, lock: { mode: 'pessimistic_write' } });
      if (!row) {
        throw new AppError(ErrorCodes.QUOTA_NOT_FOUND, `RegionQuota[region=${region}] delete failed: month ${month} not configured`, HttpStatus.NOT_FOUND);
      }
      await repo.remove(row);
      logTemplate('info', 'QUOTA_DELETE_SUCCESS', { id: row.id, region, month });
      return { message: Messages.QUOTA_RELEASED };
    });
  }

  // ---------------------------------------------------------------- 成员视图

  /** 仪表盘：地区当月已用、剩余与超限状态；未配置额度时返回 configured=false */
  async status(region: string, month: string): Promise<RegionQuotaView> {
    const row = await this.dataSource.getRepository(RegionQuota).findOne({ where: { region, month } });
    if (!row) {
      logTemplate('info', 'QUOTA_NOT_CONFIGURED', { region, month });
      return buildView(null, region, month);
    }
    const view = buildView(row, region, month);
    logTemplate('info', 'QUOTA_STATUS_READ', { region, month, status: view.status, usedValue: view.usedValue });
    return view;
  }

  // ---------------------------------------------------------- 事务内额度核算

  /**
   * 按月份升序一次性锁定该地区涉及的所有已配置额度行。
   * 跨月修改会同时触碰两个月份，先以确定顺序加锁可避免“Jan→Feb / Feb→Jan”反向获取造成的死锁。
   * 未配置的月份没有行可锁，返回集合中缺失，后续 reserve/release 会按空配置处理。
   */
  async lockMonthsInTx(manager: EntityManager, region: string, months: string[]): Promise<Map<string, RegionQuota>> {
    const distinct = Array.from(new Set(months)).sort();
    if (!distinct.length) return new Map();
    const rows = await manager.getRepository(RegionQuota).find({
      where: distinct.map((month) => ({ region, month })),
      lock: { mode: 'pessimistic_write' },
      order: { month: 'ASC' }
    });
    return new Map(rows.map((row) => [row.month, row]));
  }

  /**
   * 在活动写入事务内预留额度：锁定 region_quotas 行后核对占用，
   * 超出整笔拒绝（抛出 409，事务回滚），否则同步递增 used_value。
   * delta <= 0 时只释放、不拦截。
   */
  async reserveInTx(manager: EntityManager, region: string, recordDate: string, delta: number): Promise<RegionQuota | null> {
    const month = monthOfRecordDate(recordDate);
    const repo = manager.getRepository(RegionQuota);
    const quota = await repo.findOne({ where: { region, month }, lock: { mode: 'pessimistic_write' } });
    if (!quota) {
      logTemplate('info', 'QUOTA_NOT_CONFIGURED', { region, month });
      return null;
    }
    const usedValue = round2(Number(quota.usedValue));
    const quotaValue = Number(quota.quotaValue);
    const next = round2(usedValue + delta);
    logTemplate('info', 'QUOTA_RESERVE_START', { region, month, delta: round2(delta) });
    // 负增量（修改导致排放变小）直接释放占用；正增量才做超限拦截
    if (delta > 0 && next > quotaValue) {
      logTemplate('warn', 'QUOTA_RESERVE_DENIED', { region, month, usedValue, quotaValue, delta: round2(delta) });
      throw new AppError(
        ErrorCodes.QUOTA_EXCEEDED,
        `RegionQuota[region=${region}] ${month} exceeded: used ${usedValue} + ${round2(delta)} > quota ${quotaValue} (remaining ${round2(quotaValue - usedValue)})`,
        HttpStatus.CONFLICT
      );
    }
    quota.usedValue = String(Math.max(0, next));
    const saved = await repo.save(quota);
    logTemplate('info', 'QUOTA_RESERVE_SUCCESS', { region, month, usedValue: next, remaining: round2(quotaValue - next) });
    return saved;
  }

  /** 在活动删除/旧值替换事务内回退占用；未配置额度则为空操作 */
  async releaseInTx(manager: EntityManager, region: string, recordDate: string, delta: number): Promise<RegionQuota | null> {
    if (delta <= 0) return null;
    const month = monthOfRecordDate(recordDate);
    const repo = manager.getRepository(RegionQuota);
    const quota = await repo.findOne({ where: { region, month }, lock: { mode: 'pessimistic_write' } });
    if (!quota) {
      logTemplate('info', 'QUOTA_NOT_CONFIGURED', { region, month });
      return null;
    }
    const next = round2(Math.max(0, Number(quota.usedValue) - delta));
    quota.usedValue = String(next);
    const saved = await repo.save(quota);
    logTemplate('info', 'QUOTA_RELEASE_SUCCESS', { region, month, usedValue: next, delta: round2(delta) });
    return saved;
  }

  /** 预演写入结果，供控制器/排查使用（不锁行、不写库） */
  async preview(region: string, recordDate: string, delta: number): Promise<QuotaCheckResult> {
    const month = monthOfRecordDate(recordDate);
    const quota = await this.dataSource.getRepository(RegionQuota).findOne({ where: { region, month } });
    const view = quota ? buildView(quota, region, month) : buildView(null, region, month);
    const projectedUsed = round2(view.usedValue + delta);
    const overLimit = view.configured && delta > 0 && projectedUsed > Number(view.quotaValue);
    return { ...view, delta: round2(delta), projectedUsed, overLimit };
  }

  /** 按 activities 真实核算结果重算某地区某月占用值 */
  async recalculateUsed(manager: EntityManager, region: string, month: string): Promise<number> {    const { start, end } = monthDateRange(month);
    // 地区归属以 users.region 为准，活动本身不冗余地区字段
    const rows = await manager.query(
      `SELECT COALESCE(SUM(a.carbon_value), 0) AS total
       FROM activities a
       INNER JOIN users u ON u.id = a.user_id
       WHERE u.region = ? AND a.record_date BETWEEN ? AND ?`,
      [region, start, end]
    );
    const usedValue = round2(Number(rows?.[0]?.total || 0));

    const quotaRepo = manager.getRepository(RegionQuota);
    const quota = await quotaRepo.findOne({ where: { region, month }, lock: { mode: 'pessimistic_write' } });
    if (quota) {
      quota.usedValue = String(usedValue);
      await quotaRepo.save(quota);
    }
    logTemplate('info', 'QUOTA_RECALCULATED', { region, month, usedValue });
    return usedValue;
  }

  /**
   * 用户地区变更后对账：该用户历史活动跨多个月份，需要对“新地区”所有出现过的月份，
   * 以及配置存在的旧地区月份，按真实活动重算，杜绝占用值与活动明细漂移。
   */
  async reconcileUserRegions(manager: EntityManager, userId: number, previousRegion: string, nextRegion: string): Promise<void> {
    if (previousRegion === nextRegion) return;
    const monthRows = await manager.query(
      `SELECT DISTINCT DATE_FORMAT(a.record_date, '%Y-%m') AS month
       FROM activities a WHERE a.user_id = ?`,
      [userId]
    );
    const months: string[] = (monthRows || []).map((row: { month: string }) => row.month);
    // 旧地区：仅当配置仍存在时重算（活动已归属新地区，旧地区占用应下降）
    for (const month of months) {
      if (await manager.getRepository(RegionQuota).findOne({ where: { region: previousRegion, month } })) {
        await this.recalculateUsed(manager, previousRegion, month);
      }
    }
    // 新地区：用户活动现在归属这里，所有出现过的月份都重算
    for (const month of months) {
      await this.recalculateUsed(manager, nextRegion, month);
    }
  }

  /** 供其他服务校验月份字符串格式 */
  assertValidMonth(month: string, region = '-'): void {
    if (!isValidMonth(month)) {
      throw new AppError(ErrorCodes.QUOTA_MONTH_INVALID, `RegionQuota[region=${region}] read failed: month ${month} invalid, expected YYYY-MM`, HttpStatus.BAD_REQUEST);
    }
  }
}
