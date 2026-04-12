#!/usr/bin/env node

/**
 * 组合抢购方案
 * 同时运行浏览器点击 + API直连，谁先成功就通知用户
 */

import { chromium, Browser, Page } from 'playwright';
import * as QRCode from 'qrcode';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { loadConfig } from './config';
import { login } from './login';
import {
  navigateToPurchasePage,
  injectMutationObserver,
  preciseWaitUntil,
  keepPageAlive,
} from './purchase';
import { runCli } from './cli';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'https://bigmodel.cn';

// 产品ID映射
const PRODUCTS = {
  lite: { monthly: 'product-02434c', quarterly: 'product-b8ea38', yearly: 'product-70a804' },
  pro: { monthly: 'product-1df3e1', quarterly: 'product-fef82f', yearly: 'product-5643e6' },
  max: { monthly: 'product-2fc421', quarterly: 'product-5d3a03', yearly: 'product-d46f8b' },
};

class HybridPurchaser {
  private success = false;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private token = '';
  private apiCheckCount = 0;
  private browserCheckCount = 0;
  private startTime = 0;

  constructor(
    private plan: 'lite' | 'pro' | 'max',
    private cycle: 'monthly' | 'quarterly' | 'yearly'
  ) {}

  async run() {
    console.log('='.repeat(70));
    console.log('🚀 组合抢购方案 - 浏览器 + API 双管齐下');
    console.log('='.repeat(70));
    console.log(`📦 目标: ${this.plan.toUpperCase()} ${this.cycle}`);
    console.log('💡 谁先成功谁优先，自动通知你付款\n');

    // 加载配置
    const config = loadConfig();
    const cliOptions = await runCli(this.plan, this.cycle);

    // 同时启动两种方式
    console.log('🔥 启动两种抢购方式...\n');

    this.startTime = Date.now();

    await Promise.race([
      this.runBrowserApproach(config.username, config.password, cliOptions),
      this.runApiApproach(),
    ]);

    // 如果有成功，显示结果
    if (this.success) {
      console.log('\n' + '='.repeat(70));
      console.log('🎉 抢购成功！请立即完成支付');
      console.log('='.repeat(70));
      console.log('\n⏳ 浏览器将保持打开，请手动完成支付');
      console.log('   按 Ctrl+C 退出程序\n');
      await new Promise(() => {}); // 保持运行
    }
  }

  async runBrowserApproach(username: string, password: string, options: any) {
    console.log('[浏览器] 启动浏览器方案...');

    this.browser = await chromium.launch({
      headless: false,
      slowMo: 20,
    });

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    this.page = await context.newPage();

    try {
      // 登录
      await login(this.page, { username, password });

      // 访问购买页面
      await navigateToPurchasePage(this.page);

      // 等待到9:50
      const now = new Date();
      const prepareTime = new Date();
      prepareTime.setHours(9, 50, 0, 0);

      if (now < prepareTime) {
        const waitMs = prepareTime.getTime() - now.getTime();
        console.log(`[浏览器] 等待到 9:50... (${Math.floor(waitMs / 1000)}秒)`);
        await new Promise(r => setTimeout(r, waitMs));
      }

      // 启动页面活跃保持
      console.log('[浏览器] 启动页面活跃保持...');
      const stopKeepAlive = await keepPageAlive(this.page);

      // 刷新页面并记录日志
      console.log('[浏览器] 刷新页面...');
      const refreshStart = Date.now();
      await this.page.reload({ waitUntil: 'networkidle' });
      console.log(`[浏览器] ✅ 页面刷新完成 (${Date.now() - refreshStart}ms)`);

      // 检查登录状态
      const hasLoginButton = await this.page.getByRole('button', { name: '登录 / 注册' }).isVisible().catch(() => false);
      console.log(`[浏览器] 登录状态: ${hasLoginButton ? '未登录' : '已登录'}`);

      if (hasLoginButton) {
        console.log('[浏览器] 重新登录...');
        await login(this.page, { username, password });
        await navigateToPurchasePage(this.page);
      }

      // 注入MutationObserver
      console.log('[浏览器] 注入MutationObserver监控...');
      await injectMutationObserver(this.page, this.plan, this.cycle);

      // 精确等待到10:00
      await preciseWaitUntil(10, 0);

      // 停止页面保持
      await stopKeepAlive();

      // 监控浏览器跳转
      console.log('[浏览器] 监控页面跳转...');
      const startWait = Date.now();

      while (Date.now() - startWait < 10000 && !this.success) {
        this.browserCheckCount++;
        const url = this.page.url();

        if (url.includes('checkout') || url.includes('payment') || url.includes('order')) {
          console.log('\n[浏览器] 🎉 检测到跳转至支付页面！');
          console.log(`[浏览器] URL: ${url}`);
          this.success = true;
          return;
        }

        if (this.browserCheckCount % 10 === 0) {
          console.log(`[浏览器] 检查中... (${this.browserCheckCount}次)`);
        }

        await new Promise(r => setTimeout(r, 100));
      }

      console.log('[浏览器] 未检测到跳转，继续等待API方案...');

    } catch (error) {
      console.error('[浏览器] 错误:', error);
    }
  }

