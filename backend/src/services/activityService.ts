import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Between, DataSource, Repository } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { Activity } from '../models/activity';
import { AppError } from '../utils/AppError';
import { calculateCarbonValue } from '../utils/carbonCalculator';
import { logTemplate } from '../utils/logger';
import { monthOfRecordDate } from '../utils/quotaPeriod';
import { FactorService } from './factorService';
import { QuotaService } from './quotaService';
import { UserService } from './userService';

export interface ActivityInput {
  category: ActivityCategory;
  subType: string;
  amount: number;
  unit: string;
  recordDate: string;
  note?: string;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity) private readonly activityRepo: Repository<Activity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly factorService: FactorService,
    private readonly userService: UserService,
    private readonly quotaService: QuotaService
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
    const recordDate = dayjs(input.recordDate).format('YYYY-MM-DD');

    const saved = await this.dataSource.transaction(async (manager) => {
      // 先锁额度行核对占用：超出则抛错整笔回滚，绝不留下活动记录
      await this.quotaService.reserveInTx(manager, user.region, recordDate, carbonValue);
      const activity = manager.getRepository(Activity).create({
        userId,
        factorId: Number(factor.id),
        category: input.category,
        subType: input.subType,
        amount: String(input.amount),
        unit: input.unit,
        carbonValue: String(carbonValue),
        recordDate,
        note: input.note || null
      });
      return manager.getRepository(Activity).save(activity);
    });
    logTemplate('info', 'ACTIVITY_CREATE_SUCCESS', { id: saved.id, carbonValue });
    return { message: Messages.ACTIVITY_CREATED, activity: saved };
  }

  async update(userId: number, id: number, input: Partial<ActivityInput>) {
    logTemplate('info', 'ACTIVITY_UPDATE_START', { id, fields: Object.keys(input).join(',') });
    const user = await this.userService.findById(userId);

    const saved = await this.dataSource.transaction(async (manager) => {
      // 统一加锁顺序：先额度行（按月份升序），后活动行，避免与新增/删除并发时反向加锁死锁
      const existing = await manager.getRepository(Activity).findOne({ where: { id, userId } });
      if (!existing) {
        logTemplate('warn', 'ACTIVITY_UPDATE_FAILED', { id, field: 'Activity.id', reason: 'not found' });
        throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] update failed: id not found`, HttpStatus.NOT_FOUND);
      }
      const tentativeNextDate = input.recordDate ? dayjs(input.recordDate).format('YYYY-MM-DD') : existing.recordDate;
      await this.quotaService.lockMonthsInTx(manager, user.region, [monthOfRecordDate(existing.recordDate), monthOfRecordDate(tentativeNextDate)]);

      // 额度行锁定后再锁活动行，保证同一记录并发修改读到的旧 carbon_value / record_date 始终一致
      const activity = await manager.getRepository(Activity).findOne({
        where: { id, userId },
        lock: { mode: 'pessimistic_write' }
      });
      if (!activity) {
        logTemplate('warn', 'ACTIVITY_UPDATE_FAILED', { id, field: 'Activity.id', reason: 'not found after lock' });
        throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] update failed: id not found`, HttpStatus.NOT_FOUND);
      }

      const nextCategory = input.category ?? activity.category;
      const nextSubType = input.subType ?? activity.subType;
      const nextAmount = Number(input.amount ?? activity.amount);
      const factor = await this.factorService.findMatching(nextCategory, nextSubType, user.region);
      const carbonValue = calculateCarbonValue({ category: nextCategory, amount: nextAmount, factorValue: Number(factor.factorValue) });
      const nextRecordDate = input.recordDate ? dayjs(input.recordDate).format('YYYY-MM-DD') : activity.recordDate;

      // 变更前核算值与所属月份，用于同步回退旧占用
      const previousCarbonValue = Number(activity.carbonValue);
      const previousMonth = monthOfRecordDate(activity.recordDate);
      const nextMonth = monthOfRecordDate(nextRecordDate);

      if (previousMonth === nextMonth) {
        // 同月：reserveInTx 内部对正增量拦截、对负增量直接释放
        await this.quotaService.reserveInTx(manager, user.region, nextRecordDate, round2(carbonValue - previousCarbonValue));
      } else {
        // 跨月：先在新月份按整笔预留（超限则整笔回滚），再释放旧月份整笔
        await this.quotaService.reserveInTx(manager, user.region, nextRecordDate, carbonValue);
        await this.quotaService.releaseInTx(manager, user.region, activity.recordDate, previousCarbonValue);
      }

      activity.category = nextCategory;
      activity.subType = nextSubType;
      activity.amount = String(nextAmount);
      activity.unit = input.unit ?? activity.unit;
      activity.factorId = Number(factor.id);
      activity.carbonValue = String(carbonValue);
      activity.recordDate = nextRecordDate;
      activity.note = input.note ?? activity.note;
      return manager.getRepository(Activity).save(activity);
    });
    logTemplate('info', 'ACTIVITY_UPDATE_SUCCESS', { id: saved.id, carbonValue: saved.carbonValue });
    return { message: Messages.ACTIVITY_UPDATED, activity: saved };
  }

  async remove(userId: number, id: number) {
    const user = await this.userService.findById(userId);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Activity);
      const existing = await repo.findOne({ where: { id, userId } });
      if (!existing) {
        throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] delete failed: id not found`, HttpStatus.NOT_FOUND);
      }
      // 与新增/修改保持“先额度行、后活动行”的统一加锁顺序，杜绝并发跨操作死锁
      await this.quotaService.lockMonthsInTx(manager, user.region, [monthOfRecordDate(existing.recordDate)]);
      const locked = await repo.findOne({ where: { id, userId }, lock: { mode: 'pessimistic_write' } });
      if (!locked) {
        throw new AppError(ErrorCodes.ACTIVITY_NOT_FOUND, `Activity[id=${id}] delete failed: id not found`, HttpStatus.NOT_FOUND);
      }
      const releasedCarbonValue = Number(locked.carbonValue);
      await repo.remove(locked);
      await this.quotaService.releaseInTx(manager, user.region, locked.recordDate, releasedCarbonValue);
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
