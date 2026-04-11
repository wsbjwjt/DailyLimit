import { Page } from 'playwright';

export interface LoginCredentials {
  username: string;
  password: string;
}

export async function login(page: Page, credentials: LoginCredentials): Promise<void> {
  console.log('🔄 正在登录...');

  // 访问首页
  await page.goto('https://bigmodel.cn/', { waitUntil: 'networkidle' });

  // 点击登录/注册按钮
  await page.getByRole('button', { name: '登录 / 注册' }).click();

  // 等待登录对话框出现
  await page.waitForSelector('text=完成登录/注册', { timeout: 5000 });

  // 切换到账号登录
  await page.getByRole('tab', { name: '账号登录' }).click();

  // 填写账号
  await page.getByRole('textbox', { name: /用户名|邮箱|手机号/ }).fill(credentials.username);

  // 填写密码
  await page.getByRole('textbox', { name: '请输入密码' }).fill(credentials.password);

  // 点击登录
  await page.getByRole('button', { name: '登录', exact: true }).click();

  // 等待登录成功 - 检查登录对话框是否关闭，并等待页面状态变化
  await page.waitForFunction(() => {
    // 检查登录对话框是否消失
    const dialog = document.querySelector('dialog') || document.querySelector('[role="dialog"]');
    if (dialog && dialog.textContent?.includes('完成登录/注册')) {
      return false;
    }
    return true;
  }, { timeout: 30000 });

  // 额外等待一下页面状态更新
  await page.waitForTimeout(2000);

  console.log('✅ 登录成功');
}

export async function ensureLoggedIn(page: Page, credentials: LoginCredentials): Promise<void> {
  // 检查是否已登录
  const consoleLink = page.locator('text=控制台');
  const isLoggedIn = await consoleLink.isVisible().catch(() => false);

  if (!isLoggedIn) {
    await login(page, credentials);
  } else {
    console.log('✅ 已登录');
  }
}
