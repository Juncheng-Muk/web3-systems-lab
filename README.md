# Web3 Systems Lab

[![CI](https://github.com/Juncheng-Muk/web3-systems-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/Juncheng-Muk/web3-systems-lab/actions/workflows/ci.yml)

**Build. Break. Verify.** 12 周代码驱动训练 · TypeScript + Solidity · 从 CS 基础到可验证协议。

[在线实验台](https://juncheng-muk.github.io/web3-systems-lab/) · [核心实现](src/core) · [合约](contracts) · [测试](tests) · [扩展挑战](docs/challenges.md)

## Quick start

Node.js 24+，pnpm 11.25.0。安装 Node 后可运行 `npm install -g pnpm@11.25.0`。

```sh
git clone https://github.com/Juncheng-Muk/web3-systems-lab.git
cd web3-systems-lab
pnpm install --frozen-lockfile
pnpm dev                 # 交互实验台
pnpm check               # 类型、测试、构建、核心与 EVM 演示
pnpm test:coverage       # 覆盖率报告
```

本地 EVM 自动创建并销毁，无需钱包、RPC key、测试币。浏览器提供 Merkle、AMM、链重组三个真实计算实验；学习进度为本地自评。

## Training

每周：读参考实现 → 运行基线 → 完成扩展 → 添加反例 → 提交代码。任务与验收条件在[训练数据](src/data/curriculum.ts)和实验台中同步维护。

| 周 | 训练 | 代码证据 |
|---|---|---|
| 01 | TS、Git、精确运算、性质测试 | BigInt / fast-check |
| 02 | 哈希、Merkle、内容寻址 | 域分离 / 证明 / CIDv1 |
| 03 | 钱包与签名状态机 | EIP-712 / nonce / 重放防护 |
| 04 | 共识与最终性 | quorum / 双投检测 / 本地最终性 |
| 05 | EVM、ABI、Solidity、Gas | ERC-20 / 编译与真实回执 |
| 06 | 对抗安全 | 重入 / 回滚 / 资金守恒 |
| 07 | NFT 与资产分发 | ERC-721 / Merkle / bitmap |
| 08 | DeFi | AMM / 费率 / 滑点 / 取整 |
| 09 | DApp 工程 | React / 输入校验 / 无障碍 |
| 10 | 事件索引 | 重组 / 幂等 / 原子重放 |
| 11 | L2 与执行证明 | batch / trace / 单步欺诈证明模型 |
| 12 | 治理与交付 | timelock / CI / 威胁模型 |

## Inspect the evidence

```sh
pnpm demo                # artifacts/core-report.json
pnpm contracts:compile   # ABI + bytecode + compiler metadata
pnpm contracts:demo      # artifacts/evm-report.json：实际交易、gasUsed、断言
```

CI 重建上述证据并保存 artifact。重点检查：签名并发重放、Merkle 篡改、AMM 不变量、深度重组、真实 EVM 失败交易回滚、恶意回调、时间锁重复执行。

```text
src/core/         7 个可独立测试的系统内核
src/data/         12 周任务与验收条件
contracts/        5 个协议合约 + 攻击测试合约
tests/            单元、性质、模型与本地 EVM 测试
scripts/          可复现演示、编译与回执输出
```

教学项目，未审计。当前主线为 EVM；真实网络共识、生产索引数据库、ZK 电路、跨链桥和 Solana 是[扩展训练](docs/challenges.md)，不作为已实现功能。[模型边界与设计取舍](docs/architecture.md)。MIT。
