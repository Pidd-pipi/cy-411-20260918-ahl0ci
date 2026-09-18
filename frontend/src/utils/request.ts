import axios from 'axios';
import { message } from 'antd';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { useAuthStore } from '../stores/authStore';

export const request = axios.create({
  baseURL: '/api',
  timeout: 12000
});

request.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const code: string | undefined = error.response?.data?.code;
    const serverMessage: string | undefined = error.response?.data?.message;
    // 额度超限：失败方必须明确看到“超限”原因，而不是通用请求失败
    if (code === ErrorCodes.QUOTA_EXCEEDED) {
      message.error(`${Messages.FRONTEND_QUOTA_REJECTED}：${serverMessage || '地区当月额度不足'}`);
    } else {
      message.error(serverMessage || error.message || '请求失败');
    }
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
