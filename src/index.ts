#!/usr/bin/env node

import { chromium, Browser, Page } from 'playwright';
import { loadConfig } from './config';
import { login } from './login';
import { navigateToPurchasePage, waitForPurchaseTime, purchaseWithRetry } from './purchase';
import { runCli, printHelp } from './cli';

const VERSION = '1.0.0';

async function main() {
  // 解析命令行参数
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
    // 加载配置
    console.log('🔧 加载配置...');
    const config = loadConfig();
    console.log('✅ 配置加载成功\n');

    // 运行 CLI 交互
    const options = await runCli(config.defaultPlan, config.defaultCycle);

    console.log('\n🚀 启动浏览器...');

    // 启动浏览器
    browser = await chromium.launch({
      headless: false, // 显示浏览器窗口，方便用户观察
      slowMo: 50, // 稍微慢一点，避免被识别为机器人
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
    const loginTime = new Date();
    loginTime.setHours(9, 50, 0, 0);

    if (now < loginTime) {
      const waitMs = loginTime.getTime() - now.getTime();
      const waitMinutes = Math.floor(waitMs / 60000);
      console.log(`⏰ 等待到 9:50 开始准备（约 ${waitMinutes} 分钟）...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    // 步骤 4: 刷新页面确保会话有效
    console.log('🔄 刷新页面...');
    await page.reload({ waitUntil: 'networkidle' });

    // 步骤 5: 等待到 10:00 抢购时间
    await waitForPurchaseTime(page, 10, 0);

    // 步骤 6: 执行抢购
    const success = await purchaseWithRetry(page, {
      plan: options.plan,
      cycle: options.cycle,
    });

    if (success) {
      console.log('\n🎉 抢购成功！请在浏览器中完成支付。');
      console.log('⏳ 浏览器将保持打开状态，按 Ctrl+C 退出程序。');

      // 保持浏览器打开
      await new Promise(() => {});
    } else {
      console.log('\n❌ 抢购失败，请手动重试。');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ 错误:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    if (browser) {
      // 不关闭浏览器，让用户完成支付
      // await browser.close();
    }
  }
}

main();