  async runApiApproach() {
    console.log('[API] 启动API直连方案...');

    // 等待到9:57开始轮询
    const now = new Date();
    const startTime = new Date();
    startTime.setHours(9, 57, 0, 0);

    if (now < startTime) {
      const waitMs = startTime.getTime() - now.getTime();
      console.log(`[API] 等待到 9:57 开始轮询... (${Math.floor(waitMs / 1000)}秒)`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    // 登录获取token
    console.log('[API] 登录获取token...');
    const loggedIn = await this.apiLogin();
    if (!loggedIn) {
      console.log('[API] 登录失败，退出API方案');
      return;
    }

    console.log('[API] 🚀 开始轮询检测库存...\n');

    // 开始轮询
    while (!this.success) {
      this.apiCheckCount++;

      const { available, productInfo } = await this.checkStock();

      // 每50次检查打印一次日志
      if (this.apiCheckCount % 50 === 0 || available) {
        const time = new Date().toLocaleTimeString();
        const status = available ? '🟢 有货' : '🔴 售罄';
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        console.log(`[API] [${time}] 第${this.apiCheckCount}次检查 ${status} (已运行${elapsed}s)`);
      }

      // 如果有货，尝试创建订单并支付
      if (available) {
        console.log('\n[API] 🎉 检测到库存！');
        console.log(`[API] 产品: ${productInfo?.productId}`);
        console.log(`[API] 价格: ￥${productInfo?.payAmount}`);
        console.log(`[API] soldOut: ${productInfo?.soldOut}`);

        // 尝试创建订单
        console.log('[API] 🚀 尝试创建订单...');
        const orderResult = await this.createOrder();

        if (orderResult.success && orderResult.orderId) {
          console.log(`[API] ✅ 订单创建成功: ${orderResult.orderId}`);

          // 获取支付链接
          const payUrl = `${API_BASE}/payment?orderId=${orderResult.orderId}`;

          // 生成二维码
          let qrCodeString = '';
          try {
            qrCodeString = await QRCode.toString(payUrl, {
              type: 'terminal',
              small: true
            });
          } catch (e) {
            // 忽略二维码生成错误
          }

          console.log('\n' + '='.repeat(70));
          console.log('🎉 抢购成功！请完成支付');
          console.log('='.repeat(70));

          // 显示二维码
          if (qrCodeString) {
            console.log('\n📱 手机扫码支付:');
            console.log(qrCodeString);
          }

          console.log('\n💻 电脑支付:');
          console.log(`  ${payUrl}`);
          console.log('\n新标签页已打开（如有浏览器），或手动复制链接');
          console.log('按 Ctrl+C 退出程序\n');

          // 打开新标签页（不跳转当前页）
          if (this.browser && this.page) {
            try {
              // 在新标签页打开支付链接
              await this.page.evaluate((url) => {
                window.open(url, '_blank');
              }, payUrl);
              console.log('[API] ✅ 已在浏览器中打开新标签页');
            } catch (e) {
              // 如果无法打开新标签页，不影响主流程
            }
          }

          this.success = true;

          // 保持程序运行，让用户完成支付
          await new Promise(() => {});
          return;
        } else {
          console.log(`[API] ❌ 订单创建失败: ${orderResult.message}`);
          console.log('[API] 尝试使用浏览器方案...');
        }

        this.success = true;
        return;
      }

      // 每200ms检查一次
      await new Promise(r => setTimeout(r, 200));

      // 10:05后停止
      const currentTime = new Date();
      if (currentTime.getHours() === 10 && currentTime.getMinutes() >= 5) {
        console.log('[API] 超过10:05，停止轮询');
        break;
      }
    }
  }

  async apiLogin(): Promise<boolean> {
    const username = process.env.BIGMODEL_USERNAME;
    const password = process.env.BIGMODEL_PASSWORD;

    if (!username || !password) return false;

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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
        console.log('[API] ✅ 登录成功');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[API] 登录错误:', error);
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
        },
        body: JSON.stringify({ invitationCode: '' }),
      });

      const data = await response.json();

      if (!data.success || !data.data?.productList) {
        return { available: false, productInfo: null };
      }

      const productId = PRODUCTS[this.plan][this.cycle];
      const target = data.data.productList.find((p: any) => p.productId === productId);

      if (!target) {
        return { available: false, productInfo: null };
      }

      const available = !target.soldOut && !target.forbidden;
      return { available, productInfo: target };
    } catch (error) {
      return { available: false, productInfo: null };
    }
  }

  async createOrder(): Promise<{ success: boolean; orderId?: string; message: string }> {
    const productId = PRODUCTS[this.plan][this.cycle];
    const endpoints = [
      `${API_BASE}/api/biz/order/create`,
      `${API_BASE}/api/biz/subscription/purchase`,
      `${API_BASE}/api/biz/subscription/create`,
    ];

    const payloads = [
      { productId, quantity: 1 },
      { productId, quantity: 1, invitationCode: '' },
      { productId },
      { skuId: productId, quantity: 1 },
    ];

    for (const endpoint of endpoints) {
      for (const payload of payloads) {
        try {
          console.log(`[API]   尝试: ${endpoint}`);
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
              return { success: true, orderId, message: '订单创建成功' };
            }
          }

          if (data?.msg) {
            console.log(`[API]   响应: ${data.msg}`);
          }
        } catch (e) {
          // 忽略错误
        }
      }
    }

    return { success: false, message: '未找到可用的订单创建API' };
  }
}

async function main() {
  const purchaser = new HybridPurchaser('pro', 'quarterly');
  await purchaser.run();
}

main().catch(console.error);
