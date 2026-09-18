import { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { QUOTA_STATUS_COLORS } from '../constants/quota';
import { Messages } from '../constants/messages';
import { QuotaStatus, RegionQuotaView } from '../types/quota';
import { useAuth } from '../hooks/useAuth';
import { useQuotaStore } from '../stores/quotaStore';
import { formatCarbon, formatMonth, formatQuotaStatus } from '../utils/formatters';

const REGION_OPTIONS = ['Shanghai', 'Hangzhou', 'Beijing'];

export function Quotas() {
  const [open, setOpen] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string | undefined>();
  const rows = useQuotaStore((state) => state.rows);
  const loading = useQuotaStore((state) => state.loading);
  const loadAll = useQuotaStore((state) => state.loadAll);
  const save = useQuotaStore((state) => state.save);
  const remove = useQuotaStore((state) => state.remove);
  const { token } = useAuth();

  const refresh = () => {
    void loadAll(regionFilter ? { region: regionFilter } : undefined);
  };

  useEffect(() => {
    if (!token) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, token]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Typography.Title level={2}>地区月度额度</Typography.Title>
          <Typography.Text type="secondary">管理员按月为地区设定可排放上限，成员写入按真实核算占用，超限整笔拒绝。</Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>设定额度</Button>
        </Space>
      </Space>

      <Select
        allowClear
        placeholder="按地区筛选"
        value={regionFilter}
        onChange={setRegionFilter}
        style={{ width: 220 }}
        options={REGION_OPTIONS.map((value) => ({ value, label: value }))}
      />

      <Card>
        <Table<RegionQuotaView>
          rowKey={(row) => `${row.region}-${row.month}`}
          loading={loading}
          dataSource={rows}
          pagination={false}
          columns={[
            { title: '地区', dataIndex: 'region' },
            { title: '月份', dataIndex: 'month', render: formatMonth },
            { title: '上限', dataIndex: 'quotaValue', render: (value: number | null) => formatCarbon(value) },
            { title: '已用', dataIndex: 'usedValue', render: formatCarbon },
            {
              title: '剩余',
              dataIndex: 'remaining',
              render: (value: number | null) => (
                <Typography.Text type={Number(value) < 0 ? 'danger' : undefined}>{formatCarbon(value)}</Typography.Text>
              )
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (status: QuotaStatus) => <Tag color={QUOTA_STATUS_COLORS[status]}>{formatQuotaStatus(status)}</Tag>
            },
            {
              title: '操作',
              key: 'actions',
              render: (_, record) => (
                <Popconfirm
                  title="移除该地区当月额度配置？"
                  description="移除后该地区活动将恢复原有记录方式。"
                  onConfirm={async () => {
                    await remove(record.region, record.month);
                    message.success(Messages.FRONTEND_QUOTA_DELETED);
                    refresh();
                  }}
                >
                  <Button size="small" danger>移除配置</Button>
                </Popconfirm>
              )
            }
          ]}
        />
      </Card>

      <ModalQuotaForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          refresh();
        }}
        save={save}
      />
    </Space>
  );
}

interface ModalQuotaFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  save: ReturnType<typeof useQuotaStore.getState>['save'];
}

function ModalQuotaForm({ open, onClose, onSaved, save }: ModalQuotaFormProps) {
  const [form] = Form.useForm();
  return (
    <Modal title="设定地区月度额度" open={open} onCancel={onClose} footer={null} destroyOnClose>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ region: 'Shanghai', month: dayjs(), quotaValue: 100 }}
        onFinish={async (values) => {
          await save({
            region: values.region,
            month: values.month.format('YYYY-MM'),
            quotaValue: Number(values.quotaValue)
          });
          message.success(Messages.FRONTEND_QUOTA_SAVED);
          form.resetFields();
          onSaved();
        }}
      >
        <Form.Item name="region" label="地区" rules={[{ required: true }]}>
          <Select options={REGION_OPTIONS.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="month" label="月份" rules={[{ required: true }]}>
          <DatePicker picker="month" style={{ width: '100%' }} allowClear={false} />
        </Form.Item>
        <Form.Item name="quotaValue" label="可排放上限（kg CO2e）" rules={[{ required: true, type: 'number', min: 0 }]}>
          <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="例如 100" />
        </Form.Item>
        <Typography.Paragraph type="secondary">保存后按该地区当月真实活动重算占用值；若已超上限，新写入将被整笔拒绝。</Typography.Paragraph>
        <Button type="primary" htmlType="submit" block>保存额度</Button>
      </Form>
    </Modal>
  );
}
