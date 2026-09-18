import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { EntityManager, Repository } from 'typeorm';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { Activity } from '../models/activity';
import { RegionQuota } from '../models/regionQuota';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

export interface RegionQuotaInput {
  region: string;
  month: string;
  quotaValue: number;
}

export interface RegionQuotaStatus {
  region: string;
  month: string;
  configured: boolean;
  quotaValue: number | null;
  usedValue: number;
  remainingValue: number | null;
  exceeded: boolean;
}

@Injectable()
export class RegionQuotaService {
  constructor(
    @InjectRepository(RegionQuota) private readonly quotaRepo: Repository<RegionQuota>,
    @InjectRepository(Activity) private readonly activityRepo: Repository<Activity>
  ) {}

  async list(region?: string, month?: string) {
    logTemplate('info', 'REGION_QUOTA_LIST_START', { region: region || 'all', month: month || 'all' });
    return this.quotaRepo.find({
      where: {
        ...(region ? { region } : {}),
        ...(month ? { month } : {})
      },
      order: { month: 'DESC', region: 'ASC' }
    });
  }

  async findLocked(manager: EntityManager, region: string, month: string): Promise<RegionQuota | null> {
    return manager.getRepository(RegionQuota).findOne({
      where: { region, month },
      lock: { mode: 'pessimistic_write' }
    });
  }

