#!/usr/bin/env node

import { chromium, Browser, Page } from 'playwright';
import { loadConfig } from './config';
import { login } from './login';
import {
  navigateToPurchasePage,
  injectMutationObserver,
  preciseWaitUntil,
  purchaseWithRetry,
} from './purchase';
import { runCli, printHelp } from './cli';

const VERSION = '1.0.0';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(VERSION);
    process.exit(0);
  }

  let browser: Browser | null = null;

  try {
    console.log('🔧 加载配置...');
    const config = loadConfig();
    console.log('✅ 配置加载成功\n');

    const options = await runCli(config.defaultPlan, config.defaultCycle);

    console.log('\n🚀 启动浏览器...');

    browser = await chromium.launch({
      headless: false,
      slowMo: 20,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
    });

    const page = await context.newPage();

    // 步骤 1: 登录
    await login(page, {
      username: config.username,
      password: config.password,
    });

    // 步骤 2: 访问购买页面
    await navigateToPurchasePage(page);

    // 步骤 3: 等待到 9:50 或立即开始
    const now = new Date();
    const prepareTime = new Date();
    prepareTime.setHours(9, 50, 0, 0);

    if (now < prepareTime) {
      const waitMs = prepareTime.getTime() - now.getTime();
      const waitMinutes = Math.floor(waitMs / 60000);
      console.log(
        `⏰ 等待到 9:50 开始准备（约 ${waitMinutes} 分钟）...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    // 步骤 4: 刷新页面确保会话有效
    console.log('🔄 刷新页面...');
    await page.reload({ waitUntil: 'networkidle' });

    // 强化1: 9:50立即注入 MutationObserver 监控
    console.log('\n🔥 强化模式：注入极速监控...');
    await injectMutationObserver(page, options.plan, options.cycle);

    // 步骤 5: 精确等待到 10:00
    await preciseWaitUntil(10, 0);

    // 步骤 6: 执行抢购（MutationObserver会自动点击）
    const success = await purchaseWithRetry(page, {
      plan: options.plan,
      cycle: options.cycle,
    });

    if (success) {
      console.log('\n🎉 抢购成功！请在浏览器中完成支付。');
      console.log('⏳ 浏览器将保持打开状态，按 Ctrl+C 退出程序。');

      await new Promise(() => {});
    } else {
      console.log('\n❌ 抢购失败，请手动重试。');
      process.exit(1);
    }
  } catch (error) {
    console.error(
      '\n❌ 错误:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    if (browser) {
      // 不关闭浏览器
    }
  }
}

main();
