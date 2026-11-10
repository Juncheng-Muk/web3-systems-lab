export interface Module {
  id: string;
  week: number;
  title: string;
  subtitle: string;
  level: '基础' | '进阶' | '综合';
  hours: number;
  concepts: string[];
  tasks: string[];
  acceptance: string[];
  command: string;
  files: string[];
  resources: { label: string; url: string }[];
  lab: 'merkle' | 'amm' | 'indexer' | 'ledger' | 'contracts' | 'overview';
}

// The delivered implementation is the reference. Tasks ask the learner to extend it.
export const modules: Module[] = [
  {
    id: 'foundations',
    week: 1,
    title: '工程基础与精确计算',
    subtitle: '从终端、Git 和 TypeScript 开始。',
    level: '基础',
    hours: 8,
    concepts: ['TypeScript', 'BigInt', 'Property testing'],
    tasks: [
      '安装 Node.js 24 与 pnpm，克隆仓库并运行首个测试。',
      '阅读 AMM 的纯函数；用 BigInt 复现超过 2⁵³ 的金额，比较 Number 的误差。',
      '新增一个向下取整边界用例，以独立 commit 提交。',
    ],
    acceptance: [
      '能在干净目录完成依赖安装和构建。',
      '解释单元测试与性质测试的区别；金额不经过浮点运算。',
    ],
    command: 'pnpm exec vitest run tests/core/amm.test.ts',
    files: ['src/core/amm.ts', 'tests/core/amm.test.ts'],
    resources: [
      {
        label: 'TypeScript Handbook',
        url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
      },
      { label: 'fast-check', url: 'https://fast-check.dev/docs/introduction/' },
    ],
    lab: 'amm',
  },
  {
    id: 'cryptography',
    week: 2,
    title: '哈希、Merkle 与内容寻址',
    subtitle: '让数据完整性成为可验证的证据。',
    level: '基础',
    hours: 10,
    concepts: ['Keccak-256', 'Merkle proof', 'CIDv1'],
    tasks: [
      '在实验室修改一个叶子，观察 root 和 proof 的变化。',
      '阅读叶子、内部节点与 root 的域分离；补充奇数叶子和重复叶子测试。',
      '计算原始数据块的 CID，修改一个字节并验证完整性失败。',
    ],
    acceptance: [
      '正确证明通过；篡改值、索引、叶子总数均被拒绝。',
      '说明 O(n) 建树 / O(log n) 证明和 raw CID 与 UnixFS 的区别。',
    ],
    command: 'pnpm exec vitest run tests/core/merkle.test.ts tests/core/content.test.ts',
    files: ['src/core/merkle.ts', 'src/core/content.ts', 'tests/core/merkle.test.ts'],
    resources: [
      {
        label: 'IPFS content identifiers',
        url: 'https://docs.ipfs.tech/concepts/content-addressing/',
      },
      {
        label: 'Ethereum cryptography',
        url: 'https://ethereum.org/en/developers/docs/data-structures-and-encoding/',
      },
    ],
    lab: 'merkle',
  },
  {
    id: 'identity',
    week: 3,
    title: '钱包、签名与状态机',
    subtitle: '签名授权不等于一次有效转账。',
    level: '基础',
    hours: 10,
    concepts: ['EIP-712', 'Nonce', 'State machine'],
    tasks: [
      '运行签名账本演示，检查 signer、domain、nonce 和余额。',
      '复现签名重放、跨 chainId、过期授权和并发提交。',
      '为新增的转账规则先写失败用例，再更新状态机。',
    ],
    acceptance: [
      '同一签名最多成功一次；失败操作不能污染状态。',
      '总余额守恒；钱包私钥仅由测试在运行时生成。',
    ],
    command: 'pnpm exec vitest run tests/core/ledger.test.ts',
    files: ['src/core/ledger.ts', 'tests/core/ledger.test.ts', 'scripts/demo.ts'],
    resources: [
      { label: 'EIP-712', url: 'https://eips.ethereum.org/EIPS/eip-712' },
      { label: 'Viem signing', url: 'https://viem.sh/docs/actions/wallet/signTypedData' },
    ],
    lab: 'ledger',
  },
  {
    id: 'consensus',
    week: 4,
    title: '共识、故障与最终性',
    subtitle: '从单机状态走向多个验证者。',
    level: '基础',
    hours: 10,
    concepts: ['Quorum', 'Byzantine faults', 'Finality'],
    tasks: [
      '对四个静态验证者提交投票，比较两票与三票的结果。',
      '加入重复票、未知验证者和同轮双投，验证拒绝路径。',
      '在测试中模拟延迟与乱序；记录安全性成立时仍可能失去活性的情形。',
    ],
    acceptance: [
      '同一验证者不能重复计权；阈值严格大于 2/3。',
      '明确本模型没有网络、签名认证、PoS 和完整视图切换。',
    ],
    command: 'pnpm exec vitest run tests/core/consensus.test.ts',
    files: ['src/core/consensus.ts', 'tests/core/consensus.test.ts'],
    resources: [
      {
        label: 'Ethereum consensus',
        url: 'https://ethereum.org/en/developers/docs/consensus-mechanisms/',
      },
      {
        label: 'CometBFT consensus specification',
        url: 'https://github.com/cometbft/cometbft/blob/main/spec/consensus/consensus.md',
      },
    ],
    lab: 'overview',
  },
  {
    id: 'evm',
    week: 5,
    title: 'EVM 与 Solidity',
    subtitle: '从源代码、ABI 到真实交易回执。',
    level: '进阶',
    hours: 12,
    concepts: ['Solidity', 'ABI', 'Gas'],
    tasks: [
      '编译 LabToken，检查 ABI、bytecode 与 compiler 元数据。',
      '在本地 EVM 部署，完成 transfer / approve / transferFrom。',
      '比较成功和失败交易，记录 gasUsed 与事件，不用估算代替回执。',
    ],
    acceptance: [
      'ERC-20 总供应守恒，未经 allowance 的委托转账失败。',
      '可从零启动本地 EVM；不依赖公共 RPC、测试币或钱包插件。',
    ],
    command: 'pnpm contracts:compile && pnpm contracts:demo',
    files: [
      'contracts/LabToken.sol',
      'scripts/compile-contracts.ts',
      'scripts/contract-demo-runtime.ts',
    ],
    resources: [
      { label: 'Solidity documentation', url: 'https://docs.soliditylang.org/en/latest/' },
      { label: 'ERC-20', url: 'https://eips.ethereum.org/EIPS/eip-20' },
    ],
    lab: 'contracts',
  },
  {
    id: 'security',
    week: 6,
    title: '合约安全与对抗测试',
    subtitle: '先写攻击，再验证边界。',
    level: '进阶',
    hours: 12,
    concepts: ['Reentrancy', 'CEI', 'Invariants'],
    tasks: [
      '运行恶意 receiver 对 SafeVault 的重入攻击。',
      '验证暂停充值后仍可提款，以及接收者拒收时账目回滚。',
      '生成随机充值与提款序列，比较链上状态与独立模型。',
    ],
    acceptance: [
      '攻击回调真实执行；其他用户的存款没有丢失。',
      '负债不超过合约余额；强制转入 ETH 的盈余不记为用户存款。',
    ],
    command: 'pnpm test:contracts',
    files: [
      'contracts/SafeVault.sol',
      'contracts/test/VaultAdversary.sol',
      'tests/contracts/protocols.test.ts',
    ],
    resources: [
      {
        label: 'Solidity security considerations',
        url: 'https://docs.soliditylang.org/en/latest/security-considerations.html',
      },
      {
        label: 'OpenZeppelin utilities',
        url: 'https://docs.openzeppelin.com/contracts/5.x/api/utils',
      },
    ],
    lab: 'contracts',
  },
  {
    id: 'tokens',
    week: 7,
    title: '资产标准与链上凭证',
    subtitle: 'ERC-20、ERC-721 和 Merkle 分发。',
    level: '进阶',
    hours: 10,
    concepts: ['ERC-721', 'Bitmap', 'Access control'],
    tasks: [
      '为两个账户构造分发树，并通过第三方 relayer 领取。',
      '测试跨 bitmap 槽位、篡改收款人和重复领取。',
      '由授权发行者铸造训练 NFT；为非法发行和重复 tokenId 添加断言。',
    ],
    acceptance: [
      'relayer 无法改变收款地址；失败转账不会消耗领取资格。',
      'NFT 只是发行者的声明；不代表系统自动验证了学习水平。',
    ],
    command: 'pnpm test:contracts',
    files: [
      'contracts/MerkleDistributor.sol',
      'contracts/TrainingBadge.sol',
      'tests/contracts/protocols.test.ts',
    ],
    resources: [
      { label: 'ERC-721', url: 'https://eips.ethereum.org/EIPS/eip-721' },
      { label: 'OpenZeppelin Merkle trees', url: 'https://github.com/OpenZeppelin/merkle-tree' },
    ],
    lab: 'contracts',
  },
  {
    id: 'defi',
    week: 8,
    title: 'DeFi 与自动做市',
    subtitle: '用整数算清价格、手续费和滑点。',
    level: '进阶',
    hours: 12,
    concepts: ['x · y = k', 'Slippage', 'Rounding'],
    tasks: [
      '改变交易规模，观察池价与输出数量。',
      '验证每笔交易后 k 不减，手续费留在池内。',
      '扩展 exact-output 报价，给出最小输入的性质测试；分析大单与 MEV 暴露。',
    ],
    acceptance: [
      '极小金额、零储备和非法费率有明确行为。',
      '解释报价不保证成交；区分滑点保护、价格影响与预言机。',
    ],
    command: 'pnpm exec vitest run tests/core/amm.test.ts',
    files: ['src/core/amm.ts', 'tests/core/amm.test.ts'],
    resources: [{ label: 'Uniswap V2 whitepaper', url: 'https://app.uniswap.org/whitepaper.pdf' }],
    lab: 'amm',
  },
  {
    id: 'dapp',
    week: 9,
    title: 'DApp 与客户端工程',
    subtitle: '把纯函数变成可操作的实验台。',
    level: '综合',
    hours: 10,
    concepts: ['React', 'RPC', 'Accessibility'],
    tasks: [
      '启动界面，验证 Merkle、AMM、索引三个实验。',
      '检查无效输入、键盘操作、窄屏布局和进度导出。',
      '扩展只读 JSON-RPC 面板：校验 chainId，并处理超时、重试与拒绝连接。',
    ],
    acceptance: [
      '页面结果来自核心算法；自评进度不冒充测试成绩。',
      '生产构建通过；外部 RPC 是扩展任务，本版演示完全本地运行。',
    ],
    command: 'pnpm build',
    files: ['src/App.tsx', 'src/styles.css', 'src/data/curriculum.ts'],
    resources: [
      { label: 'Viem clients', url: 'https://viem.sh/docs/clients/intro' },
      { label: 'Ethereum JSON-RPC', url: 'https://ethereum.org/en/developers/docs/apis/json-rpc/' },
    ],
    lab: 'overview',
  },
  {
    id: 'indexing',
    week: 10,
    title: '事件索引与链重组',
    subtitle: '派生数据库必须跟随规范链。',
    level: '综合',
    hours: 10,
    concepts: ['Event sourcing', 'Idempotence', 'Rollback'],
    tasks: [
      '追加区块、替换链头，并重复投递相同区块。',
      '构造深度分叉与无效事件，检查原子性和最终性边界。',
      '设计持久化 cursor / checkpoint 与恢复接口，写出宕机重放测试。',
    ],
    acceptance: [
      '重复事件不重复计账；无效分支不影响原状态。',
      '跨越 finalizedHeight 的重组被拒绝；本实现为内存快照，不含数据库/RPC。',
    ],
    command: 'pnpm exec vitest run tests/core/indexer.test.ts',
    files: ['src/core/indexer.ts', 'tests/core/indexer.test.ts'],
    resources: [
      { label: 'Ethereum blocks', url: 'https://ethereum.org/en/developers/docs/blocks/' },
    ],
    lab: 'indexer',
  },
  {
    id: 'scaling',
    week: 11,
    title: 'Rollup 与可验证执行',
    subtitle: '承诺交易、状态与执行轨迹。',
    level: '综合',
    hours: 12,
    concepts: ['State root', 'Fraud proof', 'Data availability'],
    tasks: [
      '构建一批交易，检查 pre/post-state 和 trace root。',
      '篡改批次中的一步，区分无效 witness 与可证明的错误执行。',
      '绘制乐观证明与 ZK 证明的验证流程；列出 DA、桥和挑战期所需假设。',
    ],
    acceptance: [
      '只接受被承诺的交易与轨迹；正常转换不会被误判为欺诈。',
      '明确这是完整状态 witness 的教学模型，没有 ZK 电路、桥或链上挑战协议。',
    ],
    command: 'pnpm exec vitest run tests/core/rollup.test.ts',
    files: ['src/core/rollup.ts', 'tests/core/rollup.test.ts'],
    resources: [
      {
        label: 'Optimistic rollups',
        url: 'https://ethereum.org/en/developers/docs/scaling/optimistic-rollups/',
      },
      { label: 'ZK rollups', url: 'https://ethereum.org/en/developers/docs/scaling/zk-rollups/' },
    ],
    lab: 'overview',
  },
  {
    id: 'capstone',
    week: 12,
    title: '治理、交付与工程答辩',
    subtitle: '用可复现证据交付你的系统。',
    level: '综合',
    hours: 14,
    concepts: ['Timelock', 'CI/CD', 'Threat model'],
    tasks: [
      '执行金库的 schedule → delay → execute，测试取消和重复执行。',
      '运行完整测试、覆盖率、构建和 EVM 演示，把报告作为 CI artifact。',
      '提交一项自选扩展 PR：实现、性质测试、威胁模型与 3 分钟代码演示。',
    ],
    acceptance: [
      '未授权、过早和重复操作均失败；权限转移需两步确认。',
      '解释四个关键设计取舍；能现场改动并重跑测试，说明尚未实现的范围。',
    ],
    command: 'pnpm check',
    files: [
      'contracts/TimelockTreasury.sol',
      '.github/workflows/ci.yml',
      'docs/architecture.md',
      'docs/challenges.md',
    ],
    resources: [
      {
        label: 'OpenZeppelin access control',
        url: 'https://docs.openzeppelin.com/contracts/5.x/access-control',
      },
    ],
    lab: 'contracts',
  },
];
