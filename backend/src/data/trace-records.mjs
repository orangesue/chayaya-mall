/**
 * 溯源批次与全流程节点数据
 * 依据项目报告书 3.3.2 / 4.2.2：
 *   原料产地环境 → 种植管护 → 冷榨加工 → 成品检测 → 物流配送，全链条信息闭环
 * 批次编号、农户、加工厂等信息取自团队在报告书中绘制的溯源查询原型（图21）。
 */

export const DEFAULT_BATCH = 'CHY-20260115-01';

export const batches = [
  {
    batchNo: 'CHY-20260115-01',
    productCode: 'CY-OIL-100',
    origin: '湖南省郴州市浒口村',
    plotNo: '浒口村·东坡油茶林 A-03 地块',
    farmer: '刘子祥',
    harvestDate: '2026-01-01',
    pressDate: '2026-01-10',
    pressWorkshop: '浒口村古法榨油坊（物理低温冷榨）',
    pressTech: '物理低温冷榨（≤60℃），不添加任何化学溶剂',
    fillDate: '2026-01-16',
    factory: '湖南某母婴化妆品代工厂（具备儿童化妆品生产资质）',
    inspectionNo: 'SGS-2026-0115',
    inspectionReport: '/assets/reports/SGS-2026-0115.html',
    geo: { lat: 25.7703, lng: 113.0148 },
    landInfo: {
      area: '约 320 亩连片山茶林',
      treeAge: '百年以上老茶树为主，三代人共同养护',
      altitude: '海拔 420-680 米',
      soil: '红壤，pH 5.5-6.5，排水良好',
      manage: '人工除草、物理防虫，不使用化学除草剂',
    },
    events: [
      {
        stage: 'plant',
        stageName: '原料产地环境与种植管护',
        happenedAt: '2025-03-12',
        place: '浒口村东坡油茶林 A-03 地块',
        operator: '农户 刘子祥',
        image: '/assets/img/image23.png',
        detail: {
          '产地': '湖南省郴州市浒口村',
          '地块编号': 'A-03',
          '地理坐标': '25.7703°N, 113.0148°E',
          '土壤与海拔': '红壤 pH 5.5-6.5，海拔 420-680 米',
          '管护方式': '人工除草、物理防虫，无化学除草剂',
          '管护记录': '2025 年 3 月完成春季修枝与有机肥施用；全年 6 次人工除草',
        },
      },
      {
        stage: 'harvest',
        stageName: '果实采摘与成熟度筛选',
        happenedAt: '2026-01-01',
        place: '浒口村东坡油茶林 A-03 地块',
        operator: '农户 刘子祥',
        image: '/assets/img/image23.png',
        detail: {
          '采摘日期': '2026-01-01',
          '采摘方式': '人工采摘，只取春季第一茬饱满茶果',
          '筛选标准': '一筛无霉果、二筛无虫蛀、三筛成熟度达标，达标率 100% 方可进入压榨',
          '当批次鲜果量': '约 1,860 公斤',
        },
      },
      {
        stage: 'press',
        stageName: '物理低温冷榨加工',
        happenedAt: '2026-01-10',
        place: '浒口村古法榨油坊',
        operator: '榨油坊 老师傅',
        detail: {
          '压榨日期': '2026-01-10',
          '压榨工艺': '古法工艺 + 物理低温冷榨（≤60℃）',
          '出油率': '约 22%（冷榨出油率低于热榨，但保留更多活性成分）',
          '本批次毛油量': '约 128 升',
          '关键控制点': '不添加化学溶剂、不高温烘炒，避免苯并芘等风险物质生成',
        },
      },
      {
        stage: 'inspect',
        stageName: '成品检测与合规备案',
        happenedAt: '2026-01-15',
        place: 'SGS 第三方检测机构',
        operator: '品控 黄君然',
        detail: {
          '检测报告编号': 'SGS-2026-0115',
          '检测项目': '菌落总数、铅、砷、汞、镉、苯并芘、酸价、过氧化值、皮肤刺激性',
          '检测结论': '全部项目符合《化妆品安全技术规范》要求',
          '合规备案': '已按《儿童化妆品监督管理条例》完成儿童化妆品备案',
          '报告原文': '/assets/reports/SGS-2026-0115.html',
        },
      },
      {
        stage: 'fill',
        stageName: '无菌车间灌装与赋码',
        happenedAt: '2026-01-16',
        place: '湖南某母婴化妆品代工厂',
        operator: '代工厂 生产线',
        detail: {
          '灌装日期': '2026-01-16',
          '灌装环境': '十万级洁净车间，无菌灌装',
          '本批次产量': '3,000 瓶（100ml）',
          '赋码方式': '一瓶一码，二维码内含 ECDSA 数字签名的数字身份证',
          '包装': '食品级 PET 避光瓶 + 婴儿专用防回流泵头',
        },
      },
      {
        stage: 'logistics',
        stageName: '物流配送',
        happenedAt: '2026-01-18',
        place: '浒口村乡村物流节点 → 郴州市分拨中心',
        operator: '乡村物流点',
        detail: {
          '发货方式': '整合乡村物流节点集中发货，降低配送成本',
          '温控要求': '常温避光运输',
          '时效': '湖南省内次日达，华南地区 2-3 日达',
        },
      },
    ],
  },
  {
    batchNo: 'CHY-20260320-02',
    productCode: 'CY-OIL-30',
    origin: '湖南省郴州市浒口村',
    plotNo: '浒口村·南坡油茶林 B-07 地块',
    farmer: '周桂英',
    harvestDate: '2026-03-05',
    pressDate: '2026-03-12',
    pressWorkshop: '浒口村古法榨油坊（物理低温冷榨）',
    pressTech: '物理低温冷榨（≤60℃）',
    fillDate: '2026-03-20',
    factory: '湖南某母婴化妆品代工厂（具备儿童化妆品生产资质）',
    inspectionNo: 'SGS-2026-0318',
    inspectionReport: '/assets/reports/SGS-2026-0318.html',
    geo: { lat: 25.7681, lng: 113.0192 },
    landInfo: {
      area: '约 180 亩山茶林',
      treeAge: '30-60 年树龄为主',
      altitude: '海拔 380-520 米',
      soil: '红壤，pH 5.6-6.8',
      manage: '人工除草、物理防虫',
    },
    events: [
      {
        stage: 'plant',
        stageName: '原料产地环境与种植管护',
        happenedAt: '2025-04-02',
        place: '浒口村南坡油茶林 B-07 地块',
        operator: '农户 周桂英',
        image: '/assets/img/image23.png',
        detail: {
          '产地': '湖南省郴州市浒口村',
          '地块编号': 'B-07',
          '地理坐标': '25.7681°N, 113.0192°E',
          '管护方式': '人工除草、物理防虫，无化学除草剂',
        },
      },
      {
        stage: 'harvest',
        stageName: '果实采摘与成熟度筛选',
        happenedAt: '2026-03-05',
        place: '浒口村南坡油茶林 B-07 地块',
        operator: '农户 周桂英',
        image: '/assets/img/image23.png',
        detail: {
          '采摘日期': '2026-03-05',
          '采摘方式': '人工手采，当日送坊',
          '筛选标准': '无霉果、无虫蛀、成熟度达标',
          '当批次鲜果量': '约 940 公斤',
        },
      },
      {
        stage: 'press',
        stageName: '物理低温冷榨加工',
        happenedAt: '2026-03-12',
        place: '浒口村古法榨油坊',
        operator: '榨油坊 老师傅',
        detail: {
          '压榨日期': '2026-03-12',
          '压榨工艺': '物理低温冷榨（≤60℃）',
          '本批次毛油量': '约 62 升',
        },
      },
      {
        stage: 'inspect',
        stageName: '成品检测与合规备案',
        happenedAt: '2026-03-18',
        place: 'SGS 第三方检测机构',
        operator: '品控 黄君然',
        detail: {
          '检测报告编号': 'SGS-2026-0318',
          '检测结论': '全部项目符合《化妆品安全技术规范》要求',
          '报告原文': '/assets/reports/SGS-2026-0318.html',
        },
      },
      {
        stage: 'fill',
        stageName: '无菌车间灌装与赋码',
        happenedAt: '2026-03-20',
        place: '湖南某母婴化妆品代工厂',
        operator: '代工厂 生产线',
        detail: {
          '灌装日期': '2026-03-20',
          '本批次产量': '4,000 瓶（30ml 体验装）',
          '赋码方式': '一瓶一码，ECDSA 签名数字身份证',
        },
      },
      {
        stage: 'logistics',
        stageName: '物流配送',
        happenedAt: '2026-03-22',
        place: '浒口村乡村物流节点 → 郴州市分拨中心',
        operator: '乡村物流点',
        detail: {
          '发货方式': '乡村物流节点集中发货',
          '主要流向': '月子中心、母婴门店 B 端团购 + 线上零售',
        },
      },
    ],
  },
];

/** 生成每个批次的单品溯源码数量（一物一码） */
export const unitsPerBatch = {
  'CHY-20260115-01': 60,
  'CHY-20260320-02': 40,
};

export default { batches, DEFAULT_BATCH, unitsPerBatch };
