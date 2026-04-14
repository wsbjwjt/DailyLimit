#!/usr/bin/env node

/**
 * 终极抢购核心模块
 * 结合API库存检测 + 浏览器自动化点击
 * 支持多浏览器实例并发
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'https://bigmodel.cn';

// 产品ID映射
export const PRODUCTS = {
  lite: { monthly: 'product-02434c', quarterly: 'product-b8ea38', yearly: 'product-70a804' },
  pro: { monthly: 'product-1df3e1', quarterly: 'product-fef82f', yearly: 'product-5643e6' },
  max: { monthly: 'product-2fc421', quarterly: 'product-5d3a03', yearly: 'product-d46f8b' },
} as const;

export type PlanType = keyof typeof PRODUCTS;
export type CycleType = 'monthly' | 'quarterly' | 'yearly';

// 配置参数
export const CONFIG = {
  // API轮询配置
  API_POLL_INTERVAL: 100,      // API轮询间隔(ms)
  API_START_MINUTE: 57,        // 9:57开始API轮询

  // 浏览器配置
  BROWSER_COUNT: 2,            // 浏览器实例数量
  REFRESH_MIN: 3000,           // 最小刷新间隔
  REFRESH_MAX: 6000,           // 最大刷新间隔

  // 时间配置
  START_HOUR: 9,
  START_MINUTE: 57,
  END_HOUR: 10,
  END_MINUTE: 3,               // 10:03结束

  // 超时配置
  PAGE_TIMEOUT: 30000,
  CLICK_TIMEOUT: 5000,
  NAV_TIMEOUT: 10000,
} as const;

// 工具函数
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getTimestamp(): string {
  return new Date().toLocaleTimeString();
}

export function getRandomInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 登录凭证
export interface Credentials {
  username: string;
  password: string;
}

export function loadCredentials(): Credentials | null {
  const username = process.env.BIGMODEL_USERNAME;
  const password = process.env.BIGMODEL_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

// API客户端
export class ApiClient {
  private token: string = '';
  private productId: string;

  constructor(plan: PlanType, cycle: CycleType) {
    this.productId = PRODUCTS[plan][cycle];
  }

  async login(credentials: Credentials): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
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

  async checkStock(): Promise<{ available: boolean; info?: any }> {
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
        return { available: false };
      }

      const target = data.data.productList.find((p: any) => p.productId === this.productId);
      if (!target) return { available: false };

      const available = !target.soldOut && !target.forbidden;
      return { available, info: target };
    } catch {
      return { available: false };
    }
  }

  getToken(): string {
    return this.token;
  }
}

// 浏览器实例
export class BrowserInstance {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private id: number;
  private plan: PlanType;
  private cycle: CycleType;
  private credentials: Credentials;

  constructor(id: number, plan: PlanType, cycle: CycleType, credentials: Credentials) {
    this.id = id;
    this.plan = plan;
    this.cycle = cycle;
    this.credentials = credentials;
  }

  async launch(headless: boolean = false): Promise<boolean> {
    try {
      this.browser = await chromium.launch({
        headless,
        slowMo: 10,
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
      });

      // 记录网络请求
      this.context.on('request', request => {
        if (request.url().includes('/api/') && request.method() === 'POST') {
          console.log(`[Browser${this.id}] API Request: ${request.url()}`);
        }
      });

      this.page = await this.context.newPage();

      // 设置超时
      this.page.setDefaultTimeout(CONFIG.PAGE_TIMEOUT);
      this.page.setDefaultNavigationTimeout(CONFIG.NAV_TIMEOUT);

      return true;
    } catch (error) {
      console.error(`[Browser${this.id}] 启动失败:`, error);
      return false;
    }
  }

  async login(): Promise<boolean> {
    if (!this.page) return false;

    try {
      console.log(`[Browser${this.id}] 正在登录...`);

      // 访问首页
      await this.page.goto('https://bigmodel.cn/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // 点击登录按钮
      await this.page.getByRole('button', { name: '登录 / 注册' }).click();

      // 等待登录框
      await this.page.waitForSelector('text=完成登录/注册', { timeout: 5000 });

      // 切换到账号登录
      await this.page.getByRole('tab', { name: '账号登录' }).click();

      // 填写账号密码
      await this.page.getByRole('textbox', { name: /用户名|邮箱|手机号/ })
        .fill(this.credentials.username);
      await this.page.getByRole('textbox', { name: '请输入密码' })
        .fill(this.credentials.password);

      // 点击登录
      await this.page.getByRole('button', { name: '登录', exact: true }).click();

      // 等待登录成功
      await this.page.waitForFunction(() => {
        const dialog = document.querySelector('dialog') || document.querySelector('[role="dialog"]');
        return !(dialog && dialog.textContent?.includes('完成登录/注册'));
      }, { timeout: 30000 });

      await sleep(2000);
      console.log(`[Browser${this.id}] 登录成功`);
      return true;
    } catch (error) {
      console.error(`[Browser${this.id}] 登录失败:`, error);
      return false;
    }
  }

  async navigateToPurchasePage(): Promise<boolean> {
    if (!this.page) return false;

    try {
      console.log(`[Browser${this.id}] 进入购买页面...`);

      await this.page.goto('https://bigmodel.cn/glm-coding', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // 等待页面加载
      await sleep(2000);

      // 注入MutationObserver监控
      await this.injectMutationObserver();

      return true;
    } catch (error) {
      console.error(`[Browser${this.id}] 导航失败:`, error);
      return false;
    }
  }

  async injectMutationObserver(): Promise<void> {
    if (!this.page) return;

    const planIndex: Record<PlanType, number> = { lite: 0, pro: 1, max: 2 };
    const cycleMap: Record<CycleType, string> = {
      monthly: '连续包月',
      quarterly: '连续包季',
      yearly: '连续包年',
    };

    await this.page.evaluate(({ planIdx, cycleText, planName }) => {
      console.log(`[Observer] 开始监控 ${planName} 套餐...`);

      // 先选择订阅周期
      const cycleButtons = Array.from(document.querySelectorAll('button, [role="button"], span'));
      for (const btn of cycleButtons) {
        if (btn.textContent?.includes(cycleText)) {
          (btn as HTMLElement).click();
          console.log(`[Observer] 已选择周期: ${cycleText}`);
          break;
        }
      }

      // 获取目标按钮
      const buttons = document.querySelectorAll('button');
      const targetButton = buttons[planIdx];

      if (!targetButton) {
        console.error('[Observer] 未找到目标按钮');
        return;
      }

      // 标记按钮以便外部查找
      targetButton.setAttribute('data-purchase-target', planName);

      // 如果按钮已经可用，记录状态
      if (!targetButton.disabled) {
        console.log('[Observer] 按钮当前状态: 可用');
      } else {
        console.log('[Observer] 按钮当前状态: 禁用，开始监控...');
      }

      // 监控按钮状态变化
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'disabled') {
            const btn = mutation.target as HTMLButtonElement;
            if (!btn.disabled) {
              console.log(`[Observer] 🔥 按钮变为可用!`);
              // 添加视觉标记
              btn.style.border = '5px solid red';
              btn.style.animation = 'pulse 0.5s infinite';
            }
          }
        });
      });

      observer.observe(targetButton, {
        attributes: true,
        attributeFilter: ['disabled'],
      });

      (window as any).__purchaseObserver = observer;
      (window as any).__purchaseTarget = targetButton;
    }, {
      planIdx: planIndex[this.plan],
      cycleText: cycleMap[this.cycle],
      planName: this.plan
    });
  }

  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const hasLoginButton = await this.page.getByRole('button', { name: '登录 / 注册' })
        .isVisible().catch(() => false);
      return !hasLoginButton;
    } catch {
      return false;
    }
  }

  async reLogin(): Promise<boolean> {
    if (!this.page) return false;

    try {
      console.log(`[Browser${this.id}] 会话失效，重新登录...`);
      await this.login();
      await this.navigateToPurchasePage();
      return true;
    } catch {
      return false;
    }
  }

  async attemptPurchase(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const planIndex: Record<PlanType, number> = { lite: 0, pro: 1, max: 2 };
      const buttonIndex = planIndex[this.plan];

      // 方法1: 通过注入的标记查找按钮
      const targetButton = this.page.locator(`[data-purchase-target="${this.plan}"]`);
      let clicked = false;

      if (await targetButton.isVisible().catch(() => false)) {
        console.log(`[Browser${this.id}] 通过data属性找到按钮，点击...`);
        await targetButton.click({ timeout: CONFIG.CLICK_TIMEOUT });
        clicked = true;
      } else {
        // 方法2: 通过索引查找
        const buttons = this.page.locator('button');
        const btn = buttons.nth(buttonIndex);

        if (await btn.isVisible().catch(() => false)) {
          const text = await btn.textContent().catch(() => '');
          if (text?.includes('立即') || text?.includes('购买') || text?.includes('开通')) {
            console.log(`[Browser${this.id}] 通过索引找到按钮，点击...`);
            await btn.click({ timeout: CONFIG.CLICK_TIMEOUT });
            clicked = true;
          }
        }
      }

      if (!clicked) {
        return false;
      }

      // 等待跳转
      await sleep(2000);

      // 检查是否跳转成功
      const url = this.page.url();
      const success = url.includes('checkout') ||
                     url.includes('payment') ||
                     url.includes('order') ||
                     url.includes('pay');

      return success;
    } catch (error) {
      console.error(`[Browser${this.id}] 购买点击失败:`, error);
      return false;
    }
  }

  async refreshPage(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      await sleep(1000);
      await this.injectMutationObserver();
      return true;
    } catch (error) {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  getId(): number {
    return this.id;
  }
}

// 主控制器
export class PurchaseController {
  private plan: PlanType;
  private cycle: CycleType;
  private credentials: Credentials;
  private api: ApiClient;
  private browsers: BrowserInstance[] = [];
  private success = false;
  private winner: string | null = null;

  constructor(plan: PlanType, cycle: CycleType) {
    this.plan = plan;
    this.cycle = cycle;

    const creds = loadCredentials();
    if (!creds) throw new Error('请设置BIGMODEL_USERNAME和BIGMODEL_PASSWORD');
    this.credentials = creds;

    this.api = new ApiClient(plan, cycle);
  }

  async initialize(): Promise<boolean> {
    console.log('='.repeat(70));
    console.log('🔥 GLM Coding 终极抢购系统');
    console.log('='.repeat(70));
    console.log(`📦 目标: ${this.plan.toUpperCase()} ${this.cycle}`);
    console.log(`🌐 API: ${CONFIG.API_POLL_INTERVAL}ms轮询`);
    console.log(`🖥️  浏览器: ${CONFIG.BROWSER_COUNT}个实例`);
    console.log('='.repeat(70) + '\n');

    // API登录
    console.log('[初始化] API登录中...');
    const apiLoginSuccess = await this.api.login(this.credentials);
    if (!apiLoginSuccess) {
      console.error('[初始化] API登录失败');
      return false;
    }
    console.log('[初始化] API登录成功\n');

    // 启动浏览器
    console.log('[初始化] 启动浏览器实例...');
    for (let i = 0; i < CONFIG.BROWSER_COUNT; i++) {
      const browser = new BrowserInstance(i + 1, this.plan, this.cycle, this.credentials);
      const launched = await browser.launch(false);
      if (!launched) {
        console.error(`[初始化] 浏览器${i + 1}启动失败`);
        continue;
      }

      const loggedIn = await browser.login();
      if (!loggedIn) {
        console.error(`[初始化] 浏览器${i + 1}登录失败`);
        await browser.close();
        continue;
      }

      const navigated = await browser.navigateToPurchasePage();
      if (!navigated) {
        console.error(`[初始化] 浏览器${i + 1}导航失败`);
        await browser.close();
        continue;
      }

      this.browsers.push(browser);
      console.log(`[初始化] 浏览器${i + 1} 准备就绪`);
    }

    if (this.browsers.length === 0) {
      console.error('[初始化] 没有可用的浏览器实例');
      return false;
    }

    console.log(`[初始化] ${this.browsers.length}个浏览器实例就绪\n`);
    return true;
  }

  async start(): Promise<void> {
    // 等待到开始时间
    await this.waitUntil(CONFIG.START_HOUR, CONFIG.START_MINUTE);

    console.log('\n🚀🚀🚀 抢购开始！\n');

    // 启动所有任务
    const tasks: Promise<void>[] = [
      this.runApiMonitor(),
      ...this.browsers.map(b => this.runBrowserMonitor(b)),
    ];

    await Promise.race(tasks);

    // 显示结果
    if (this.success) {
      console.log('\n' + '='.repeat(70));
      console.log('🔥🔥🔥 抢购成功! 🔥🔥🔥');
      console.log(`✅ 成功方案: ${this.winner}`);
      console.log('='.repeat(70));
      console.log('\n请在浏览器中完成支付');
      console.log('按 Ctrl+C 退出程序\n');
      await new Promise(() => {});
    } else {
      console.log('\n⏰ 抢购时间结束，未成功');
      await this.cleanup();
      process.exit(1);
    }
  }

  async runApiMonitor(): Promise<void> {
    console.log('[API] 开始库存监控...');
    let checkCount = 0;

    while (!this.success) {
      checkCount++;
      const startTime = Date.now();

      try {
        const { available, info } = await this.api.checkStock();

        // 每50次打印一次状态
        if (checkCount % 50 === 0) {
          const status = available ? '🟢有货' : '🔴售罄';
          console.log(`[API] 第${checkCount}次检查 ${status}`);
        }

        if (available) {
          console.log(`\n[API] 🎉 检测到库存!`);
          console.log(`     产品: ${info?.productName}`);
          console.log(`     价格: ¥${info?.payAmount}`);

          // 触发所有浏览器立即购买
          console.log('[API] 触发浏览器购买...');
          const purchasePromises = this.browsers.map(b => b.attemptPurchase());
          const results = await Promise.all(purchasePromises);

          if (results.some(r => r)) {
            this.success = true;
            this.winner = 'API+浏览器';
            return;
          }
        }
      } catch (error) {
        // 忽略错误
      }

      // 控制轮询频率
      const elapsed = Date.now() - startTime;
      const waitTime = Math.max(0, CONFIG.API_POLL_INTERVAL - elapsed);
      await sleep(waitTime);

      // 检查是否超时
      if (this.isTimeUp()) break;
    }
  }

  async runBrowserMonitor(browser: BrowserInstance): Promise<void> {
    const id = browser.getId();
    console.log(`[Browser${id}] 开始页面监控...`);
    let refreshCount = 0;

    while (!this.success) {
      refreshCount++;

      try {
        // 检查登录状态
        const isLoggedIn = await browser.checkLoginStatus();
        if (!isLoggedIn) {
          await browser.reLogin();
          continue;
        }

        // 尝试购买
        const purchased = await browser.attemptPurchase();
        if (purchased) {
          console.log(`\n[Browser${id}] 🎉 购买成功!`);
          this.success = true;
          this.winner = `Browser${id}`;
          return;
        }

        // 刷新页面
        if (refreshCount % 5 === 0) {
          console.log(`[Browser${id}] 已刷新${refreshCount}次`);
        }

        await browser.refreshPage();
        await sleep(getRandomInterval(CONFIG.REFRESH_MIN, CONFIG.REFRESH_MAX));

      } catch (error) {
        console.error(`[Browser${id}] 错误:`, error);
        await sleep(2000);
      }

      if (this.isTimeUp()) break;
    }
  }

  async waitUntil(hour: number, minute: number): Promise<void> {
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
    return now.getHours() >= CONFIG.END_HOUR && now.getMinutes() >= CONFIG.END_MINUTE;
  }

  async cleanup(): Promise<void> {
    console.log('[清理] 关闭浏览器...');
    await Promise.all(this.browsers.map(b => b.close()));
  }
}

// 入口函数
export async function main() {
  const args = process.argv.slice(2);
  const plan = (args[0] || 'pro') as PlanType;
  const cycle = (args[1] || 'quarterly') as CycleType;

  if (!PRODUCTS[plan]) {
    console.error('无效的套餐类型:', plan);
    console.log('可用选项:', Object.keys(PRODUCTS).join(', '));
    process.exit(1);
  }

  const controller = new PurchaseController(plan, cycle);

  try {
    const initialized = await controller.initialize();
    if (!initialized) {
      console.error('初始化失败');
      process.exit(1);
    }

    await controller.start();
  } catch (error) {
    console.error('运行时错误:', error);
    await controller.cleanup();
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}
