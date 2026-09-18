import { Alert, Card, Col, Progress, Row, Statistic, Tag, Typography } from 'antd';
import { RegionQuotaStatus as RegionQuotaStatusType } from '../../types/entities';
import { formatCarbon, formatQuotaMonth, formatQuotaStatus } from '../../utils/formatters';
import { Messages } from '../../constants/messages';

interface RegionQuotaCardProps {
  status: RegionQuotaStatusType | null;
  loading?: boolean;
}

export function RegionQuotaCard({ status, loading }: RegionQuotaCardProps) {
  if (!status) {
    return (
      <Card title="地区月度排放额度" loading={loading}>
        <Typography.Text type="secondary">暂无额度数据</Typography.Text>
      </Card>
    );
  }

  if (!status.configured) {
    return (
      <Card title={`地区月度排放额度 · ${status.region} · ${formatQuotaMonth(status.month)}`} loading={loading}>
        <Alert type="info" showIcon message={Messages.FRONTEND_QUOTA_UNCONFIGURED} />
        <Statistic title="当月真实已用" value={formatCarbon(status.usedValue)} style={{ marginTop: 12 }} />
      </Card>
    );
  }

  const percent = status.quotaValue ? Math.min(100, Number(((status.usedValue / status.quotaValue) * 100).toFixed(1))) : 0;
  const strokeColor = status.exceeded ? '#cf1322' : percent >= 90 ? '#d48806' : '#389e0d';
  const quotaValue = status.quotaValue ?? 0;
  const remainingValue = status.remainingValue ?? 0;

  return (
    <Card
      title={`地区月度排放额度 · ${status.region} · ${formatQuotaMonth(status.month)}`}
      loading={loading}
      extra={
        <Tag color={status.exceeded ? 'error' : 'success'}>{formatQuotaStatus(status.configured, status.exceeded)}</Tag>
      }
    >
      <Row gutter={16}>
        <Col span={8}><Statistic title="当月已用" value={formatCarbon(status.usedValue)} /></Col>
        <Col span={8}><Statistic title="额度上限" value={formatCarbon(quotaValue)} /></Col>
        <Col span={8}><Statistic title="剩余额度" value={formatCarbon(remainingValue)} valueStyle={{ color: status.exceeded ? '#cf1322' : undefined }} /></Col>
      </Row>
      <Progress percent={percent} status={status.exceeded ? 'exception' : 'active'} strokeColor={strokeColor} style={{ marginTop: 12 }} />
      {status.exceeded && <Alert type="error" showIcon message={Messages.FRONTEND_QUOTA_EXCEEDED_HINT} />}
    </Card>
  );
}
