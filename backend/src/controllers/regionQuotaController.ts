import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { RequireAuth } from '../middlewares/auth';
import { RoleGuard, Roles } from '../middlewares/roleCheck';
import { RegionQuotaInput, RegionQuotaService } from '../services/regionQuotaService';
import { ErrorCodes } from '../constants/errorCodes';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';

@Controller('region-quotas')
@UseGuards(RequireAuth, RoleGuard)
export class RegionQuotaController {
  constructor(private readonly regionQuotaService: RegionQuotaService) {}

  // Members read the current month status of their own region for the dashboard.
  @Get('status')
  status(@Req() request: Request, @Query('month') month?: string) {
    return this.regionQuotaService.getStatus(request.user!.region, month);
  }

  @Get()
  @Roles('admin')
  list(@Query('region') region?: string, @Query('month') month?: string) {
    return this.regionQuotaService.list(region, month);
  }

  @Post()
  @Roles('admin')
  async upsert(@Req() request: Request, @Body() body: RegionQuotaInput) {
    request.auditEntity = 'RegionQuota';
    request.auditAction = 'RegionQuota upsert';
    try {
      const result = await this.regionQuotaService.upsert(body);
      request.auditEntityId = Number(result.quota.id);
      return result;
    } catch (error: any) {
      logTemplate('error', 'REGION_QUOTA_CREATE_FAILED', { region: body?.region, field: 'RegionQuota.quota_value', reason: error.message });
      throw new AppError(error.code || ErrorCodes.VALIDATION_FAILED, `RegionQuota[region=${body?.region}] controller upsert failed: ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Req() request: Request, @Param('id') id: string) {
    request.auditEntity = 'RegionQuota';
    request.auditEntityId = Number(id);
    request.auditAction = 'RegionQuota delete';
    return this.regionQuotaService.remove(Number(id));
  }
}
