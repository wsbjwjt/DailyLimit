#!/usr/bin/env node

import { chromium, Browser, Page } from 'playwright';
import { loadConfig } from './config';
import { login } from './login';
import {
  navigateToPurchasePage,
  injectMutationObserver,
  preciseWaitUntil,
  purchaseWithRetry,
  keepPageAlive,
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

    // 强化3: 启动页面活跃保持（防止 9:45 后页面失效）
    console.log('🔥 启动页面活跃保持机制（防止 9:45 页面失效）...');
    const stopKeepAlive = await keepPageAlive(page);

    if (now < prepareTime) {
      const waitMs = prepareTime.getTime() - now.getTime();
      const waitMinutes = Math.floor(waitMs / 60000);
      const waitSeconds = Math.floor((waitMs % 60000) / 1000);
      console.log(
        `⏰ 等待到 9:50 开始准备（${waitMinutes} 分 ${waitSeconds} 秒）...`
      );

      // 秒级倒计时显示
      const countdownInterval = setInterval(() => {
        const remainingMs = prepareTime.getTime() - Date.now();
        if (remainingMs <= 0) {
          clearInterval(countdownInterval);
          return;
        }
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        process.stdout.write(`\r⏰ 倒计时: ${mins.toString().padStart(2, '0')} 分 ${secs.toString().padStart(2, '0')} 秒    `);
      }, 1000);

      await new Promise((resolve) => setTimeout(resolve, waitMs));
      clearInterval(countdownInterval);
      process.stdout.write('\n');
    }

    // 步骤 4: 刷新页面确保会话有效
    console.log('🔄 刷新页面...');
    await page.reload({ waitUntil: 'networkidle' });

    // 强化1: 9:50立即注入 MutationObserver 监控
    console.log('\n🔥 强化模式：注入极速监控...');
    await injectMutationObserver(page, options.plan, options.cycle);

    // 步骤 5: 精确等待到 10:00
    await preciseWaitUntil(10, 0);

    // 停止页面活跃保持（抢购阶段不需要）
    await stopKeepAlive();

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
