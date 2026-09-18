import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ErrorCodes } from '../constants/errorCodes';
import { RequireAuth } from '../middlewares/auth';
import { RoleGuard, Roles } from '../middlewares/roleCheck';
import { QuotaService, QuotaUpsertInput } from '../services/quotaService';
import { currentMonth } from '../utils/quotaPeriod';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

@Controller('quotas')
@UseGuards(RequireAuth, RoleGuard)
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  /** 仪表盘使用：当前登录用户所在地区的当月额度状态 */
  @Get('me')
  mine(@Req() request: Request, @Query('month') month?: string) {
    const targetMonth = month || currentMonth();
    this.quotaService.assertValidMonth(targetMonth, request.user!.region);
    return this.quotaService.status(request.user!.region, targetMonth);
  }

  /** 管理员查看额度配置，可按地区/月份过滤 */
  @Get()
  @Roles('admin')
  list(@Query('region') region?: string, @Query('month') month?: string) {
    if (month) this.quotaService.assertValidMonth(month, region || '-');
    return this.quotaService.list(region, month);
  }

  /** 管理员按月给地区设定可排放上限（整笔覆盖） */
  @Post()
  @Roles('admin')
  async upsert(@Req() request: Request, @Body() body: QuotaUpsertInput) {
    request.auditEntity = 'RegionQuota';
    request.auditAction = 'RegionQuota upsert';
    try {
      return await this.quotaService.upsert(body);
    } catch (error: any) {
      logTemplate('error', 'QUOTA_UPSERT_FAILED', { region: body?.region, field: 'RegionQuota.quota_value', reason: error.message });
      throw new AppError(error.code || ErrorCodes.VALIDATION_FAILED, `RegionQuota[region=${body?.region}] controller upsert failed: ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  /** 管理员移除某地区某月配置；移除后该地区活动恢复原有记录方式 */
  @Delete(':region/:month')
  @Roles('admin')
  remove(@Req() request: Request, @Param('region') region: string, @Param('month') month: string) {
    request.auditEntity = 'RegionQuota';
    request.auditAction = 'RegionQuota delete';
    return this.quotaService.remove(region, month);
  }
}
