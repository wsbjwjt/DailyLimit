import { test, expect } from '@playwright/test';
import { login } from '../src/login';
import { navigateToPurchasePage, selectCycle, PurchaseOptions } from '../src/purchase';

test.describe('登录流程测试', () => {
  test('账号密码登录成功', async ({ page }) => {
    // 使用环境变量中的账号密码
    const username = process.env.TEST_USERNAME || 'test_user';
    const password = process.env.TEST_PASSWORD || 'test_pass';

    await login(page, { username, password });

    // 验证登录成功（跳转到控制台页面）
    await expect(page).toHaveURL(/.*console.*/);
  });

  test('登录页面元素存在', async ({ page }) => {
    await page.goto('https://bigmodel.cn/');

    // 验证登录按钮存在
    const loginButton = page.getByRole('button', { name: '登录 / 注册' });
    await expect(loginButton).toBeVisible();

    // 点击登录按钮
    await loginButton.click();

    // 验证登录对话框出现
    await expect(page.getByText('完成登录/注册')).toBeVisible();

    // 验证账号登录 tab 存在
    await expect(page.getByRole('tab', { name: '账号登录' })).toBeVisible();
  });
});

test.describe('购买页面测试', () => {
  test('购买页面加载成功', async ({ page }) => {
    await navigateToPurchasePage(page);

    // 验证页面标题
    await expect(page.getByText('GLM Coding Plan')).toBeVisible();

    // 验证套餐选项存在
    await expect(page.getByText('Lite')).toBeVisible();
    await expect(page.getByText('Pro')).toBeVisible();
    await expect(page.getByText('Max')).toBeVisible();
  });

  test('订阅周期选择', async ({ page }) => {
    await navigateToPurchasePage(page);

    // 测试选择连续包月
    await selectCycle(page, 'monthly');

    // 测试选择连续包季
    await selectCycle(page, 'quarterly');

    // 测试选择连续包年
    await selectCycle(page, 'yearly');
  });

  test('购买按钮状态监控', async ({ page }) => {
    await navigateToPurchasePage(page);

    // 获取 Lite 套餐购买按钮
    const buttons = page.locator('button');
    const liteButton = buttons.nth(0);

    // 验证按钮存在
    await expect(liteButton).toBeVisible();

    // 获取按钮禁用状态（当前应该是 disabled）
    const isDisabled = await liteButton.isDisabled();
    console.log(`按钮当前状态: ${isDisabled ? 'disabled' : 'enabled'}`);
  });
});

test.describe('抢购流程集成测试', () => {
  test('完整流程 - 登录到购买页面', async ({ page }) => {
    // 步骤 1: 登录
    const username = process.env.TEST_USERNAME || 'test_user';
    const password = process.env.TEST_PASSWORD || 'test_pass';

    await login(page, { username, password });

    // 步骤 2: 访问购买页面
    await navigateToPurchasePage(page);

    // 步骤 3: 选择订阅周期
    await selectCycle(page, 'quarterly');

    // 验证页面状态
    await expect(page).toHaveURL('https://bigmodel.cn/glm-coding');
  });
});
