import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('region_quotas')
@Index('uk_quota_region_month', ['region', 'month'], { unique: true })
export class RegionQuota {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ length: 64 })
  region!: string;

  /** 额度所属月份，格式 YYYY-MM */
  @Column({ type: 'char', length: 7 })
  month!: string;

  @Column({ name: 'quota_value', type: 'decimal', precision: 12, scale: 2 })
  quotaValue!: string;

  /** 该地区当月已占用排放，与 activities 实际核算结果同步增减 */
  @Column({ name: 'used_value', type: 'decimal', precision: 12, scale: 2, default: 0 })
  usedValue!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
