#!/usr/bin/env node

/**
 * API抓取工具
 * 通过浏览器监听网络请求，找出真实的购买API
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const API_LOG_FILE = path.resolve(process.cwd(), 'api-capture.log');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(API_LOG_FILE, line);
}

async function main() {
  // 清空日志文件
  fs.writeFileSync(API_LOG_FILE, '# API抓取日志\n\n');

  console.log('🚀 启动浏览器并监听API请求...');
  console.log('请手动操作：登录 -> 进入GLM Coding页面 -> 点击购买按钮');
  console.log('观察控制台输出的API请求\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: ['--disable-web-security'] // 允许跨域请求查看
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordHar: {
      path: path.resolve(process.cwd(), 'network.har'),
      urlFilter: '**/api/**'
    }
  });

  // 监听所有API请求和响应
  context.on('request', request => {
    const url = request.url();
    if (url.includes('/api/') || url.includes('/pay/') || url.includes('/order/')) {
      log(`[REQUEST] ${request.method()} ${url}`);
      const headers = request.headers();
      if (headers['authorization']) {
        log(`  Authorization: ${headers['authorization'].substring(0, 50)}...`);
      }
      if (request.method() === 'POST') {
        const postData = request.postData();
        if (postData) {
          log(`  Body: ${postData.substring(0, 1000)}`);
        }
      }
    }
  });

  context.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('/pay/') || url.includes('/order/')) {
      const status = response.status();
      log(`[RESPONSE ${status}] ${response.request().method()} ${url}`);

      if (status === 200) {
        try {
          const body = await response.text();
          // 只记录JSON响应
          if (body.trim().startsWith('{')) {
            log(`  Body: ${body.substring(0, 1000)}`);

            // 特别记录包含关键信息的响应
            if (body.includes('order') || body.includes('pay') || body.includes('purchase')) {
              log(`  🎯 关键响应! order/pay/purchase 相关`);
            }
          }
        } catch {}
      }
    }
  });

  const page = await context.newPage();

  // 注入脚本监听页面内的fetch/XHR
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url, options] = args;
      console.log(`[FETCH] ${options?.method || 'GET'} ${url}`, options?.body);
      return originalFetch(...args);
    };

    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = class extends originalXHR {
      open(method: string, url: string) {
        console.log(`[XHR] ${method} ${url}`);
        return super.open(method, url, true);
      }
      send(body?: any) {
        if (body) console.log(`[XHR Body]`, body);
        return super.send(body);
      }
    } as any;
  });

  await page.goto('https://bigmodel.cn/glm-coding');

  console.log('\n' + '='.repeat(60));
  console.log('浏览器已打开');
  console.log('');
  console.log('操作步骤:');
  console.log('  1. 如果未登录，先登录');
  console.log('  2. 选择要购买的套餐（Lite/Pro/Max）');
  console.log('  3. 选择周期（连续包月/包季/包年）');
  console.log('  4. 点击"立即开通"或"立即购买"按钮');
  console.log('  5. 观察控制台输出的API请求');
  console.log('');
  console.log('日志文件:', API_LOG_FILE);
  console.log('HAR文件:', path.resolve(process.cwd(), 'network.har'));
  console.log('='.repeat(60) + '\n');

  // 保持运行直到用户按Ctrl+C
  await new Promise(() => {});
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
