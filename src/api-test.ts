#!/usr/bin/env node

/**
 * BigModel API 直连测试
 * 测试通过API直接购买而非浏览器点击
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 发现的API端点
const API_ENDPOINTS = {
  // 登录
  LOGIN: 'https://bigmodel.cn/api/auth/login',

  // 获取订阅列表（查看可用套餐）
  SUBSCRIPTION_LIST: 'https://bigmodel.cn/api/biz/subscription/list',

  // 支付预览
  PAY_PREVIEW: 'https://bigmodel.cn/api/biz/pay/batch-preview',

  // 支付相关
  PAY_HAPPY_NEW_YEAR: 'https://bigmodel.cn/api/biz/pay/happyNewYear',

  // 可能存在的订单创建API（待发现）
  // ORDER_CREATE: 'https://bigmodel.cn/api/biz/order/create',
  // PURCHASE: 'https://bigmodel.cn/api/biz/purchase',
};

async function testLogin() {
  console.log('🧪 测试登录API...');

  const username = process.env.BIGMODEL_USERNAME;
  const password = process.env.BIGMODEL_PASSWORD;

  if (!username || !password) {
    console.log('❌ 请在.env中设置账号密码');
    return null;
  }

  const payload = {
    phoneNumber: "",
    countryCode: "",
    username: username,
    smsCode: "",
    password: password,
    loginType: "password",
    grantType: "customer",
    userType: "PERSONAL",
    userCode: "",
    appId: "",
    anonymousId: ""
  };

  console.log('📤 发送登录请求...');
  console.log('URL:', API_ENDPOINTS.LOGIN);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(payload),
    });

    console.log('📥 响应状态:', response.status);
    const data = await response.json();
    console.log('📥 响应数据:', JSON.stringify(data, null, 2));

    // 提取token
    if (data.success && data.data?.access_token) {
      console.log('✅ 登录成功！获取到token');
      return data.data.access_token;
    }

    return null;
  } catch (error) {
    console.error('❌ 登录失败:', error);
    return null;
  }
}

async function testSubscriptionList(token: string) {
  console.log('\n🧪 测试获取订阅列表API...');

  try {
    const response = await fetch(API_ENDPOINTS.SUBSCRIPTION_LIST, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    console.log('📥 响应状态:', response.status);
    const data = await response.json();
    console.log('📥 订阅列表:', JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error('❌ 获取订阅列表失败:', error);
    return null;
  }
}

async function testPayPreview(token: string) {
  console.log('\n🧪 测试支付预览API...');

  const payload = {
    invitationCode: ""
  };

  try {
    const response = await fetch(API_ENDPOINTS.PAY_PREVIEW, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(payload),
    });

    console.log('📥 响应状态:', response.status);
    const data = await response.json();
    console.log('📥 支付预览:', JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error('❌ 支付预览失败:', error);
    return null;
  }
}

async function discoverPurchaseApi(token: string) {
  console.log('\n🔍 尝试发现购买API...');

  // 可能的购买API端点
  const possibleEndpoints = [
    'https://bigmodel.cn/api/biz/order/create',
    'https://bigmodel.cn/api/biz/order/submit',
    'https://bigmodel.cn/api/biz/purchase',
    'https://bigmodel.cn/api/biz/subscription/purchase',
    'https://bigmodel.cn/api/biz/subscription/create',
    'https://bigmodel.cn/api/biz/pay/create',
    'https://bigmodel.cn/api/v1/order/create',
    'https://bigmodel.cn/api/v2/order/create',
    'https://open.bigmodel.cn/api/biz/order/create',
    'https://open.bigmodel.cn/api/biz/purchase',
  ];

  for (const endpoint of possibleEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status !== 404) {
        console.log(`✅ 发现可能的API: ${endpoint} (状态: ${response.status})`);
      }
    } catch (e) {
      // 忽略错误
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔧 BigModel API 直连测试');
  console.log('='.repeat(60));

  // 步骤1: 登录获取token
  const token = await testLogin();

  if (!token) {
    console.log('\n❌ 无法获取token，测试终止');
    return;
  }

  // 步骤2: 获取订阅列表
  const subscriptions = await testSubscriptionList(token);

  // 步骤3: 支付预览
  const preview = await testPayPreview(token);

  // 步骤4: 尝试发现购买API
  await discoverPurchaseApi(token);

  console.log('\n' + '='.repeat(60));
  console.log('✅ API测试完成');
  console.log('='.repeat(60));

  // 输出发现的API列表
  console.log('\n📋 已确认的API端点:');
  Object.entries(API_ENDPOINTS).forEach(([name, url]) => {
    console.log(`  ${name}: ${url}`);
  });

  console.log('\n💡 下一步建议:');
  console.log('  1. 在10:00抢购时段抓包，捕获购买按钮可点击时的API');
  console.log('  2. 分析前端JS代码，查找隐藏的API端点');
  console.log('  3. 使用浏览器DevTools的"Sources"面板，搜索"purchase"、"order"关键词');
}

main().catch(console.error);
