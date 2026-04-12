#!/usr/bin/env node

/**
 * API直连抢购方案
 * 9:57开始不断轮询检测库存，一旦available立即购买
 */

import * as QRCode from 'qrcode';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'https://bigmodel.cn';

// 产品ID映射
const PRODUCTS = {
  LITE_MONTHLY: { id: 'product-02434c', name: 'Lite连续包月', price: 49 },
  LITE_QUARTERLY: { id: 'product-b8ea38', name: 'Lite连续包季', price: 132.3 },
  LITE_YEARLY: { id: 'product-70a804', name: 'Lite连续包年', price: 470.4 },
  PRO_MONTHLY: { id: 'product-1df3e1', name: 'Pro连续包月', price: 149 },
  PRO_QUARTERLY: { id: 'product-fef82f', name: 'Pro连续包季', price: 402.3 },
  PRO_YEARLY: { id: 'product-5643e6', name: 'Pro连续包年', price: 1430.4 },
  MAX_MONTHLY: { id: 'product-2fc421', name: 'Max连续包月', price: 469 },
  MAX_QUARTERLY: { id: 'product-5d3a03', name: 'Max连续包季', price: 1266.3 },
  MAX_YEARLY: { id: 'product-d46f8b', name: 'Max连续包年', price: 4502.4 },
};

class ApiPurchaser {
  private token: string = '';
  private targetProduct: typeof PRODUCTS.PRO_QUARTERLY;
  private checkInterval: NodeJS.Timeout | null = null;
  private requestCount = 0;
  private startTime: number = 0;

  constructor(productKey: keyof typeof PRODUCTS = 'PRO_QUARTERLY') {
    this.targetProduct = PRODUCTS[productKey];
  }

