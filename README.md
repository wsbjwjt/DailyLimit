# DailyLimit - GLM Coding Plan 抢购工具

自动抢购智谱AI GLM Coding Plan 的 CLI 工具。每天上午10:00补货，本工具帮助你在9:50自动登录并等待，10:00准时抢购。

## 功能特性

- ⏰ **定时抢购**: 9:50自动登录，10:00准时点击购买
- 🎯 **多套餐支持**: Lite / Pro / Max 三种套餐可选
- 📅 **多周期选择**: 连续包月 / 连续包季(9折) / 连续包年(8折)
- 🔄 **自动重试**: 抢购失败自动重试，最多3次
- 👀 **可视化**: 浏览器窗口可见，实时监控抢购过程
- 🔒 **安全**: 账号密码本地存储，不上传任何服务器

## 环境要求

- Node.js >= 18.0.0
- npm >= 8.0.0
- Windows / macOS / Linux

## 安装步骤

### 1. 克隆仓库

```bash
git clone git@github.com:wsbjwjt/DailyLimit.git
cd DailyLimit
```

### 2. 安装依赖

```bash
npm install
```

### 3. 安装 Playwright 浏览器

**Windows:**
```bash
npx playwright install chromium
```

**macOS/Linux:**
```bash
sudo npx playwright install chromium
```

> 如果安装失败，可能需要安装系统依赖：
> ```bash
> sudo npx playwright install-deps chromium
> ```

### 4. 配置账号

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的智谱AI账号密码：

```env
# 智谱AI账号（必填）
BIGMODEL_USERNAME=你的用户名/邮箱/手机号
BIGMODEL_PASSWORD=你的密码

# 默认套餐类型（可选）: lite | pro | max
DEFAULT_PLAN=pro

# 默认订阅周期（可选）: monthly | quarterly | yearly
DEFAULT_CYCLE=quarterly
```

**注意**: `.env` 文件包含敏感信息，已加入 `.gitignore`，不会被提交到GitHub。

## 使用方法

### 方式一：开发模式（推荐测试用）

```bash
npm run dev
```

### 方式二：构建后运行

```bash
npm run build
npm start
```

### 方式三：全局安装

```bash
npm link
```

之后可以直接使用：

```bash
dailylimit
```

## 工作流程

运行命令后，按提示操作：

1. **输入URL**（直接回车使用默认）
2. **选择套餐类型**:
   - 1 = Lite (￥49/月) - 适合小型Repo
   - 2 = Pro (￥149/月) [默认] - 最受欢迎，5x Lite额度
   - 3 = Max (￥469/月) - 20x Lite额度
3. **选择订阅周期**:
   - 1 = 连续包月
   - 2 = 连续包季 (9折) [默认]
   - 3 = 连续包年 (8折)
4. **确认配置**后工具自动开始

### 抢购流程

```
🕘 9:50  自动登录智谱AI平台
⏳ 9:50-10:00  保持登录状态，等待开抢
🕙 10:00  监控购买按钮状态，立即点击
✅ 成功   停留在支付页面，你手动完成付款
```

## 套餐说明

| 套餐 | 连续包月 | 连续包季 | 连续包年 | 特点 |
|------|---------|---------|---------|------|
| Lite | ￥49/月 | ￥44.1/月 | - | 3x Claude Pro用量，适合小型Repo |
| Pro | ￥149/月 | ￥134.1/月 | - | 5x Lite额度，**最受欢迎** |
| Max | ￥469/月 | ￥422.1/月 | - | 20x Lite额度，量大管饱 |

## 常见问题

### Q: 为什么提示"Timeout 30000ms exceeded"？
A: 网络问题或页面加载慢，请检查网络连接，重试即可。

### Q: 可以同时在多台电脑运行吗？
A: 不建议，可能导致账号被限制。建议只在一台设备运行。

### Q: 抢购成功后会自动付款吗？
A: 不会。工具只负责"点击购买按钮"，付款需要你手动在浏览器中完成。

### Q: 如何查看是否抢购成功？
A: 浏览器会跳转到支付页面，同时控制台会显示"🎉 抢购成功！"

### Q: 如果10:00没抢到怎么办？
A: 工具会自动重试3次。如果都失败，可以明天再试，或尝试切换不同套餐。

## 项目结构

```
DailyLimit/
├── src/                    # 源代码
│   ├── index.ts           # CLI入口
│   ├── config.ts          # 配置加载(.env)
│   ├── cli.ts             # 交互界面
│   ├── login.ts           # 登录模块
│   └── purchase.ts        # 抢购逻辑
├── tests/                 # E2E测试
├── .env.example           # 环境变量模板
├── .gitignore            # Git忽略配置
├── package.json          # 项目依赖
├── tsconfig.json         # TypeScript配置
└── README.md             # 本文件
```

## 技术栈

- **Node.js** - 运行时
- **TypeScript** - 类型安全
- **Playwright** - 浏览器自动化
- **Commander.js** - CLI框架

## 安全说明

- ✅ 账号密码仅存储在本地 `.env` 文件
- ✅ 不收集任何用户信息
- ✅ 不上传数据到第三方服务器
- ✅ 代码开源可审计

## 免责声明

本工具仅供学习交流使用，请遵守智谱AI平台的使用条款。使用本工具产生的任何后果由使用者自行承担。

## License

MIT License

---

**祝抢购成功！🎉**
