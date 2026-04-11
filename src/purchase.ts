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

const PLAN_INDEX: Record<string, number> = { lite: 0, pro: 1, max: 2 };

export async function navigateToPurchasePage(page: Page): Promise<void> {
  console.log('🔄 访问购买页面...');
  await page.goto('https://bigmodel.cn/glm-coding', { waitUntil: 'networkidle' });
  console.log('✅ 已加载购买页面');
}

export async function selectCycle(page: Page, cycle: CycleType): Promise<void> {
  console.log(`🔄 选择订阅周期: ${CYCLE_NAMES[cycle]}...`);
  await page.getByText(CYCLE_NAMES[cycle]).click();
  console.log(`✅ 已选择 ${CYCLE_NAMES[cycle]}`);
}

/**
 * 强化1: MutationObserver 极速监控
 * 在页面注入 MutationObserver，监控按钮状态变化，响应速度比 waitForFunction 快10倍
 */
export async function injectMutationObserver(
  page: Page,
  plan: PlanType,
  cycle: CycleType
): Promise<void> {
  console.log('🎯 注入 MutationObserver 监控...');

  await page.evaluate(
    ({ planType, cycleType }) => {
      const planIndex: Record<string, number> = { lite: 0, pro: 1, max: 2 };
      const buttonIndex = planIndex[planType];

      // 预选好订阅周期
      const cycleMap: Record<string, string> = {
        monthly: '连续包月',
        quarterly: '连续包季',
        yearly: '连续包年',
      };
      const cycleButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const btn of cycleButtons) {
        if (btn.textContent?.includes(cycleMap[cycleType])) {
          (btn as HTMLElement).click();
          break;
        }
      }

      // 获取目标购买按钮
      const buttons = document.querySelectorAll('button');
      const targetButton = buttons[buttonIndex];

      if (!targetButton) {
        console.error('未找到购买按钮');
        return;
      }

      console.log(`开始监控 ${planType} 套餐按钮...`);

      // 如果按钮已经可用，直接点击
      if (!targetButton.disabled) {
        console.log('按钮已可用，立即点击！');
        targetButton.click();
        return;
      }

      // 使用 MutationObserver 监控按钮属性变化
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'disabled') {
            const isDisabled = (mutation.target as HTMLButtonElement).disabled;
            if (!isDisabled) {
              console.log('🔥 按钮变为可用，立即点击！');
              observer.disconnect();
              (mutation.target as HTMLButtonElement).click();
            }
          }
        });
      });

      observer.observe(targetButton, {
        attributes: true,
        attributeFilter: ['disabled'],
      });

      // 同时监控按钮是否被替换（页面重新渲染）
      const bodyObserver = new MutationObserver(() => {
        const buttons = document.querySelectorAll('button');
        const newButton = buttons[buttonIndex];
        if (newButton && !newButton.disabled && newButton !== targetButton) {
          console.log('🔥 发现新的可用按钮，立即点击！');
          bodyObserver.disconnect();
          observer.disconnect();
          newButton.click();
        }
      });

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // 设置全局标记，方便外部检查监控是否注入成功
      (window as any).__purchaseObserverInjected = true;
      (window as any).__targetPlan = planType;
    },
    { planType: plan, cycleType: cycle }
  );

  console.log('✅ MutationObserver 监控已注入');
}

/**
 * 强化2: 本地时钟精确同步
 * 使用忙等待机制，确保毫秒级精确度
 */
export async function preciseWaitUntil(
  targetHour: number,
  targetMinute: number
): Promise<void> {
  const now = new Date();
  const target = new Date();
  target.setHours(targetHour, targetMinute, 0, 0);

  if (now > target) {
    console.log('⏰ 今天的抢购时间已过，等待到明天...');
    target.setDate(target.getDate() + 1);
  }

  const targetTime = target.getTime();
  const waitMs = targetTime - Date.now();

  if (waitMs <= 0) {
    console.log('⏰ 抢购时间到！');
    return;
  }

  const waitMinutes = Math.floor(waitMs / 60000);
  console.log(
    `⏰ 等待到 ${target.toLocaleTimeString()}（约 ${waitMinutes} 分钟）...`
  );

  // 先使用 setTimeout 等待到目标时间前 100ms
  const preWaitTime = waitMs - 100;
  if (preWaitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, preWaitTime));
  }

  // 忙等待最后 100ms，精确到毫秒级
  console.log('⏰ 进入精确等待模式...');
  while (Date.now() < targetTime) {
    // 空循环，忙等待
  }

  console.log(`🚀 精确时间到！${new Date().toISOString()}`);
}

export async function purchasePlan(
  page: Page,
  options: PurchaseOptions
): Promise<boolean> {
  const { plan, cycle } = options;

  console.log(
    `🎯 准备抢购 ${PLAN_NAMES[plan]} 套餐 (${CYCLE_NAMES[cycle]})...`
  );

  try {
    // 等待抢购时间（精确时间控制）
    await preciseWaitUntil(10, 0);

    console.log('⏳ 等待 MutationObserver 触发点击...');

    // 等待几秒观察是否跳转
    await page.waitForTimeout(5000);

    // 检查是否跳转到了支付页面
    const currentUrl = page.url();
    const isSuccess =
      currentUrl.includes('checkout') ||
      currentUrl.includes('payment') ||
      currentUrl.includes('order');

    if (isSuccess) {
      console.log('🎉 抢购成功！请在浏览器中完成支付。');
      return true;
    }

    // 如果没有跳转，可能是 MutationObserver 没有触发，尝试备用方案
    console.log('⚠️ 未检测到跳转，尝试备用点击方案...');

    const buttonIndex = PLAN_INDEX[plan];
    const buttons = page.locator('button');
    await buttons.nth(buttonIndex).click();

    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const finalSuccess =
      finalUrl.includes('checkout') ||
      finalUrl.includes('payment') ||
      finalUrl.includes('order');

    if (finalSuccess) {
      console.log('🎉 抢购成功（备用方案）！请在浏览器中完成支付。');
      return true;
    }

    console.log('❌ 抢购失败');
    return false;
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log('❌ 所有重试都失败了');
  return false;
}
