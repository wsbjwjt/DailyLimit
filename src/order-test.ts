#!/usr/bin/env node

/**
 * 订单API测试
 * 尝试直接通过API创建订单
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'https://bigmodel.cn';

// 产品ID映射（根据API返回的数据）
const PRODUCTS = {
  // Lite套餐
  LITE_MONTHLY: 'product-02434c',     // 连续包月 ￥49
  LITE_QUARTERLY: 'product-b8ea38',   // 连续包季 ￥132.3
  LITE_YEARLY: 'product-70a804',      // 连续包年 ￥470.4

  // Pro套餐
  PRO_MONTHLY: 'product-1df3e1',      // 连续包月 ￥149
  PRO_QUARTERLY: 'product-fef82f',    // 连续包季 ￥402.3
  PRO_YEARLY: 'product-5643e6',       // 连续包年 ￥1430.4

  // Max套餐
  MAX_MONTHLY: 'product-2fc421',      // 连续包月 ￥469
  MAX_QUARTERLY: 'product-5d3a03',    // 连续包季 ￥1266.3
  MAX_YEARLY: 'product-d46f8b',       // 连续包年 ￥4502.4
};

async function login(): Promise<string | null> {
  console.log('🔐 正在登录...');

  const username = process.env.BIGMODEL_USERNAME;
  const password = process.env.BIGMODEL_PASSWORD;

  if (!username || !password) {
    console.log('❌ 请在.env中设置账号密码');
    return null;
  }

  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: JSON.stringify({
      username,
      password,
      loginType: 'password',
      grantType: 'customer',
      userType: 'PERSONAL',
    }),
  });

  const data = await response.json();

  if (data.success && data.data?.access_token) {
    console.log('✅ 登录成功');
    return data.data.access_token;
  }

  console.log('❌ 登录失败:', data.msg);
  return null;
}

async function testOrderCreate(token: string, productId: string) {
  console.log(`\n🧪 测试订单创建API - 产品: ${productId}`);

  const endpoints = [
    `${API_BASE}/api/biz/order/create`,
    `${API_BASE}/api/biz/order/submit`,
    `${API_BASE}/api/v1/order/create`,
    `${API_BASE}/api/v2/order/create`,
    `${API_BASE}/api/biz/subscription/purchase`,
    `${API_BASE}/api/biz/subscription/create`,
  ];

  const payloads = [
    { productId, quantity: 1 },
    { productId, cycle: 'quarterly' },
    { productId, subscriptionType: 'quarterly' },
    { productIds: [productId] },
    { productId, payAmount: 402.3 },
    { skuId: productId, quantity: 1 },
    { productId },
  ];

  for (const endpoint of endpoints) {
    for (const payload of payloads) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => null);

        if (response.status === 200 && data?.success) {
          console.log(`✅ 成功! ${endpoint}`);
          console.log(`   Payload:`, JSON.stringify(payload));
          console.log(`   Response:`, JSON.stringify(data, null, 2));
          return { endpoint, payload, data };
        }

        if (response.status !== 404) {
          console.log(`📝 ${endpoint} - 状态 ${response.status}`);
          if (data) {
            console.log(`   响应:`, JSON.stringify(data, null, 2).substring(0, 200));
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }
  }

  console.log('❌ 未找到可用的订单创建API');
  return null;
}

async function testPayOrder(token: string, orderId: string) {
  console.log(`\n💰 测试支付API - 订单: ${orderId}`);

  const endpoints = [
    `${API_BASE}/api/biz/pay/confirm`,
    `${API_BASE}/api/biz/pay/submit`,
    `${API_BASE}/api/v1/pay/confirm`,
    `${API_BASE}/api/biz/order/pay`,
  ];

  const payload = { orderId };

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status !== 404) {
        console.log(`${endpoint}: ${response.status}`);
        const text = await response.text().catch(() => '');
        console.log(`   响应: ${text.substring(0, 200)}`);
      }
    } catch (e) {
      // 忽略
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎯 订单API测试');
  console.log('='.repeat(60));

  // 登录
  const token = await login();
  if (!token) return;

  // 尝试创建Pro套餐季度订单
  console.log('\n📦 产品ID映射:');
  console.log('  Lite季度:', PRODUCTS.LITE_QUARTERLY);
  console.log('  Pro季度:', PRODUCTS.PRO_QUARTERLY);
  console.log('  Max季度:', PRODUCTS.MAX_QUARTERLY);

  // 测试创建订单
  const result = await testOrderCreate(token, PRODUCTS.PRO_QUARTERLY);

  if (result?.data?.orderId) {
    await testPayOrder(token, result.data.orderId);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成');
  console.log('='.repeat(60));

  console.log('\n📋 总结:');
  console.log('  1. 登录API: ✅ 可用');
  console.log('  2. 订单创建API: 需要进一步测试');
  console.log('  3. 产品ID已确认，可直接使用');
  console.log('\n💡 建议:');
  console.log('  - 在10:00抢购时段测试，此时soldOut可能为false');
  console.log('  - 如果API返回"库存不足"，说明API存在但需要抢购时机');
  console.log('  - 如果API返回"产品不存在"，说明productId错误');
}

main().catch(console.error);
