/**
 * 品牌内容种子数据 —— 全部取自《浒口茶油·乡味新生 项目报告书》
 * 用途：小程序「品牌故事 / 产品背景 / 优势介绍」页面的数据源，避免把文案硬编码进页面。
 */

export const brand = {
  name: '茶芽芽',
  fullName: '茶芽芽·婴儿山茶抚触油',
  series: '初生系列',
  slogan: '与茶树一同生长，伴宝宝安心长大',
  subSlogan: '源头自营，省心省钱',
  positioning: '真实乡味 · 母婴天然护肤',
  origin: '湖南省郴州市浒口村',
  originCoord: '北纬 25°（世界山茶树适生黄金地带）',
  team: '北京师范大学（珠海校区）浒口茶油助农先锋队',
  teamId: '16106641',
  competition: '第十六届全国大学生电子商务“创新、创意及创业”挑战赛 · 三农电子商务赛道',
  emotion: '天然、安心、有温度',
  story: [
    '在湖南郴州浒口村的深山里，藏着一片百年山茶林。每年春天，当第一缕阳光穿透晨雾，茶树枝头便冒出嫩绿的新芽——它们柔软、娇嫩，却蕴藏着破土而出的生命力。',
    '漫山遍野的山茶树开了又谢，结出一季饱满的果实。这份大山的馈赠，由浒口村村民以古法制作、代代相传：从茶果采摘、自然晾晒到手工压榨，每一道工序都恪守老祖宗留下的古法技艺，不含添加剂、不做过度加工，凝萃成清透的茶油，入食、养生、润肤，养育了一代代浒口子民。',
    '酒香也怕巷子深，油好也惧山岭峻。直到有一双来自浒口村儿女的手，摘下了枝头的花，把她带出深山，带进城市，带进实验室。“茶芽芽”的故事，就从这里开始。',
  ],
  // 项目书 3.2.3 品牌DNA
  dna: [
    { key: '天然', desc: '浒口山林纯净的天然植萃成分', image: '/assets/img/image3.png' },
    { key: '科学', desc: '科学验证有效的母婴护肤功效', image: '/assets/img/image3.png' },
    { key: '陪伴', desc: '亲子成长时光的忠实陪伴者', image: '/assets/img/image3.png' },
  ],
  // 项目书 1.5.1 差异化竞争优势六大维度
  advantages: [
    {
      dimension: '溯源体系',
      highEnd: '原料来自优质山茶油产区，拥有 7 项专利技术，但具体产地和加工过程以品牌整体宣传为主，消费者难以追踪单一产品源头。',
      mass: '成分表复杂，原料多为工业化采购，信息不透明，无公开溯源路径。',
      ours: '浒口村原生山茶林直供，老油坊匠人工艺传承，全程实拍溯源（可查看山林、采摘、压榨实景），原料真实可查。',
    },
    {
      dimension: '功效验证',
      highEnd: '拥有 7 项山茶油专利，通过老爸抽检 4924 项检测，获三甲医院临床测试认可。',
      mass: '功效以基础保湿、温和为主，验证多依赖品牌整体安全背书。',
      ours: '针对婴儿肌肤干燥、泛红等细分场景研发，通过皮肤刺激性测试，功效精准可验证；已在湖南郴州区域用户中积累真实口碑。',
    },
    {
      dimension: '母婴场景适配度',
      highEnd: '产品线覆盖面霜、乳、沐浴露等，包装以实用为主，未针对母婴单手操作、防洒、分龄等场景做专项优化。',
      mass: '包装大众化，部分产品有基础安全设计，整体未以“母婴深度使用场景”为核心开发。',
      ours: '融入“乡村记忆”视觉符号，加入手握弧度设计，包装兼顾安全（防洒、易握）与美感，贴合母婴日常护理场景。',
    },
    {
      dimension: '购买便捷性',
      highEnd: '电商平台全覆盖，线下商超及母婴店广泛铺货，渠道成熟。',
      mass: '电商平台、商超全覆盖，渠道属性偏大众化，缺乏深度服务。',
      ours: '线上小程序 + 本地生活平台 + 线下合作商店双线布局，B 端母婴店稳定供货，零售端精准试销，购买场景全覆盖。',
    },
    {
      dimension: '用户体验',
      highEnd: '提供标准化产品，会员体系以积分、促销为主，缺乏一对一护肤指导。',
      mass: '以单品销售为主，用户体验依赖用户自行摸索，缺少系统性服务。',
      ours: '会员制 + 私域社群运营，提供肤质适配建议、抚触教程等定制化服务，建立用户长期信任关系。',
    },
    {
      dimension: '情感价值',
      highEnd: '品牌故事源于创始人“为女儿寻找天然安全产品”的父爱初心。',
      mass: '品牌情感偏“大众家庭、温和可信”，缺乏独特文化内核。',
      ours: '以“与茶树一同生长，伴宝宝安心长大”为情感主张，绑定乡土真实与乡村助农理念，引发母婴群体深度情感共鸣。',
    },
  ],
  // 项目书 3.2.3 传播创意：极简成分 / 产地透明 / 拒绝溢价
  communication: [
    {
      title: '极简成分',
      subtitle: '高纯度天然山茶油成分',
      desc: '人体皮脂的主要成分是油酸。相较于进口橄榄油约 70% 的油酸含量，浒口村山茶油的油酸含量高达 80% 以上，并富含不饱和脂肪酸与维生素 E。产品山茶基底油含量占比高至 95%，减少各类香精、化学防腐剂添加。',
    },
    {
      title: '产地透明',
      subtitle: '一码一溯源',
      desc: '用户扫码后，不仅能看到电子质检报告，更能看到这一瓶抚触油对应的油茶林坐标、采摘日期、压榨批次甚至农户姓名，让产品安全从“品牌单向宣传”转向双方共同监督。',
    },
    {
      title: '拒绝溢价',
      subtitle: '乡村振兴下的良心国货',
      desc: '与浒口村村集体生产深度绑定，缩减达人营销预算，用户支付的每一分钱都在为更好的原料和乡村的未来付费。',
    },
  ],
  // 项目书 2.1 市场数据（用于「为什么选择我们」的说服性呈现）
  market: {
    marketSize: [
      { year: '2017', value: 85.7 }, { year: '2018', value: 98.6 }, { year: '2019', value: 114.1 },
      { year: '2020', value: 123.6 }, { year: '2021', value: 142.3 }, { year: '2022', value: 137.3 },
      { year: '2023', value: 157.3 }, { year: '2024', value: 172.8 }, { year: '2025', value: 187.5 },
      { year: '2026', value: 202.6 }, { year: '2027', value: 217.8 },
    ],
    facts: [
      { label: '2027 年中国婴童护肤市场规模预计', value: '217.8 亿元' },
      { label: 'Z 世代妈妈偏好“适合中国宝宝”的国货婴护品牌', value: '88.34%' },
      { label: '2022 年功能性护肤媒体声量同比', value: '+57.9%' },
      { label: '受访者选择抚触油时最看重“成分天然无添加”', value: '92.6%' },
      { label: '受访者最看重“温和低敏”', value: '89.8%' },
      { label: '受访者最看重“原料产地可溯源”', value: '78.5%' },
      { label: '愿意或非常愿意尝试茶芽芽抚触油', value: '82%' },
      { label: '领取试用后愿意复购的月子中心客户占比', value: '超 50%' },
    ],
    painPoints: [
      { name: '质地厚重不易吸收', ratio: 68.5 },
      { name: '包装设计不合理（难操作、易洒）', ratio: 62.3 },
      { name: '有香精与异味', ratio: 58.7 },
      { name: '成分复杂有添加剂', ratio: 45.2 },
      { name: '无溯源信息，安全性存疑', ratio: 42.6 },
      { name: '价格偏高', ratio: 32.1 },
    ],
  },
  // 项目书 3.2.1 三级会员体系
  tiers: [
    {
      code: 'xinYa',
      name: '新芽会员',
      min: 0,
      discount: 100,
      benefits: ['注册即享村集体直供价', '可查看产品基础溯源记录', '分月龄抚触教程'],
    },
    {
      code: 'chengZhang',
      name: '成长会员',
      min: 10000,
      discount: 98,
      benefits: ['定制育儿科普手册', '每月额外优惠券', '可购买浒口村其他油类产品（食用山茶油等）'],
    },
    {
      code: 'shouHu',
      name: '守护会员',
      min: 50000,
      discount: 95,
      benefits: ['免费参与“浒口村溯源之旅”', '实地参观山茶花种植基地与产品生产过程', '体验浒口特色油茶'],
    },
  ],
  // 项目书 1.3 助农闭环
  aidChain: [
    { step: '源头整合', desc: '对接村集体与合作社，锁定山茶油源头供应' },
    { step: '产品创新', desc: '古法工艺 + 物理冷榨，升级为母婴级护肤产品' },
    { step: '品牌打造', desc: '“乡村记忆”视觉符号与乡土 IP 内容矩阵' },
    { step: '渠道运营', desc: '线上小程序 + 线下月子中心/母婴店双线联动' },
    { step: '助农闭环', desc: '带动农户种植、采摘、初加工增收，收益回流村集体' },
  ],
  // 项目书 1.5.2 全程溯源体系四环节
  traceFlow: [
    { key: 'plant', name: '茶树种植', desc: '有机种植 / 产地信息' },
    { key: 'harvest', name: '果实采摘', desc: '成熟度筛选 / 采摘时间' },
    { key: 'press', name: '冷榨加工', desc: '低温冷榨 / 工艺标准' },
    { key: 'fill', name: '成品灌装', desc: '无菌车间 / 质检报告' },
  ],
  compliance: [
    '执行《儿童化妆品监督管理条例》，完成儿童化妆品备案与成分检测',
    '原料准入执行“三筛”标准：一筛种植环境（无污染）、二筛采摘工艺（无霉果）、三筛压榨流程（物理低温冷榨），达标率 100% 方可进入生产环节',
    '产品详情页动态更新每批次原料的农残检测报告',
  ],
  images: {
    poster: '/assets/img/image17.png',
    brandDna: '/assets/img/image3.png',
    roadmap: '/assets/img/image4.png',
    closedLoop: '/assets/img/image5.jpeg',
    positioning: '/assets/img/image6.png',
    traceSystem: '/assets/img/image7.png',
    bottlePair: '/assets/img/image18.png',
    bottleLying: '/assets/img/image19.png',
    bottle30: '/assets/img/image20.png',
    pumpHead: '/assets/img/image21.png',
    antiFake: '/assets/img/image22.jpeg',
    scenePicking: '/assets/img/image23.png',
    marketSize: '/assets/img/image8.png',
    shareTrend: '/assets/img/image9.png',
    demandShift: '/assets/img/image10.png',
    preferencePie: '/assets/img/image11.png',
    infoChannel: '/assets/img/image13.png',
    productFlow: '/assets/img/image16.png',
    uiProduct: '/assets/img/image24.png',
    uiAi: '/assets/img/image25.png',
    traceDashboard: '/assets/img/image26.jpeg',
    traceUpload: '/assets/img/image27.jpeg',
    traceQuery: '/assets/img/image28.jpeg',
    profitTrend: '/assets/img/image31.png',
  },
};

export default brand;
