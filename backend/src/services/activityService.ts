import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Between, DataSource, Repository } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { Activity } from '../models/activity';
import { AppError } from '../utils/AppError';
import { calculateCarbonValue } from '../utils/carbonCalculator';
import { logTemplate } from '../utils/logger';
import { runSerializableTransaction } from '../utils/transaction';
import { FactorService } from './factorService';
import { RegionQuotaService } from './regionQuotaService';
import { UserService } from './userService';

export interface ActivityInput {
  category: ActivityCategory;
  subType: string;
  amount: number;
  unit: string;
  recordDate: string;
  note?: string;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity) private readonly activityRepo: Repository<Activity>,
    private readonly factorService: FactorService,
    private readonly userService: UserService,
    private readonly regionQuotaService: RegionQuotaService,
    private readonly dataSource: DataSource
  ) {}

  async list(userId: number, category?: ActivityCategory, start?: string, end?: string) {
    logTemplate('info', 'ACTIVITY_LIST_START');
    return this.activityRepo.find({
      where: {
        userId,
        ...(category ? { category } : {}),
        ...(start && end ? { recordDate: Between(start, end) } : {})
      },
      relations: ['factor'],
      order: { recordDate: 'DESC', id: 'DESC' }
    });
  }

  async create(userId: number, input: ActivityInput) {
    logTemplate('info', 'ACTIVITY_CREATE_START', { userId, category: input.category, subType: input.subType });
    if (!Object.values(ActivityCategory).includes(input.category)) {
      logTemplate('warn', 'ACTIVITY_CREATE_FAILED', { id: 0, field: 'Activity.category', reason: 'invalid enum' });
      throw new AppError(ErrorCodes.ACTIVITY_CATEGORY_INVALID, `Activity[id=0] create failed: category invalid`);
    }
    const user = await this.userService.findById(userId);
    const factor = await this.factorService.findMatching(input.category, input.subType, user.region);
    const carbonValue = calculateCarbonValue({ category: input.category, amount: Number(input.amount), factorValue: Number(factor.factorValue) });
    const activity = this.activityRepo.create({
      userId,
      factorId: Number(factor.id),
      category: input.category,
      subType: input.subType,
      amount: String(input.amount),
      unit: input.unit,
      carbonValue: String(carbonValue),
      recordDate: dayjs(input.recordDate).format('YYYY-MM-DD'),
      note: input.note || null
    });
    const month = dayjs(activity.recordDate).format('YYYY-MM');
    // Reserve the whole ledger delta under a row lock first; the activity is only
    // inserted when the region/month cap still has room, otherwise the tx rolls back.
    const saved = await runSerializableTransaction(this.dataSource, async (manager) => {
      await this.regionQuotaService.reserve(manager, user.region, month, carbonValue);
      return manager.getRepository(Activity).save(activity);
    });
    logTemplate('info', 'ACTIVITY_CREATE_SUCCESS', { id: saved.id, carbonValue });
    return { message: Messages.ACTIVITY_CREATED, activity: saved };
  }

  async update(userId: number, id: number, input: Partial<ActivityInput>) {
    logTemplate('info', 'ACTIVITY_UPDATE_START', { id, fields: Object.keys(input).join(',') });
    const existing = await this.activityRepo.findOne({ where: { id, userId } });
    if (!existing) {
      logTemplate('warn', 'ACTIVITY_UPDATE_FAILED', { id, field: 'Activity.id', reason: 'not found' });
      throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] update failed: id not found`, HttpStatus.NOT_FOUND);
    }
    const nextCategory = input.category ?? existing.category;
    const nextSubType = input.subType ?? existing.subType;
    const nextAmount = Number(input.amount ?? existing.amount);
    const user = await this.userService.findById(userId);
    const factor = await this.factorService.findMatching(nextCategory, nextSubType, user.region);
    const carbonValue = calculateCarbonValue({ category: nextCategory, amount: nextAmount, factorValue: Number(factor.factorValue) });
    const nextRecordDate = input.recordDate ? dayjs(input.recordDate).format('YYYY-MM-DD') : existing.recordDate;
    const saved = await runSerializableTransaction(this.dataSource, async (manager) => {
      // Re-read under a row lock so concurrent edits of the same record cannot
      // double-count or lose quota capacity.
      const activity = await this.regionQuotaService.lockActivity(manager, id);
      if (!activity) {
        throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] update failed: id not found`, HttpStatus.NOT_FOUND);
      }
      const oldCarbon = Number(activity.carbonValue);
      const oldMonth = dayjs(activity.recordDate).format('YYYY-MM');
      const newMonth = dayjs(nextRecordDate).format('YYYY-MM');
      if (oldMonth === newMonth) {
        await this.regionQuotaService.reserve(manager, user.region, newMonth, Number((carbonValue - oldCarbon).toFixed(2)));
      } else {
        // Lock both monthly buckets in a stable month order to avoid deadlocks;
        // free the old month, then reserve the new month against its own cap.
        const [firstMonth] = [oldMonth, newMonth].sort();
        if (firstMonth === oldMonth) {
          await this.regionQuotaService.reserve(manager, user.region, oldMonth, Number((-oldCarbon).toFixed(2)));
          await this.regionQuotaService.reserve(manager, user.region, newMonth, carbonValue);
        } else {
          await this.regionQuotaService.reserve(manager, user.region, newMonth, carbonValue);
          await this.regionQuotaService.reserve(manager, user.region, oldMonth, Number((-oldCarbon).toFixed(2)));
        }
      }
      activity.category = nextCategory;
      activity.subType = nextSubType;
      activity.amount = String(nextAmount);
      activity.unit = input.unit ?? activity.unit;
      activity.factorId = Number(factor.id);
      activity.carbonValue = String(carbonValue);
      activity.recordDate = nextRecordDate;
      activity.note = input.note ?? activity.note;
      const result = await manager.getRepository(Activity).save(activity);
      logTemplate('info', 'ACTIVITY_UPDATE_SUCCESS', { id: result.id, carbonValue });
      return result;
    });
    return { message: Messages.ACTIVITY_UPDATED, activity: saved };
  }

  async remove(userId: number, id: number) {
    const existing = await this.activityRepo.findOne({ where: { id, userId } });
    if (!existing) {
      throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] delete failed: id not found`, HttpStatus.NOT_FOUND);
    }
    const user = await this.userService.findById(userId);
    await runSerializableTransaction(this.dataSource, async (manager) => {
      // Lock the row, then serialise against concurrent writes of the same
      // region/month; freeing capacity (negative delta) never rejects.
      const activity = await this.regionQuotaService.lockActivity(manager, id);
      if (!activity) {
        throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] delete failed: id not found`, HttpStatus.NOT_FOUND);
      }
      const month = dayjs(activity.recordDate).format('YYYY-MM');
      await this.regionQuotaService.reserve(manager, user.region, month, Number((-Number(activity.carbonValue)).toFixed(2)));
      await manager.getRepository(Activity).remove(activity);
    });
    logTemplate('info', 'ACTIVITY_DELETE_SUCCESS', { id });
    return { message: Messages.ACTIVITY_DELETED };
  }

  async summarize(userId: number, start: string, end: string) {
    const rows = await this.list(userId, undefined, start, end);
    const total = rows.reduce((sum, row) => sum + Number(row.carbonValue), 0);
    const byCategory = Object.values(ActivityCategory).map((category) => ({
      category,
      value: rows.filter((row) => row.category === category).reduce((sum, row) => sum + Number(row.carbonValue), 0)
    }));
    return { total: Number(total.toFixed(2)), byCategory, rows };
  }
}
