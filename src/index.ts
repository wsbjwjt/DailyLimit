#!/usr/bin/env node

/**
 * 终极组合抢购方案（唯一方案）
 * 浏览器高频刷新（防封） + API超高速轮询
 * 谁先成功谁优先
 */

import { chromium, Browser, Page } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { loadConfig } from './config';
import { login } from './login';
import { navigateToPurchasePage, keepPageAlive } from './purchase';
import { runCli } from './cli';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'https://bigmodel.cn';

// ============ 配置参数 ============
// 浏览器配置
const START_HOUR = 9;
const START_MINUTE = 45;              // 9:45开始
const END_HOUR = 10;
const END_MINUTE = 0;
const END_SECOND = 30;                // 10:00:30结束
const BROWSER_REFRESH_MIN = 4000;     // 浏览器最小刷新间隔4秒
const BROWSER_REFRESH_MAX = 8000;     // 浏览器最大刷新间隔8秒

// API配置
const API_POLL_INTERVAL = 100;        // API轮询间隔100ms（每秒10次）⚡超高速
const API_START_MINUTE = 45;          // 9:45就开始API轮询

// 产品ID映射
const PRODUCTS = {
  lite: { monthly: 'product-02434c', quarterly: 'product-b8ea38', yearly: 'product-70a804' },
  pro: { monthly: 'product-1df3e1', quarterly: 'product-fef82f', yearly: 'product-5643e6' },
  max: { monthly: 'product-2fc421', quarterly: 'product-5d3a03', yearly: 'product-d46f8b' },
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
];

