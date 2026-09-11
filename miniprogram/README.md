# 茶芽芽 · 微信小程序工程

由 `chayaya/backend` 的导出脚本生成（`npm run export:mp`），与 web 端共用同一套后端 API。

## 导入方式
1. 打开「微信开发者工具」→ 导入项目 → 选择本目录 `chayaya/miniprogram`
2. AppID 选择「测试号」即可（`project.config.json` 中为 `touristappid`）
3. 项目设置里勾选「不校验合法域名」（开发调试用）

## 后端地址
`app.js` 顶部：

```js
const BASE_URL = 'http://127.0.0.1:8788';
```

部署到阿里云 ECS 后改成 `https://你的域名`，并在微信公众平台「开发管理 → 服务器域名」把该域名加入
`request` 合法域名。

## 页面
| 页面 | 路径 | 对应项目书能力 |
|---|---|---|
| 首页 | pages/home/home | 品牌故事、热销、卖点入口 |
| 产品中心 | pages/shop/shop | 商品分类展示（3.3.1） |
| 商品详情 | pages/product/product | 卖点、参数、用法、价格对比（3.1、3.5.2） |
| 购物车 / 结算 | pages/cart、pages/checkout | 购物车与订单管理（3.3.1） |
| 订单 | pages/orders、pages/order-detail | 物流轨迹、溯源码入口 |
| 溯源 | pages/trace/trace | 一物一码、时间轴、哈希链校验（3.3.2、4.2.2） |
| AI 问症 | pages/ai/ai | 意图识别、多轮对话、症状分级、转人工（4.2.2） |
| 品牌故事 | pages/brand/brand | 产品背景与差异化优势（1.3、1.5） |
| 抚触教程 | pages/guide/guide | 分月龄用量与手法（5.1.2） |
| 我的 | pages/me/me | 三级会员体系、我的溯源码（3.2.1） |
| 登录 | pages/login/login | 手机号验证码 / 微信一键登录 |

## 医疗安全说明
AI 客服页面与对话逻辑内置医疗安全红线：命中发热、化脓渗液、精神差、拒奶、呼吸异常等关键词时，
先输出「请立即就医」再由规则引擎给出非诊疗性护理建议；大模型仅参与话术润色，不参与症状适用性判断。
