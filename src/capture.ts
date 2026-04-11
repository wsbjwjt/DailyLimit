#!/usr/bin/env node

/**
 * API抓包分析工具
 * 用于捕获bigmodel.cn购买流程中的所有网络请求
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
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

const capturedRequests: CapturedRequest[] = [];

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

async function main() {
  const args = process.argv.slice(2);
  const username = args[0] || process.env.BIGMODEL_USERNAME;
  const password = args[1] || process.env.BIGMODEL_PASSWORD;

  if (!username || !password) {
    console.log('用法: npm run capture -- <用户名> <密码>');
    console.log('或设置环境变量 BIGMODEL_USERNAME 和 BIGMODEL_PASSWORD');
    process.exit(1);
  }

  console.log('🔧 启动抓包分析工具...');
  console.log('📝 提示：请手动点击购买按钮，观察网络请求\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  // 启用请求拦截
  await context.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // 只捕获bigmodel.cn的请求
    if (url.includes('bigmodel.cn')) {
      const headers = await request.allHeaders();

      const captured: CapturedRequest = {
        timestamp: new Date().toISOString(),
        method,
        url,
        headers: sanitizeHeaders(headers),
        postData: request.postData() || undefined,
      };

      // 继续请求并捕获响应
      const response = await route.fetch();
      captured.responseStatus = response.status();

      try {
        const body = await response.text();
        // 只保存JSON响应的前1000字符
        if (body.length < 1000) {
          captured.responseBody = body;
        } else {
          captured.responseBody = body.substring(0, 1000) + '...[truncated]';
        }
      } catch (e) {
        // 忽略非文本响应
      }

      capturedRequests.push(captured);

      // 实时打印关键请求
      if (method === 'POST' || url.includes('order') || url.includes('purchase') || url.includes('payment')) {
        console.log('\n📡 捕获关键请求:');
        console.log(`   URL: ${url}`);
        console.log(`   Method: ${method}`);
        if (captured.postData) {
          console.log(`   Payload: ${captured.postData.substring(0, 200)}`);
        }
      }

      // 继续原响应
      await route.fulfill({
        response,
      });
    } else {
      await route.continue();
    }
  });

  const page = await context.newPage();

  // 设置控制台日志捕获
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('order') || text.includes('purchase') || text.includes('api')) {
      console.log(`📢 控制台: ${text}`);
    }
  });

  // 在页面加载前注入脚本
  await context.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url, options] = args;
      console.log(`[API] Fetch: ${url}`, options);
      return originalFetch(...args);
    };
  });

  console.log('🌐 正在打开登录页面...');
  await page.goto('https://bigmodel.cn/', { waitUntil: 'networkidle' });

  // 等待用户登录
  console.log('\n👉 请在浏览器中完成登录（点击"登录/注册"按钮）');
  console.log('👉 登录完成后，按 Enter 继续...');

  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // 刷新确保登录状态
  await page.goto('https://bigmodel.cn/glm-coding', { waitUntil: 'networkidle' });
  console.log('\n✅ 已加载购买页面');
  console.log('👉 现在请手动点击购买按钮（或"立即开通"）');
  console.log('👉 完成后按 Enter 保存抓包结果...');

  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // 保存结果
  const outputDir = path.join(process.cwd(), 'capture');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const outputFile = path.join(outputDir, `capture-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(capturedRequests, null, 2));

  console.log(`\n✅ 抓包完成！结果已保存到: ${outputFile}`);
  console.log(`📊 共捕获 ${capturedRequests.length} 个请求`);

  // 分析并输出关键API
  const apiRequests = capturedRequests.filter(r =>
    r.url.includes('/api/') ||
    r.url.includes('order') ||
    r.url.includes('purchase') ||
    r.method === 'POST'
  );

  if (apiRequests.length > 0) {
    console.log('\n🔍 发现的API请求:');
    apiRequests.forEach((req, i) => {
      console.log(`\n  ${i + 1}. ${req.method} ${req.url}`);
      console.log(`     Status: ${req.responseStatus}`);
      if (req.postData) {
        console.log(`     Payload: ${req.postData.substring(0, 150)}...`);
      }
    });
  }

  console.log('\n⏳ 按 Ctrl+C 关闭浏览器');
  await new Promise(() => {});
}

main().catch(console.error);
