#!/usr/bin/env node

/**
 * 终极抢购入口
 * 用法: npm run purchase [plan] [cycle]
 * 示例: npm run purchase pro quarterly
 */

import { main } from './purchase-core';

main().catch(console.error);
