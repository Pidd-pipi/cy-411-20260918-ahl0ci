import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('region_quotas')
export class RegionQuota {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ length: 64 })
  region!: string;

  @Column({ type: 'char', length: 7, comment: 'YYYY-MM' })
  month!: string;

  @Column({ name: 'quota_value', type: 'decimal', precision: 12, scale: 2 })
  quotaValue!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
