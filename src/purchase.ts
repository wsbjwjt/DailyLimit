import { Page } from 'playwright';
import type { PlanType, CycleType } from './config';

export interface PurchaseOptions {
  plan: PlanType;
  cycle: CycleType;
}

const PLAN_NAMES: Record<PlanType, string> = {
  lite: 'Lite',
  pro: 'Pro',
  max: 'Max',
};

const CYCLE_NAMES: Record<CycleType, string> = {
  monthly: '连续包月',
  quarterly: '连续包季',
  yearly: '连续包年',
};

export async function navigateToPurchasePage(page: Page): Promise<void> {
  console.log('🔄 访问购买页面...');
  await page.goto('https://bigmodel.cn/glm-coding', { waitUntil: 'networkidle' });
  console.log('✅ 已加载购买页面');
}

export async function selectCycle(page: Page, cycle: CycleType): Promise<void> {
  console.log(`🔄 选择订阅周期: ${CYCLE_NAMES[cycle]}...`);

  const cycleText = CYCLE_NAMES[cycle];
  await page.getByText(cycleText).click();

  console.log(`✅ 已选择 ${cycleText}`);
}

export async function waitForPurchaseTime(
  page: Page,
  targetHour: number = 10,
  targetMinute: number = 0
): Promise<void> {
  const now = new Date();
  const target = new Date();
  target.setHours(targetHour, targetMinute, 0, 0);

  // 如果今天的时间已过，等待到明天的同一时间
  if (now > target) {
    console.log('⏰ 今天的抢购时间已过，等待到明天...');
    target.setDate(target.getDate() + 1);
  }

  const waitMs = target.getTime() - now.getTime();
  const waitMinutes = Math.floor(waitMs / 60000);

  if (waitMs > 0) {
    console.log(`⏰ 等待到 ${target.toLocaleTimeString()}（约 ${waitMinutes} 分钟）...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  console.log('⏰ 抢购时间到！');
}

export async function purchasePlan(
  page: Page,
  options: PurchaseOptions
): Promise<boolean> {
  const { plan, cycle } = options;

  console.log(`🎯 准备抢购 ${PLAN_NAMES[plan]} 套餐 (${CYCLE_NAMES[cycle]})...`);

  // 选择订阅周期
  await selectCycle(page, cycle);

  // 等待购买按钮变为可用状态
  const planIndex: Record<PlanType, number> = { lite: 0, pro: 1, max: 2 };
  const buttonIndex = planIndex[plan];

  console.log('⏳ 等待购买按钮可用...');

  try {
    // 等待按钮从 disabled 变为 enabled
    await page.waitForFunction(
      (index: number) => {
        const buttons = document.querySelectorAll('button');
        const targetButton = buttons[index];
        return targetButton && !targetButton.disabled;
      },
      buttonIndex,
      { timeout: 60000 }
    );

    console.log('🚀 购买按钮已可用，立即点击！');

    // 点击购买按钮
    const buttons = page.locator('button');
    await buttons.nth(buttonIndex).click();

    console.log('✅ 已点击购买按钮');

    // 等待页面跳转到支付页面
    await page.waitForTimeout(3000);

    console.log('🎉 抢购成功！请在浏览器中完成支付。');
    return true;
  } catch (error) {
    console.error('❌ 抢购失败:', error);
    return false;
  }
}

export async function purchaseWithRetry(
  page: Page,
  options: PurchaseOptions,
  maxRetries: number = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n📝 第 ${attempt}/${maxRetries} 次尝试...`);

    const success = await purchasePlan(page, options);
    if (success) return true;

    if (attempt < maxRetries) {
      console.log('🔄 等待 1 秒后重试...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('❌ 所有重试都失败了');
  return false;
}
