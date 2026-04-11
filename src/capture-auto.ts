#!/usr/bin/env node

/**
 * 自动抓包分析工具 - 非交互式版本
 * 自动完成登录并抓取所有API请求
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载.env文件
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface CapturedRequest {
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: string;
  responseStatus?: number;
  responseBody?: string;
}

const capturedRequests: CapturedRequest[] = [];
const API_ENDPOINTS: string[] = [];

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitive = ['authorization', 'cookie', 'x-token', 'api-key'];
  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const username = process.env.BIGMODEL_USERNAME;
  const password = process.env.BIGMODEL_PASSWORD;

  if (!username || !password) {
    console.log('❌ 错误：请在.env文件中设置 BIGMODEL_USERNAME 和 BIGMODEL_PASSWORD');
    process.exit(1);
  }

  console.log('🔧 启动自动抓包分析工具...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  // 启用请求拦截 - 捕获所有请求
  await context.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // 只捕获bigmodel.cn的请求
    if (url.includes('bigmodel.cn') || url.includes('zhipuai')) {
      const headers = await request.allHeaders();

      const captured: CapturedRequest = {
        timestamp: new Date().toISOString(),
        method,
        url,
        headers: sanitizeHeaders(headers),
        postData: request.postData() || undefined,
      };

      try {
        const response = await route.fetch();
        captured.responseStatus = response.status();

        const body = await response.text().catch(() => null);
        if (body && body.length < 5000) {
          captured.responseBody = body;
        }

        await route.fulfill({ response });
      } catch (e) {
        await route.continue();
      }

      capturedRequests.push(captured);

      // 实时打印API请求
      if (url.includes('/api/') || url.includes('order') || url.includes('purchase')) {
        console.log(`\n📡 API请求: ${method} ${url.split('?')[0]}`);
        API_ENDPOINTS.push(`${method} ${url.split('?')[0]}`);

        if (captured.postData) {
          try {
            const payload = JSON.parse(captured.postData);
            console.log(`   Payload:`, JSON.stringify(payload, null, 2).substring(0, 300));
          } catch {
            console.log(`   Payload: ${captured.postData.substring(0, 200)}`);
          }
        }
      }
    } else {
      await route.continue();
    }
  });

  const page = await context.newPage();

  // ===== 步骤 1: 访问首页并登录 =====
  console.log('🌐 步骤1: 访问登录页面...');
  await page.goto('https://bigmodel.cn/', { waitUntil: 'networkidle' });
  await sleep(1000);

  console.log('🔄 步骤2: 点击登录按钮...');
  await page.getByRole('button', { name: '登录 / 注册' }).click();
  await sleep(1000);

  console.log('🔄 步骤3: 切换到账号登录...');
  await page.getByRole('tab', { name: '账号登录' }).click();
  await sleep(500);

  console.log(`🔄 步骤4: 输入账号 ${username}...`);
  await page.getByRole('textbox', { name: /用户名|邮箱|手机号/ }).fill(username);
  await page.getByRole('textbox', { name: '请输入密码' }).fill(password);

  console.log('🔄 步骤5: 点击登录...');
  await page.getByRole('button', { name: '登录', exact: true }).click();

  // 等待登录完成
  await page.waitForFunction(() => {
    const dialog = document.querySelector('dialog') || document.querySelector('[role="dialog"]');
    return !dialog || !dialog.textContent?.includes('完成登录/注册');
  }, { timeout: 30000 });

  console.log('✅ 登录成功!\n');
  await sleep(2000);

  // ===== 步骤 6: 访问购买页面 =====
  console.log('🌐 步骤6: 访问购买页面...');
  await page.goto('https://bigmodel.cn/glm-coding', { waitUntil: 'networkidle' });
  console.log('✅ 已加载购买页面\n');

  await sleep(2000);

  // ===== 步骤 7: 尝试点击购买按钮（即使售罄）=====
  console.log('🔄 步骤7: 点击购买按钮以捕获API请求...');

  // 先选择订阅周期
  try {
    await page.getByText('连续包季').click();
    console.log('✅ 已选择 连续包季');
    await sleep(500);
  } catch (e) {
    console.log('⚠️ 选择周期失败，继续尝试点击购买按钮');
  }

  // 点击Pro套餐的购买按钮
  try {
    const buttons = page.locator('button');
    // 通常Pro是第二个按钮
    const proButton = buttons.nth(1);
    await proButton.click();
    console.log('✅ 已点击Pro套餐购买按钮\n');
  } catch (e) {
    console.log('⚠️ 点击购买按钮失败，可能页面结构不同\n');
  }

  await sleep(3000);

  // ===== 保存结果 =====
  const outputDir = path.join(process.cwd(), 'capture');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const timestamp = Date.now();
  const outputFile = path.join(outputDir, `capture-${timestamp}.json`);

  const result = {
    timestamp: new Date().toISOString(),
    totalRequests: capturedRequests.length,
    apiEndpoints: [...new Set(API_ENDPOINTS)],
    requests: capturedRequests,
  };

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

  console.log('='.repeat(60));
  console.log('📊 抓包完成！');
  console.log('='.repeat(60));
  console.log(`\n📁 结果已保存: ${outputFile}`);
  console.log(`📊 共捕获 ${capturedRequests.length} 个请求`);
  console.log(`🔍 发现 ${API_ENDPOINTS.length} 个API端点`);

  if (API_ENDPOINTS.length > 0) {
    console.log('\n🎯 发现的API端点:');
    [...new Set(API_ENDPOINTS)].forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
  }

  // 分析购买相关API
  const purchaseApis = capturedRequests.filter(r =>
    r.url.toLowerCase().includes('order') ||
    r.url.toLowerCase().includes('purchase') ||
    r.url.toLowerCase().includes('create') ||
    r.url.toLowerCase().includes('pay')
  );

  if (purchaseApis.length > 0) {
    console.log('\n💰 购买相关API详情:');
    purchaseApis.forEach((req, i) => {
      console.log(`\n  API ${i + 1}:`);
      console.log(`    URL: ${req.url}`);
      console.log(`    Method: ${req.method}`);
      console.log(`    Status: ${req.responseStatus}`);
      if (req.postData) {
        console.log(`    Payload: ${req.postData}`);
      }
    });
  }

  console.log('\n⏳ 5秒后关闭浏览器...');
  await sleep(5000);
  await browser.close();

  console.log('✅ 抓包分析完成！');
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
