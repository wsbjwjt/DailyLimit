# DailyLimit - GLM Coding Plan 终极抢购工具

自动抢购智谱AI GLM Coding Plan 的 CLI 工具。每天上午10:00补货，本工具采用**浏览器+API双管齐下**策略，9:45开始高频监控，一旦发现库存立即抢购。

## 🔥 核心特性

- **🚀 双管齐下**: 浏览器刷新 + API轮询同时运行，谁先成功谁优先
- **⚡ 超高速**: API每秒轮询10次(100ms间隔)，比人工快100倍
- **🛡️ 防封策略**: 浏览器4-8秒随机刷新，UA轮换，模拟人类行为
- **⏰ 智能时间**: 9:45自动登录，10:00:30自动停止
- **🎯 多套餐**: Lite/Pro/Max三种套餐，支持月/季/年订阅
- **👀 可视化**: 浏览器窗口可见，实时监控抢购过程

## 环境要求

- Node.js >= 18.0.0
- npm >= 8.0.0
- Windows / macOS / Linux

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/wsbjwjt/DailyLimit.git
cd DailyLimit
```

### 2. 安装依赖

```bash
npm install
```

### 3. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

### 4. 配置账号

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
BIGMODEL_USERNAME=你的用户名/邮箱/手机号
BIGMODEL_PASSWORD=你的密码

# 默认套餐 (lite | pro | max)
DEFAULT_PLAN=pro

# 默认周期 (monthly | quarterly | yearly)
DEFAULT_CYCLE=quarterly
```

## 使用方法

### 一键启动（推荐）

```bash
npm start
```

然后按提示选择套餐和周期即可。

### 抢购流程

```
⏰ 9:45:00  自动登录，双管齐下启动
    ├── [浏览器] 4-8秒随机刷新，监控按钮状态
    └── [API]    100ms轮询，每秒检查10次库存
    
⏰ 10:00:00 补货开始
    ├── [浏览器] 检测到按钮可用 → 立即点击
    └── [API]    检测到soldOut=false → 立即通知
    
✅ 成功  跳转到支付页面，你手动完成付款
```

### 示例输出

```
🔥🔥🔥 GLM Coding Plan 终极抢购方案 🔥🔥🔥
📦 目标: PRO quarterly
🚀 浏览器: 4-8秒随机刷新
⚡ API: 100ms轮询（每秒10次）

[9:45:03] [浏览器] ✅ 登录成功
[9:45:03] [API] ✅ 登录成功，开始轮询

[9:45:08] 浏览器已刷新5次 (856ms) | API已检查50次
[9:45:13] 浏览器已刷新10次 (923ms) | API已检查100次
...

[10:00:00] [API] 🎉🎉🎉 检测到库存！
  产品: product-fef82f
  价格: ￥402.3

🔥🔥🔥 API方案率先成功！🔥🔥🔥
⏳ 请在浏览器中完成支付
```

## 套餐与产品ID

API方案使用以下产品ID（无需手动设置，程序自动选择）：

| 套餐 | 连续包月 | 连续包季 | 连续包年 |
|------|---------|---------|---------|
| **Lite** | ￥49 | ￥132.3 (9折) | ￥470.4 (8折) |
| | `product-02434c` | `product-b8ea38` | `product-70a804` |
| **Pro** ⭐推荐 | ￥149 | ￥402.3 (9折) | ￥1430.4 (8折) |
| | `product-1df3e1` | `product-fef82f` | `product-5643e6` |
| **Max** | ￥469 | ￥1266.3 (9折) | ￥4502.4 (8折) |
| | `product-2fc421` | `product-5d3a03` | `product-d46f8b` |

## 技术方案对比

| 特性 | 浏览器方案 | API方案 |
|------|-----------|---------|
| **检测方式** | 按钮状态监控 | API库存查询 |
| **频率** | 4-8秒随机 | 100ms固定 |
| **触发时机** | 按钮变为可点击 | soldOut变为false |
| **优势** | 最直观，防封 | 最快，毫秒级响应 |

## 防封策略

- ✅ **随机间隔**: 4-8秒随机，不形成规律
- ✅ **UA轮换**: 4种浏览器标识随机使用
- ✅ **滚动模拟**: 30%概率轻微滚动页面
- ✅ **随机暂停**: 10%概率暂停2秒模拟思考

## 项目结构

```
DailyLimit/
├── src/
│   ├── index.ts          # 终极方案入口（浏览器+API）
│   ├── config.ts         # 配置加载
│   ├── login.ts          # 登录逻辑
│   ├── purchase.ts       # 浏览器抢购逻辑
│   ├── cli.ts            # 命令行交互
│   ├── capture.ts        # 手动抓包工具
│   ├── capture-auto.ts   # 自动抓包工具
│   ├── api-test.ts       # API测试
│   └── order-test.ts     # 订单API测试
├── .env.example          # 环境变量模板
├── package.json
├── tsconfig.json
└── README.md
```

## 开发工具

项目包含以下开发/调试工具：

```bash
# API测试
npx ts-node src/api-test.ts

# 订单API测试
npx ts-node src/order-test.ts

# 自动抓包（捕获购买API）
npx ts-node src/capture-auto.ts
```

## 常见问题

### Q: 抢购成功后会自动付款吗？
A: 不会。工具只负责**抢到库存**，付款需要你手动在浏览器中完成。

### Q: 为什么用两种方式？
A: **双保险**。API最快（100ms），浏览器最稳，两者同时运行提高成功率。

### Q: 会被封号吗？
A: 风险很低。浏览器有防封策略（随机间隔），API调用频率也在合理范围。

### Q: 可以同时在多台电脑运行吗？
A: 不建议。可能导致账号被限制，建议只在一台设备运行。

### Q: 如果没抢到怎么办？
A: 工具运行到10:00:30自动停止。可以明天再试，或尝试切换不同套餐。

### Q: 如何确认产品ID？
A: 运行 `npx ts-node src/api-test.ts` 可查看实时产品列表。

## 技术栈

- **Node.js** + **TypeScript**
- **Playwright** - 浏览器自动化
- **Fetch API** - 直连后端API

## 安全说明

- ✅ 账号密码仅存储在本地 `.env` 文件
- ✅ `.env` 已加入 `.gitignore`，不会提交到Git
- ✅ 不收集任何用户信息
- ✅ 代码开源可审计

## 免责声明

本工具仅供学习交流使用，请遵守智谱AI平台的使用条款。使用本工具产生的任何后果由使用者自行承担。

## License

MIT License

---

**祝抢购成功！🎉**
