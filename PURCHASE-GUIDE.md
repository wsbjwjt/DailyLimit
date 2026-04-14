# 终极抢购方案使用指南

## 快速开始

### 1. 环境准备
```bash
# 确保已安装依赖
npm install

# 确保已设置环境变量（.env文件）
BIGMODEL_USERNAME=你的手机号
BIGMODEL_PASSWORD=你的密码
```

### 2. 启动抢购

```bash
# 默认抢购 Pro 季度套餐
npm start

# 指定套餐和周期
npm start pro quarterly    # Pro季度
npm start max monthly      # Max月度
npm start lite yearly      # Lite年度
```

**特点：**
- API高速轮询检测库存（100ms间隔）
- 2个浏览器实例同时操作
- API发现库存后立即触发浏览器点击
- 谁先成功谁优先

---

## 核心改进

### 1. 多浏览器并发
- 启动2个独立的浏览器实例
- 各自独立登录和操作
- 提高成功概率

### 2. MutationObserver增强
- 页面注入监控脚本
- 实时检测按钮状态变化
- 按钮可用时立即点击

### 3. 智能点击策略
- 先通过data属性查找目标按钮
- 失败时通过索引查找
- 自动处理登录失效

### 4. API库存检测
```typescript
// 核心API
POST /api/biz/pay/batch-preview
Response: {
  success: true,
  data: {
    productList: [{
      productId: "product-fef82f",
      soldOut: false,      // 关键字段
      forbidden: false     // 关键字段
    }]
  }
}
```

---

## 调试工具

### 抓取真实API
```bash
npm run capture
```
手动操作浏览器，观察控制台输出的API请求，找出真正的下单接口。

### 测试API
```bash
npm run test-api
npm run test-order
```

---

## 常见问题

### Q: API检测到有货但点击失败？
A: 可能原因：
1. 按钮还没真正渲染为可用状态
2. 页面需要额外刷新才能同步库存状态
3. 需要等待更长时间让页面更新

**解决方案：**
- 系统会自动刷新页面并重试
- 多浏览器实例提高成功率

### Q: 如何避免被封IP？
A:
- 使用随机刷新间隔（3-6秒）
- 使用正常User-Agent
- 避免过高频率的API调用

### Q: 抢购成功后怎么办？
A:
- 浏览器会自动跳转到支付页面
- 在浏览器中完成扫码支付
- 程序会保持运行直到你按 Ctrl+C

---

## 购买流程分析

```
┌─────────────────────────────────────────────────────────┐
│  9:57 开始                                              │
│  ├─ API高速轮询 (100ms)                                 │
│  ├─ Browser1 刷新页面 (3-6s随机)                        │
│  └─ Browser2 刷新页面 (3-6s随机)                        │
│                                                         │
│  10:00 发现库存!                                        │
│  ├─ API触发所有浏览器立即点击                           │
│  ├─ Browser1 点击购买按钮 → 跳转支付页                  │
│  └─ Browser2 点击购买按钮 → 跳转支付页                  │
│                                                         │
│  成功 → 跳转支付页面 → 用户完成支付                     │
└─────────────────────────────────────────────────────────┘
```

---

## 后续优化方向

如果发现真实下单API，可以添加：
```typescript
// 直接API下单
const order = await api.createOrder(productId);
const payUrl = await api.getPayUrl(order.id);
```

目前先通过浏览器自动化完成购买流程。
