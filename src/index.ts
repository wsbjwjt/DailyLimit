#!/usr/bin/env node

/**
 * GLM Coding 终极抢购系统
 * 统一入口: npm start
 *
 * 策略: API高速轮询 + 多浏览器并发点击
 * 用法: npm start [plan] [cycle]
 * 示例: npm start pro quarterly
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'https://bigmodel.cn';

// ============ 配置 ============
const CONFIG = {
  START_HOUR: 9,
  START_MINUTE: 57,           // 9:57开始
  END_HOUR: 10,
  END_MINUTE: 3,              // 10:03结束

  API_POLL_INTERVAL: 100,     // API轮询100ms
  BROWSER_COUNT: 2,           // 2个浏览器实例
  REFRESH_MIN: 3000,          // 浏览器刷新3-6秒
  REFRESH_MAX: 6000,

  PRODUCTS: {
    lite: { monthly: 'product-02434c', quarterly: 'product-b8ea38', yearly: 'product-70a804' },
    pro: { monthly: 'product-1df3e1', quarterly: 'product-fef82f', yearly: 'product-5643e6' },
    max: { monthly: 'product-2fc421', quarterly: 'product-5d3a03', yearly: 'product-d46f8b' },
  } as const,
};

type PlanType = keyof typeof CONFIG.PRODUCTS;
type CycleType = 'monthly' | 'quarterly' | 'yearly';

// ============ 工具函数 ============
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString();
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ============ API客户端 ============
class ApiClient {
  private token = '';
  private productId: string;

  constructor(plan: PlanType, cycle: CycleType) {
    this.productId = CONFIG.PRODUCTS[plan][cycle];
  }

  async login(): Promise<boolean> {
    const username = process.env.BIGMODEL_USERNAME;
    const password = process.env.BIGMODEL_PASSWORD;
    if (!username || !password) return false;

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, loginType: 'password', grantType: 'customer', userType: 'PERSONAL' }),
      });
      const data = await res.json();
      if (data.success && data.data?.access_token) {
        this.token = data.data.access_token;
        return true;
      }
    } catch {}
    return false;
  }

  async checkStock(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/biz/pay/batch-preview`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationCode: '' }),
      });
      const data = await res.json();
      if (!data.success || !data.data?.productList) return false;

      const target = data.data.productList.find((p: any) => p.productId === this.productId);
      return target ? !target.soldOut && !target.forbidden : false;
    } catch {
      return false;
    }
  }
}

// ============ 浏览器实例 ============
class BrowserInstance {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private id: number;
  private plan: PlanType;
  private credentials: { username: string; password: string };

  constructor(id: number, plan: PlanType) {
    this.id = id;
    this.plan = plan;
    const u = process.env.BIGMODEL_USERNAME!;
    const p = process.env.BIGMODEL_PASSWORD!;
    this.credentials = { username: u, password: p };
  }

  async launch(): Promise<boolean> {
    try {
      this.browser = await chromium.launch({ headless: false, slowMo: 10 });
      const ctx = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
      this.page = await ctx.newPage();
      this.page.setDefaultTimeout(30000);
      return true;
    } catch (e) {
      console.error(`[Browser${this.id}] 启动失败`);
      return false;
    }
  }

  async login(): Promise<boolean> {
    if (!this.page) return false;
    try {
      console.log(`[Browser${this.id}] 登录中...`);
      await this.page.goto('https://bigmodel.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });

      await this.page.getByRole('button', { name: '登录 / 注册' }).click();
      await this.page.waitForSelector('text=完成登录/注册', { timeout: 5000 });
      await this.page.getByRole('tab', { name: '账号登录' }).click();
      await this.page.getByRole('textbox', { name: /用户名|邮箱|手机号/ }).fill(this.credentials.username);
      await this.page.getByRole('textbox', { name: '请输入密码' }).fill(this.credentials.password);
      await this.page.getByRole('button', { name: '登录', exact: true }).click();

      await this.page.waitForFunction(() => {
        const d = document.querySelector('dialog') || document.querySelector('[role="dialog"]');
        return !(d && d.textContent?.includes('完成登录/注册'));
      }, { timeout: 30000 });

      await sleep(2000);
      console.log(`[Browser${this.id}] 登录成功`);
      return true;
    } catch (e) {
      console.error(`[Browser${this.id}] 登录失败`);
      return false;
    }
  }

  async gotoPurchasePage(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto('https://bigmodel.cn/glm-coding', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2000);
      await this.injectObserver();
      return true;
    } catch {
      return false;
    }
  }

  async injectObserver(): Promise<void> {
    if (!this.page) return;
    const planIdx: Record<PlanType, number> = { lite: 0, pro: 1, max: 2 };
    await this.page.evaluate(({ idx, plan }) => {
      const btns = document.querySelectorAll('button');
      const target = btns[idx];
      if (target) {
        target.setAttribute('data-target', plan);
        new MutationObserver((mutations) => {
          mutations.forEach(m => {
            if (m.attributeName === 'disabled' && !(m.target as HTMLButtonElement).disabled) {
              (m.target as HTMLElement).style.border = '5px solid red';
            }
          });
        }).observe(target, { attributes: true, attributeFilter: ['disabled'] });
      }
    }, { idx: planIdx[this.plan], plan: this.plan });
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    const hasLogin = await this.page.getByRole('button', { name: '登录 / 注册' }).isVisible().catch(() => false);
    return !hasLogin;
  }

  async clickBuy(): Promise<boolean> {
    if (!this.page) return false;
    try {
      // 先尝试data-target查找
      const byAttr = this.page.locator(`[data-target="${this.plan}"]`);
      if (await byAttr.isVisible().catch(() => false)) {
        await byAttr.click({ timeout: 5000 });
      } else {
        // 通过索引
        const planIdx: Record<PlanType, number> = { lite: 0, pro: 1, max: 2 };
        const btn = this.page.locator('button').nth(planIdx[this.plan]);
        await btn.click({ timeout: 5000 });
      }

      await sleep(2000);
      const url = this.page.url();
      return url.includes('checkout') || url.includes('payment') || url.includes('order') || url.includes('pay');
    } catch {
      return false;
    }
  }

  async refresh(): Promise<void> {
    if (!this.page) return;
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(1000);
    await this.injectObserver();
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }

  getId(): number { return this.id; }
}

// ============ 主控制器 ============
class PurchaseController {
  private plan: PlanType;
  private cycle: CycleType;
  private api: ApiClient;
  private browsers: BrowserInstance[] = [];
  private success = false;
  private winner = '';

  constructor(plan: PlanType, cycle: CycleType) {
    this.plan = plan;
    this.cycle = cycle;
    this.api = new ApiClient(plan, cycle);
  }

  async init(): Promise<boolean> {
    console.clear();
    console.log('🔥🔥🔥 GLM Coding 终极抢购系统 🔥🔥🔥');
    console.log(`📦 目标: ${this.plan.toUpperCase()} ${this.cycle}`);
    console.log(`⚡ API: ${CONFIG.API_POLL_INTERVAL}ms轮询`);
    console.log(`🖥️  浏览器: ${CONFIG.BROWSER_COUNT}实例\n`);

    // API登录
    console.log('[初始化] API登录...');
    if (!await this.api.login()) {
      console.error('API登录失败，检查环境变量');
      return false;
    }
    console.log('[初始化] API登录成功\n');

    // 启动浏览器
    console.log('[初始化] 启动浏览器...');
    for (let i = 1; i <= CONFIG.BROWSER_COUNT; i++) {
      const b = new BrowserInstance(i, this.plan);
      if (!await b.launch()) continue;
      if (!await b.login()) { await b.close(); continue; }
      if (!await b.gotoPurchasePage()) { await b.close(); continue; }
      this.browsers.push(b);
      console.log(`[初始化] Browser${i} 就绪`);
    }

    if (this.browsers.length === 0) {
      console.error('没有可用的浏览器');
      return false;
    }
    console.log(`[初始化] ${this.browsers.length}个浏览器就绪\n`);
    return true;
  }

  async start(): Promise<void> {
    await this.waitUntil(CONFIG.START_HOUR, CONFIG.START_MINUTE);
    console.log('\n🚀 抢购开始！\n');

    await Promise.race([
      this.runApiMonitor(),
      ...this.browsers.map(b => this.runBrowserLoop(b)),
    ]);

    if (this.success) {
      console.log('\n' + '='.repeat(50));
      console.log(`🎉 抢购成功! [${this.winner}]`);
      console.log('='.repeat(50));
      console.log('\n请在浏览器中完成支付');
      console.log('按 Ctrl+C 退出\n');
      await new Promise(() => {});
    } else {
      console.log('\n⏰ 抢购结束，未成功');
      await this.cleanup();
      process.exit(1);
    }
  }

  async runApiMonitor(): Promise<void> {
    let count = 0;
    while (!this.success) {
      count++;
      const start = Date.now();

      const available = await this.api.checkStock();

      if (count % 50 === 0) {
        console.log(`[API] 第${count}次检查 ${available ? '🟢有货' : '🔴无货'}`);
      }

      if (available) {
        console.log(`\n[API] 🎉 检测到库存! 触发浏览器购买...`);
        const results = await Promise.all(this.browsers.map(b => b.clickBuy()));
        if (results.some(r => r)) {
          this.success = true;
          this.winner = 'API+Browser';
          return;
        }
      }

      const elapsed = Date.now() - start;
      await sleep(Math.max(0, CONFIG.API_POLL_INTERVAL - elapsed));

      if (this.isTimeUp()) break;
    }
  }

  async runBrowserLoop(browser: BrowserInstance): Promise<void> {
    const id = browser.getId();
    let count = 0;

    while (!this.success) {
      count++;

      // 检查登录
      if (!await browser.isLoggedIn()) {
        console.log(`[Browser${id}] 重新登录...`);
        continue;
      }

      // 尝试点击
      const success = await browser.clickBuy();
      if (success) {
        console.log(`\n[Browser${id}] 🎉 购买成功!`);
        this.success = true;
        this.winner = `Browser${id}`;
        return;
      }

      // 刷新
      if (count % 5 === 0) {
        console.log(`[Browser${id}] 已刷新${count}次`);
      }
      await browser.refresh();
      await sleep(random(CONFIG.REFRESH_MIN, CONFIG.REFRESH_MAX));

      if (this.isTimeUp()) break;
    }
  }

  async waitUntil(hour: number, minute: number): Promise<void> {
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    const now = new Date();
    if (now >= target) return;

    const ms = target.getTime() - now.getTime();
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);

    console.log(`⏰ 等待到 ${hour}:${minute.toString().padStart(2, '0')} (${mins}分${secs}秒)`);

    const timer = setInterval(() => {
      const r = target.getTime() - Date.now();
      if (r <= 0) { clearInterval(timer); return; }
      const m = Math.floor(r / 60000);
      const s = Math.floor((r % 60000) / 1000);
      process.stdout.write(`\r⏰ ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);

    await sleep(ms);
    clearInterval(timer);
    process.stdout.write('\n');
  }

  isTimeUp(): boolean {
    const n = new Date();
    return n.getHours() >= CONFIG.END_HOUR && n.getMinutes() >= CONFIG.END_MINUTE;
  }

  async cleanup(): Promise<void> {
    await Promise.all(this.browsers.map(b => b.close()));
  }
}

// ============ 入口 ============
async function main() {
  const args = process.argv.slice(2);
  const plan = (args[0] || 'pro') as PlanType;
  const cycle = (args[1] || 'quarterly') as CycleType;

  if (!CONFIG.PRODUCTS[plan]) {
    console.error('无效套餐:', plan);
    console.log('可用:', Object.keys(CONFIG.PRODUCTS).join(', '));
    process.exit(1);
  }

  const ctrl = new PurchaseController(plan, cycle);
  if (!await ctrl.init()) process.exit(1);
  await ctrl.start();
}

main().catch(e => { console.error(e); process.exit(1); });
