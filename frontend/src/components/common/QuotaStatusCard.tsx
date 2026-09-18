import { Card, Progress, Space, Tag, Typography } from 'antd';
import { QUOTA_STATUS_COLORS } from '../../constants/quota';
import { Messages } from '../../constants/messages';
import { QuotaStatus, RegionQuotaView } from '../../types/quota';
import { formatCarbon, formatMonth, formatQuotaStatus } from '../../utils/formatters';

interface QuotaStatusCardProps {
  quota: RegionQuotaView | null;
  loading?: boolean;
}

export function QuotaStatusCard({ quota, loading }: QuotaStatusCardProps) {
  if (!quota) {
    return (
      <Card title="地区月度排放额度" loading={loading} size="small">
        <Typography.Text type="secondary">加载中…</Typography.Text>
      </Card>
    );
  }

  if (!quota.configured) {
    return (
      <Card title={`地区月度排放额度 · ${quota.region}`} size="small">
        <Space direction="vertical" size={6}>
          <Tag color="default">{formatQuotaStatus(QuotaStatus.UNCONFIGURED)}</Tag>
          <Typography.Text type="secondary">{Messages.FRONTEND_QUOTA_UNCONFIGURED}</Typography.Text>
          <Typography.Text type="secondary" strong>{formatMonth(quota.month)}</Typography.Text>
        </Space>
      </Card>
    );
  }

  const percent = Math.min(100, Number(((quota.usedValue / Number(quota.quotaValue)) * 100).toFixed(1)));
  const overPercent = quota.status === QuotaStatus.EXCEEDED ? percent : 0;

  return (
    <Card
      title={`地区月度排放额度 · ${quota.region}`}
      size="small"
      extra={<Tag color={QUOTA_STATUS_COLORS[quota.status]}>{formatQuotaStatus(quota.status)}</Tag>}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Typography.Text type="secondary">{formatMonth(quota.month)}</Typography.Text>
        <Progress
          percent={quota.status === QuotaStatus.EXCEEDED ? 100 : percent}
          status={
            quota.status === QuotaStatus.EXCEEDED
              ? 'exception'
              : quota.status === QuotaStatus.FULL
                ? 'active'
                : 'active'
          }
          showInfo={false}
        />
        {quota.status === QuotaStatus.EXCEEDED && overPercent > 0 && (
          <Typography.Text type="danger">占用 {overPercent.toFixed(1)}% · 已超出额度</Typography.Text>
        )}
        <Space size={20} wrap>
          <span>已用 <Typography.Text strong>{formatCarbon(quota.usedValue)}</Typography.Text></span>
          <span>上限 <Typography.Text strong>{formatCarbon(quota.quotaValue)}</Typography.Text></span>
          <span>
            剩余{' '}
            <Typography.Text strong type={Number(quota.remaining) < 0 ? 'danger' : undefined}>
              {formatCarbon(quota.remaining)}
            </Typography.Text>
          </span>
        </Space>
      </Space>
    </Card>
  );
}