  /** Lock the activity row so concurrent edits/deletes of the same record serialise. */
  async lockActivity(manager: EntityManager, id: number): Promise<Activity | null> {
    return manager.getRepository(Activity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  /**
   * Exact usage for a region/month. Usage is always derived from the activity ledger
   * (joined against the user's current region), never from a drifting counter.
   * Inside a transaction the activity rows can be locked with the quota row so that
   * concurrent writers in the same region/month serialise completely.
   */
  async sumUsed(manager: EntityManager, region: string, month: string, lockActivities = false): Promise<number> {
    // Use the calendar's real last day: a literal like 'YYYY-MM-31' becomes an
    // invalid DATE for February/30-day months and would corrupt the range.
    const start = dayjs(`${month}-01`).startOf('month').format('YYYY-MM-DD');
    const end = dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');
    let builder = manager
      .getRepository(Activity)
      .createQueryBuilder('activity')
      .innerJoin('activity.user', 'user')
      .where('user.region = :region', { region })
      .andWhere('activity.record_date BETWEEN :start AND :end', { start, end });
    if (lockActivities) {
      builder = builder.setLock('pessimistic_write');
    }
    const row = await builder
      .select('COALESCE(ROUND(SUM(activity.carbon_value), 2), 0)', 'total')
      .getRawOne<{ total: string | number | null }>();
    return Number(Number(row?.total ?? 0).toFixed(2));
  }

  /**
   * Reserve capacity inside the caller's transaction. `delta` is the exact ledger
   * change this write produces (positive for added usage, negative for usage freed).
   * When a quota exists the whole write is rejected the moment the ledger would move
   * beyond the cap — no partial application is allowed.
   */
  async reserve(manager: EntityManager, region: string, month: string, delta: number): Promise<void> {
    const quota = await this.findLocked(manager, region, month);
    if (!quota) {
      logTemplate('info', 'REGION_QUOTA_UNCONFIGURED', { region, month });
      return;
    }
    const used = await this.sumUsed(manager, region, month, true);
    const next = Number((used + delta).toFixed(2));
    const cap = Number(quota.quotaValue);
    logTemplate('info', 'REGION_QUOTA_RESERVE_START', {
      region,
      month,
      delta: Number(delta.toFixed(2)),
      carbonValue: next
    });
    if (next > cap) {
      logTemplate('error', 'REGION_QUOTA_EXCEEDED', {
        region,
        month,
        used,
        quotaValue: cap,
        requested: next
      });
      throw new AppError(
        ErrorCodes.REGION_QUOTA_EXCEEDED,
        `RegionQuota[region=${region}] month=${month} exceeded: used ${used} + requested would reach ${next}, cap is ${cap} kg CO2e`,
        HttpStatus.CONFLICT
      );
    }
  }

  async getStatus(region: string, month?: string): Promise<RegionQuotaStatus> {
    const targetMonth = month || dayjs().format('YYYY-MM');
    const quota = await this.quotaRepo.findOne({ where: { region, month: targetMonth } });
    const usedValue = await this.sumUsed(this.activityRepo.manager, region, targetMonth);
    if (!quota) {
      logTemplate('info', 'REGION_QUOTA_UNCONFIGURED', { region, month: targetMonth });
      return {
        region,
        month: targetMonth,
        configured: false,
        quotaValue: null,
        usedValue,
        remainingValue: null,
        exceeded: false
      };
    }
    const quotaValue = Number(quota.quotaValue);
    logTemplate('info', 'REGION_QUOTA_STATUS', { region, month: targetMonth, used: usedValue, quotaValue });
    return {
      region,
      month: targetMonth,
      configured: true,
      quotaValue,
      usedValue,
      remainingValue: Number((quotaValue - usedValue).toFixed(2)),
      exceeded: usedValue > quotaValue
    };
  }

  async upsert(input: RegionQuotaInput) {
    logTemplate('info', 'REGION_QUOTA_CREATE_START', { region: input.region, month: input.month, quotaValue: input.quotaValue });
    const month = this.normalizeMonth(input.month);
    if (!input.region || !input.region.trim()) {
      logTemplate('warn', 'REGION_QUOTA_CREATE_FAILED', { region: input.region, field: 'RegionQuota.region', reason: 'empty' });
      throw new AppError(ErrorCodes.REGION_QUOTA_INVALID, `RegionQuota[region=${input.region}] upsert failed: region invalid`);
    }
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !dayjs(`${month}-01`).isValid()) {
      logTemplate('warn', 'REGION_QUOTA_CREATE_FAILED', { region: input.region, field: 'RegionQuota.month', reason: 'invalid YYYY-MM' });
      throw new AppError(ErrorCodes.REGION_QUOTA_INVALID, `RegionQuota[month=${input.month}] upsert failed: month must be YYYY-MM`);
    }
    if (!(Number(input.quotaValue) >= 0)) {
      logTemplate('warn', 'REGION_QUOTA_CREATE_FAILED', { region: input.region, field: 'RegionQuota.quota_value', reason: 'negative' });
      throw new AppError(ErrorCodes.REGION_QUOTA_INVALID, `RegionQuota[region=${input.region}] upsert failed: quota_value must be non-negative`);
    }
    const existing = await this.quotaRepo.findOne({ where: { region: input.region, month } });
    if (existing) {
      existing.quotaValue = String(input.quotaValue);
      const saved = await this.quotaRepo.save(existing);
      logTemplate('info', 'REGION_QUOTA_CREATE_SUCCESS', { id: saved.id, region: saved.region, month: saved.month, quotaValue: saved.quotaValue });
      return { message: Messages.REGION_QUOTA_SAVED, quota: saved };
    }
    const saved = await this.quotaRepo.save(
      this.quotaRepo.create({ region: input.region, month, quotaValue: String(input.quotaValue) })
    );
    logTemplate('info', 'REGION_QUOTA_CREATE_SUCCESS', { id: saved.id, region: saved.region, month: saved.month, quotaValue: saved.quotaValue });
    return { message: Messages.REGION_QUOTA_SAVED, quota: saved };
  }

  async remove(id: number) {
    const quota = await this.quotaRepo.findOne({ where: { id } });
    if (!quota) {
      throw new AppError(ErrorCodes.REGION_QUOTA_NOT_FOUND, `RegionQuota[id=${id}] delete failed: id not found`, HttpStatus.NOT_FOUND);
    }
    await this.quotaRepo.remove(quota);
    logTemplate('info', 'REGION_QUOTA_DELETE_SUCCESS', { id, region: quota.region, month: quota.month });
    return { message: Messages.REGION_QUOTA_DELETED };
  }

  async removeByRegionMonth(region: string, month: string) {
    const quota = await this.quotaRepo.findOne({ where: { region, month } });
    if (!quota) {
      throw new AppError(
        ErrorCodes.REGION_QUOTA_NOT_FOUND,
        `RegionQuota[region=${region}] delete failed: month ${month} not found`,
        HttpStatus.NOT_FOUND
      );
    }
    await this.quotaRepo.remove(quota);
    logTemplate('info', 'REGION_QUOTA_DELETE_SUCCESS', { id: quota.id, region, month });
    return { message: Messages.REGION_QUOTA_DELETED };
  }

  private normalizeMonth(month: string): string {
    if (!month) return '';
    const parsed = dayjs(month.length === 7 ? `${month}-01` : month);
    return parsed.isValid() ? parsed.format('YYYY-MM') : '';
  }
}
