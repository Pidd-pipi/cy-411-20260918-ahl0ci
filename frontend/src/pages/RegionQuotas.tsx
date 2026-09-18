import { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useRegionQuotaStore } from '../stores/regionQuotaStore';
import { useAuth } from '../hooks/useAuth';
import { Messages } from '../constants/messages';
import { formatCarbon, formatQuotaMonth } from '../utils/formatters';
import { RegionQuota } from '../types/entities';

export function RegionQuotas() {
  const [open, setOpen] = useState(false);
  const quotas = useRegionQuotaStore((state) => state.quotas);
  const loading = useRegionQuotaStore((state) => state.listLoading);
  const loadQuotas = useRegionQuotaStore((state) => state.loadQuotas);
  const save = useRegionQuotaStore((state) => state.save);
  const remove = useRegionQuotaStore((state) => state.remove);
  const [form] = Form.useForm();
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    void loadQuotas();
  }, [loadQuotas, token]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Typography.Title level={2}>地区月度额度</Typography.Title>
          <Typography.Text type="secondary">管理员按月、按地区设定可排放上限；未配置的地区保持原始记录方式。</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ month: dayjs().startOf('month'), quotaValue: 100 }); setOpen(true); }}>
          设定额度
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={quotas}
        columns={[
          { title: '地区', dataIndex: 'region' },
          { title: '月份', dataIndex: 'month', render: (value: string) => formatQuotaMonth(value) },
          { title: '排放上限', dataIndex: 'quotaValue', render: (value: string) => formatCarbon(value) },
          {
            title: '状态',
            key: 'state',
            render: () => <Tag color="processing">已配置</Tag>
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, record: RegionQuota) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => {
                    form.setFieldsValue({ region: record.region, month: dayjs(`${record.month}-01`), quotaValue: Number(record.quotaValue) });
                    setOpen(true);
                  }}
                >
                  调整
                </Button>
                <Popconfirm
                  title="移除该地区当月额度？"
                  description="移除后该地区恢复为不设上限的原始记录方式。"
                  onConfirm={async () => {
                    await remove(record.id);
                    message.success(Messages.FRONTEND_QUOTA_DELETED);
                  }}
                >
                  <Button size="small" danger>移除</Button>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
      <Modal title="设定地区月度额度" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ month: dayjs().startOf('month'), quotaValue: 100 }}
          onFinish={async (values) => {
            await save({ region: values.region, month: values.month.format('YYYY-MM'), quotaValue: values.quotaValue });
            message.success(Messages.FRONTEND_QUOTA_SAVED);
            setOpen(false);
          }}
        >
          <Form.Item name="region" label="地区" rules={[{ required: true, message: '请输入地区，如 Shanghai' }]}>
            <Input placeholder="Shanghai / Hangzhou / Beijing" />
          </Form.Item>
          <Form.Item name="month" label="月份" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quotaValue" label="月度排放上限 (kg CO2e)" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>保存额度</Button>
        </Form>
      </Modal>
    </Space>
  );
}