  async login(): Promise<boolean> {
    console.log('🔐 正在登录...');

    const username = process.env.BIGMODEL_USERNAME;
    const password = process.env.BIGMODEL_PASSWORD;

    if (!username || !password) {
      console.log('❌ 请在.env中设置BIGMODEL_USERNAME和BIGMODEL_PASSWORD');
      return false;
    }

    try {
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
        this.token = data.data.access_token;
        console.log('✅ 登录成功');
        return true;
      }

      console.log('❌ 登录失败:', data.msg);
      return false;
    } catch (error) {
      console.error('❌ 登录错误:', error);
      return false;
    }
  }

  async checkStock(): Promise<{ available: boolean; productInfo: any }> {
    try {
      const response = await fetch(`${API_BASE}/api/biz/pay/batch-preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ invitationCode: '' }),
      });

      const data = await response.json();

      if (!data.success || !data.data?.productList) {
        return { available: false, productInfo: null };
      }

      const target = data.data.productList.find(
        (p: any) => p.productId === this.targetProduct.id
      );

      if (!target) {
        return { available: false, productInfo: null };
      }

      // 检查是否可购买
      const available = !target.soldOut && !target.forbidden;

      return { available, productInfo: target };
    } catch (error) {
      console.error('❌ 检查库存失败:', error);
      return { available: false, productInfo: null };
    }
  }

  async attemptPurchase(): Promise<{ success: boolean; orderId?: string; payUrl?: string; message: string }> {
    console.log('\n🚀 尝试购买...');
    console.log(`   产品: ${this.targetProduct.name}`);
    console.log(`   价格: ￥${this.targetProduct.price}`);

    // 尝试订单创建API
    const orderResult = await this.createOrder();
    if (!orderResult.success) {
      return { success: false, message: orderResult.message };
    }

    // 尝试获取支付链接
    const payResult = await this.getPayUrl(orderResult.orderId!);
    if (!payResult.success) {
      return { success: false, orderId: orderResult.orderId, message: payResult.message };
    }

    return {
      success: true,
      orderId: orderResult.orderId,
      payUrl: payResult.payUrl,
      message: '订单创建成功，请完成支付'
    };
  }

  async createOrder(): Promise<{ success: boolean; orderId?: string; message: string }> {
    const endpoints = [
      `${API_BASE}/api/biz/order/create`,
      `${API_BASE}/api/biz/subscription/purchase`,
      `${API_BASE}/api/biz/subscription/create`,
    ];

    const payloads = [
      { productId: this.targetProduct.id, quantity: 1 },
      { productId: this.targetProduct.id, quantity: 1, invitationCode: '' },
      { productId: this.targetProduct.id },
      { skuId: this.targetProduct.id, quantity: 1 },
    ];

    for (const endpoint of endpoints) {
      for (const payload of payloads) {
        try {
          console.log(`  尝试: ${endpoint}`);
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          const data = await response.json().catch(() => null);

          if (data?.success) {
            const orderId = data.data?.orderId || data.data?.id || data.data?.orderNo;
            if (orderId) {
              console.log(`✅ 订单创建成功: ${orderId}`);
              return { success: true, orderId, message: '订单创建成功' };
            }
          }

          // 记录失败原因
          if (data?.msg) {
            console.log(`   响应: ${data.msg}`);
          }
        } catch (e) {
          // 忽略网络错误
        }
      }
    }

    return { success: false, message: '未找到可用的订单创建API' };
  }

  async getPayUrl(orderId: string): Promise<{ success: boolean; payUrl?: string; message: string }> {
    // 直接构造支付页面URL
    const payUrl = `${API_BASE}/payment?orderId=${orderId}`;
    console.log(`💰 支付链接: ${payUrl}`);
    return { success: true, payUrl, message: '获取支付链接成功' };
  }

  async checkOrderStatus(orderId: string): Promise<{ paid: boolean; status?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/biz/order/detail?orderId=${orderId}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
        },
      });

      const data = await response.json();
      if (data.success && data.data) {
        const status = data.data.status || data.data.orderStatus;
        return { paid: status === 'PAID' || status === 'SUCCESS', status };
      }
    } catch (e) {
      // 忽略错误
    }
    return { paid: false };
  }

  async startMonitoring(startHour: number = 9, startMinute: number = 57) {
    console.log('='.repeat(60));
    console.log('🔥 API直连抢购模式');
    console.log('='.repeat(60));
    console.log(`📦 目标产品: ${this.targetProduct.name}`);
    console.log(`💰 产品价格: ￥${this.targetProduct.price}`);
    console.log(`⏰ 开始时间: ${startHour}:${startMinute.toString().padStart(2, '0')}`);
    console.log('');

    // 登录
    const loggedIn = await this.login();
    if (!loggedIn) {
      console.log('❌ 登录失败，退出');
      process.exit(1);
    }

    // 等待到开始时间
    const now = new Date();
    const startTime = new Date();
    startTime.setHours(startHour, startMinute, 0, 0);

    if (now < startTime) {
      const waitMs = startTime.getTime() - now.getTime();
      const waitMinutes = Math.floor(waitMs / 60000);
      const waitSeconds = Math.floor((waitMs % 60000) / 1000);

      console.log(`⏰ 等待到 ${startHour}:${startMinute.toString().padStart(2, '0')} 开始轮询...`);
      console.log(`   还需等待 ${waitMinutes} 分 ${waitSeconds} 秒\n`);

      // 倒计时显示
      const countdownInterval = setInterval(() => {
        const remainingMs = startTime.getTime() - Date.now();
        if (remainingMs <= 0) {
          clearInterval(countdownInterval);
          return;
        }
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        process.stdout.write(`\r⏰ 倒计时: ${mins.toString().padStart(2, '0')} 分 ${secs.toString().padStart(2, '0')} 秒    `);
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, waitMs));
      clearInterval(countdownInterval);
      process.stdout.write('\n\n');
    }

    console.log('🚀 开始轮询检测库存...\n');
    this.startTime = Date.now();

    // 开始轮询
    this.checkInterval = setInterval(async () => {
      this.requestCount++;
      const elapsed = Date.now() - this.startTime;
      const elapsedSec = (elapsed / 1000).toFixed(1);

      const { available, productInfo } = await this.checkStock();

      // 打印轮询日志（每10次打印一次，或状态变化时打印）
      if (this.requestCount % 10 === 0 || available) {
        const time = new Date().toLocaleTimeString();
        const status = available ? '🟢 有货' : '🔴 售罄';
        console.log(`[${time}] 第${this.requestCount.toString().padStart(3)}次检查 ${status} (已运行${elapsedSec}s)`);

        if (productInfo) {
          console.log(`   soldOut: ${productInfo.soldOut}, forbidden: ${productInfo.forbidden}`);
        }
      }

      // 如果有货，立即尝试购买
      if (available) {
        console.log('\n🎉 检测到库存！立即尝试购买...');
        this.stopMonitoring();
        const result = await this.attemptPurchase();

        if (result.success) {
          console.log('\n✅ 订单创建成功！');
          console.log(`   订单ID: ${result.orderId}`);

          // 生成二维码
          let qrCodeString = '';
          try {
            qrCodeString = await QRCode.toString(result.payUrl!, {
              type: 'terminal',
              small: true
            });
          } catch (e) {
            // 忽略二维码生成错误
          }

          console.log('\n' + '='.repeat(60));
          console.log('🎉 抢购成功！请完成支付');
          console.log('='.repeat(60));

          // 显示二维码
          if (qrCodeString) {
            console.log('\n📱 手机扫码支付:');
            console.log(qrCodeString);
          }

          console.log('\n💻 电脑支付:');
          console.log(`  ${result.payUrl}`);
          console.log('\n按 Ctrl+C 退出程序\n');
          process.exit(0);
        } else {
          console.log(`\n❌ 购买失败: ${result.message}`);
          console.log('继续轮询...\n');
          this.startMonitoring(startHour, startMinute);
        }
      }
    }, 200); // 每200ms检查一次（每秒5次）

    // 10:05后自动停止
    const stopTime = new Date();
    stopTime.setHours(10, 5, 0, 0);
    const stopDelay = stopTime.getTime() - Date.now();

    if (stopDelay > 0) {
      setTimeout(() => {
        console.log('\n⏰ 已超过10:05，停止轮询');
        this.stopMonitoring();
        process.exit(0);
      }, stopDelay);
    }
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const productKey = (args[0] || 'PRO_QUARTERLY') as keyof typeof PRODUCTS;

  if (!PRODUCTS[productKey]) {
    console.log('❌ 无效的产品类型');
    console.log('可用选项:', Object.keys(PRODUCTS).join(', '));
    process.exit(1);
  }

  const purchaser = new ApiPurchaser(productKey);

  // 9:57开始轮询
  await purchaser.startMonitoring(9, 57);
}

main().catch(console.error);