// ============ 工具函数 ============
function getRandomInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getTimestamp(): string {
  return new Date().toLocaleTimeString();
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ 主类 ============
class UltimatePurchaser {
  private success = false;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private token = '';
  private apiCheckCount = 0;
  private browserRefreshCount = 0;
  private lastApiStatus = '';
  private startTime = 0;
  private winner: 'browser' | 'api' | null = null;

  constructor(
    private plan: 'lite' | 'pro' | 'max',
    private cycle: 'monthly' | 'quarterly' | 'yearly'
  ) {}

  async run() {
    console.clear();
    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
    console.log('🔥                                                                    🔥');
    console.log('🔥          GLM Coding Plan 终极抢购方案                              🔥');
    console.log('🔥          浏览器（防封） + API（超高速）双管齐下                      🔥');
    console.log('🔥                                                                    🔥');
    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
    console.log();

    const config = loadConfig();
    const options = await runCli(this.plan, this.cycle);

    console.log('\n' + '='.repeat(70));
    console.log('📦 目标产品:', this.plan.toUpperCase(), this.cycle);
    console.log('🚀 浏览器:', BROWSER_REFRESH_MIN/1000, '-', BROWSER_REFRESH_MAX/1000, '秒随机刷新');
    console.log('⚡ API:', API_POLL_INTERVAL, 'ms轮询（每秒10次）');
    console.log('⏰ 启动时间:', START_HOUR, ':', START_MINUTE.toString().padStart(2, '0'));
    console.log('⏰ 结束时间:', END_HOUR, ':', END_MINUTE.toString().padStart(2, '0'), ':', END_SECOND.toString().padStart(2, '0'));
    console.log('='.repeat(70) + '\n');

    // 等待到9:45
    await this.waitUntil(START_HOUR, START_MINUTE);

    this.startTime = Date.now();
    console.log('\n🚀🚀🚀 开始抢购！两种方案同时启动！\n');

    // 同时启动两种方式
    await Promise.race([
      this.runBrowserApproach(config.username, config.password),
      this.runApiApproach(),
    ]);

    // 显示结果
    if (this.success) {
      console.log('\n' + '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
      console.log('🔥                                                                    🔥');
      console.log(`🔥              🎉 ${this.winner === 'api' ? 'API' : '浏览器'}方案率先成功！🎉               🔥`);
      console.log('🔥                                                                    🔥');
      console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥');
      console.log('\n⏳ 请在浏览器中完成支付');
      console.log('   按 Ctrl+C 退出程序\n');

      await new Promise(() => {});
    } else {
      console.log('\n⏰ 抢购时间结束，未成功');
      process.exit(1);
    }
  }

  // ============ 浏览器方案 ============
  async runBrowserApproach(username: string, password: string) {
    console.log(`[${getTimestamp()}] [浏览器] 启动中...`);

    try {
      this.browser = await chromium.launch({ headless: false, slowMo: 10 });
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: getRandomUserAgent(),
      });

      this.page = await context.newPage();

      // 登录
      console.log(`[${getTimestamp()}] [浏览器] 登录中...`);
      await login(this.page, { username, password });
      await navigateToPurchasePage(this.page);
      console.log(`[${getTimestamp()}] [浏览器] ✅ 登录成功，进入购买页面`);

      // 启动页面保持
      const stopKeepAlive = await keepPageAlive(this.page);

      // 高频刷新循环
      while (!this.success) {
        this.browserRefreshCount++;
        const refreshStart = Date.now();

        try {
          // 刷新页面
          await this.page.reload({ waitUntil: 'networkidle', timeout: 15000 });
          const refreshDuration = Date.now() - refreshStart;

          // 检查登录状态
          const hasLoginButton = await this.page.getByRole('button', { name: '登录 / 注册' }).isVisible().catch(() => false);
          if (hasLoginButton) {
            console.log(`[${getTimestamp()}] [浏览器] ⚠️ 会话失效，重新登录...`);
            await login(this.page, { username, password });
            await navigateToPurchasePage(this.page);
            continue;
          }

          // 检查购买按钮
          const isAvailable = await this.isPurchaseButtonAvailable();

          if (isAvailable) {
            console.log(`\n[${getTimestamp()}] [浏览器] 🎉 购买按钮可用！`);
            const clicked = await this.clickPurchaseButton();
            if (clicked) {
              // 等待跳转
              await sleep(2000);
              const url = this.page.url();
              if (url.includes('checkout') || url.includes('payment') || url.includes('order')) {
                this.success = true;
                this.winner = 'browser';
                await stopKeepAlive();
                return;
              }
            }
          }

          // 打印状态（每5次）
          if (this.browserRefreshCount % 5 === 0) {
            const interval = getRandomInterval(BROWSER_REFRESH_MIN, BROWSER_REFRESH_MAX);
            console.log(`[${getTimestamp()}] [浏览器] 已刷新${this.browserRefreshCount}次 (${refreshDuration}ms) | API: ${this.lastApiStatus} | 下次${interval}ms`);
            await sleep(interval);
          } else {
            await sleep(getRandomInterval(BROWSER_REFRESH_MIN, BROWSER_REFRESH_MAX));
          }

        } catch (error) {
          console.error(`[${getTimestamp()}] [浏览器] 错误:`, error instanceof Error ? error.message : '未知错误');
          await sleep(2000);
        }

        // 检查是否超时
        if (this.isTimeUp()) break;
      }

      await stopKeepAlive();

    } catch (error) {
      console.error(`[${getTimestamp()}] [浏览器] 致命错误:`, error);
    }
  }

  async isPurchaseButtonAvailable(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const planIndex: Record<string, number> = { lite: 0, pro: 1, max: 2 };
      const buttonIndex = planIndex[this.plan];
      const buttons = this.page.locator('button');
      const targetButton = buttons.nth(buttonIndex);

      const isVisible = await targetButton.isVisible({ timeout: 1000 }).catch(() => false);
      if (!isVisible) return false;

      const isEnabled = await targetButton.isEnabled({ timeout: 1000 }).catch(() => false);
      const buttonText = await targetButton.textContent({ timeout: 1000 }).catch(() => '') || '';

      const hasPurchaseText = buttonText.includes('立即') || buttonText.includes('购买') || buttonText.includes('开通');
      const isSoldOut = buttonText.includes('售罄') || buttonText.includes('补货');

      return isVisible && isEnabled && hasPurchaseText && !isSoldOut;
    } catch {
      return false;
    }
  }

  async clickPurchaseButton(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const planIndex: Record<string, number> = { lite: 0, pro: 1, max: 2 };
      const buttons = this.page.locator('button');
      const targetButton = buttons.nth(planIndex[this.plan]);

      console.log(`[${getTimestamp()}] [浏览器] 🖱️ 点击${this.plan.toUpperCase()}套餐...`);
      await targetButton.click({ timeout: 5000 });
      return true;
    } catch (error) {
      console.error(`[${getTimestamp()}] [浏览器] 点击失败:`, error);
      return false;
    }
  }

  // ============ API方案 ============
  async runApiApproach() {
    console.log(`[${getTimestamp()}] [API] 启动中...`);

    // 登录
    const loggedIn = await this.apiLogin();
    if (!loggedIn) {
      console.log(`[${getTimestamp()}] [API] ❌ 登录失败`);
      return;
    }

    console.log(`[${getTimestamp()}] [API] ✅ 登录成功，开始超高速轮询（${API_POLL_INTERVAL}ms）`);

    // 超高速轮询
    while (!this.success) {
      this.apiCheckCount++;
      const checkStart = Date.now();

      try {
        const { available, productInfo } = await this.checkStock();

        // 更新状态（用于显示）
        if (this.apiCheckCount % 100 === 0) {
          this.lastApiStatus = `已检查${this.apiCheckCount}次`;
        }

        // 发现库存！
        if (available) {
          console.log('\n' + '='.repeat(70));
          console.log(`[${getTimestamp()}] [API] 🎉🎉🎉 检测到库存！`);
          console.log(`  产品: ${productInfo?.productId}`);
          console.log(`  价格: ￥${productInfo?.payAmount}`);
          console.log(`  soldOut: ${productInfo?.soldOut}`);
          console.log('='.repeat(70) + '\n');

          if (!this.success) {
            this.success = true;
            this.winner = 'api';
          }
          return;
        }

      } catch (error) {
        // 忽略错误，继续轮询
      }

      // 精确控制轮询间隔
      const elapsed = Date.now() - checkStart;
      const waitTime = Math.max(0, API_POLL_INTERVAL - elapsed);
      await sleep(waitTime);

      // 检查是否超时
      if (this.isTimeUp()) {
        console.log(`[${getTimestamp()}] [API] ⏰ 时间到，停止轮询`);
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
        return true;
      }
      return false;
    } catch {
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

      if (!target) return { available: false, productInfo: null };

      const available = !target.soldOut && !target.forbidden;
      return { available, productInfo: target };
    } catch {
      return { available: false, productInfo: null };
    }
  }

  // ============ 工具方法 ============
  async waitUntil(hour: number, minute: number) {
    const target = new Date();
    target.setHours(hour, minute, 0, 0);

    const now = new Date();
    if (now >= target) return;

    const waitMs = target.getTime() - now.getTime();
    const mins = Math.floor(waitMs / 60000);
    const secs = Math.floor((waitMs % 60000) / 1000);

    console.log(`\n⏰ 等待到 ${hour}:${minute.toString().padStart(2, '0')}...`);
    console.log(`   还需 ${mins} 分 ${secs} 秒`);

    const countdown = setInterval(() => {
      const remaining = target.getTime() - Date.now();
      if (remaining <= 0) {
        clearInterval(countdown);
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      process.stdout.write(`\r⏰ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}    `);
    }, 1000);

    await sleep(waitMs);
    clearInterval(countdown);
    process.stdout.write('\n');
  }

  isTimeUp(): boolean {
    const now = new Date();
    return now.getHours() >= END_HOUR && now.getMinutes() >= END_MINUTE && now.getSeconds() >= END_SECOND;
  }
}

// ============ 入口 ============
async function main() {
  const purchaser = new UltimatePurchaser('pro', 'quarterly');
  await purchaser.run();
}

main().catch(console.error);
