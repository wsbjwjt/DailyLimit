import * as readline from 'readline';
import { PlanType, CycleType, validatePlan, validateCycle } from './config';

export interface CliOptions {
  url: string;
  plan: PlanType;
  cycle: CycleType;
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function runCli(
  defaultPlan: PlanType = 'pro',
  defaultCycle: CycleType = 'quarterly'
): Promise<CliOptions> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('🎯 GLM Coding Plan 抢购工具\n');

    // 询问 URL
    const url = await askQuestion(rl, '请输入购买页面URL (默认: https://bigmodel.cn/glm-coding): ');
    const finalUrl = url || 'https://bigmodel.cn/glm-coding';

    // 询问套餐类型
    let plan: PlanType = defaultPlan;
    const planInput = await askQuestion(
      rl,
      `请选择套餐类型:\n` +
      `  1. Lite (基础版)\n` +
      `  2. Pro (推荐，最受欢迎) [默认]\n` +
      `  3. Max (高级版)\n` +
      `请输入选项 (1/2/3，默认 2): `
    );

    if (planInput === '1') plan = 'lite';
    else if (planInput === '3') plan = 'max';
    else plan = defaultPlan;

    // 询问订阅周期
    let cycle: CycleType = defaultCycle;
    const cycleInput = await askQuestion(
      rl,
      `请选择订阅周期:\n` +
      `  1. 连续包月\n` +
      `  2. 连续包季 (9折) [默认]\n` +
      `  3. 连续包年 (8折)\n` +
      `请输入选项 (1/2/3，默认 2): `
    );

    if (cycleInput === '1') cycle = 'monthly';
    else if (cycleInput === '3') cycle = 'yearly';
    else cycle = defaultCycle;

    console.log('\n📋 配置确认:');
    console.log(`  URL: ${finalUrl}`);
    console.log(`  套餐: ${plan.toUpperCase()}`);
    console.log(`  周期: ${cycle === 'monthly' ? '连续包月' : cycle === 'quarterly' ? '连续包季' : '连续包年'}`);

    const confirm = await askQuestion(rl, '\n确认开始? (y/n，默认 y): ');
    if (confirm.toLowerCase() === 'n') {
      throw new Error('用户取消');
    }

    return {
      url: finalUrl,
      plan,
      cycle,
    };
  } finally {
    rl.close();
  }
}

export function printHelp(): void {
  console.log(`
Usage: dailylimit [options]

Options:
  -h, --help      显示帮助信息
  -v, --version   显示版本号

Environment Variables:
  BIGMODEL_USERNAME    智谱AI账号（用户名/邮箱/手机号）
  BIGMODEL_PASSWORD    智谱AI密码
  DEFAULT_PLAN         默认套餐 (lite|pro|max)，默认 pro
  DEFAULT_CYCLE        默认周期 (monthly|quarterly|yearly)，默认 quarterly

Examples:
  dailylimit                    交互式运行
  BIGMODEL_USERNAME=user BIGMODEL_PASSWORD=pass dailylimit
`);
}
