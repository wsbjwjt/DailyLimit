import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type PlanType = 'lite' | 'pro' | 'max';
export type CycleType = 'monthly' | 'quarterly' | 'yearly';

export interface Config {
  username: string;
  password: string;
  defaultPlan: PlanType;
  defaultCycle: CycleType;
}

export function loadConfig(): Config {
  const username = process.env.BIGMODEL_USERNAME || '';
  const password = process.env.BIGMODEL_PASSWORD || '';

  if (!username || !password) {
    throw new Error(
      '请设置环境变量 BIGMODEL_USERNAME 和 BIGMODEL_PASSWORD\n' +
      '复制 .env.example 为 .env 并填写账号密码'
    );
  }

  const validPlan = (process.env.DEFAULT_PLAN || 'pro').toLowerCase();
  const validCycle = (process.env.DEFAULT_CYCLE || 'quarterly').toLowerCase();

  return {
    username,
    password,
    defaultPlan: ['lite', 'pro', 'max'].includes(validPlan)
      ? (validPlan as 'lite' | 'pro' | 'max')
      : 'pro',
    defaultCycle: ['monthly', 'quarterly', 'yearly'].includes(validCycle)
      ? (validCycle as 'monthly' | 'quarterly' | 'yearly')
      : 'quarterly',
  };
}

export function validatePlan(plan: string): plan is 'lite' | 'pro' | 'max' {
  return ['lite', 'pro', 'max'].includes(plan.toLowerCase());
}

export function validateCycle(cycle: string): cycle is 'monthly' | 'quarterly' | 'yearly' {
  return ['monthly', 'quarterly', 'yearly'].includes(cycle.toLowerCase());
}
