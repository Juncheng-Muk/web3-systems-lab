# Build the next increment

基线实现已完成。以下为学习者扩展任务，不是已交付功能。每项提交代码、至少一个失败反例和可复现命令。

| Challenge | Deliverable | Acceptance |
|---|---|---|
| AMM exact-output | 最小输入反向报价 | amountIn − 1 不足以满足目标；溢出/取整测试 |
| Persistent indexer | SQLite cursor、checkpoint、事务写入 | 在写入每个边界注入宕机；重启后重放不重计 |
| RPC client | 本地节点只读余额、事件与 chainId 面板 | 超时、拒绝、错误网络、重组均有测试 |
| Wallet transport | EIP-1193 adapter 与连接状态机 | 账户/网络变更、用户拒绝、断连测试；签名前显示完整参数 |
| P2P consensus | 带签名消息、乱序/丢包的模拟网络 | 分叉票不能导致两个诚实节点同高度最终化；给出活性假设 |
| DAO | 快照投票 → quorum → timelock | 同区块借贷不增加历史投票权；过早执行与重复执行失败 |
| Oracle / lending | 累计价格 TWAP、抵押与清算模型 | 过期价格拒绝、舍入保护与坏账边界 |
| ERC-4337 | 本地 UserOperation / paymaster 实验 | nonce、验证失败、gas 支付边界；不使用真实资金 |
| ZK | Noir 或 Circom 的私有 Merkle membership 电路 | 正确 witness 验证；错误路径/公共输入失败 |
| Storage | UnixFS 多块 DAG + 本地 IPFS pin | CID 可重建；删除块后报告不可用而非完整性通过 |
| Solana | Rust/Anchor PDA vault | signer、owner、seed、重复提款测试；对照 EVM 存储模型 |
| Cross-chain | 两个本地域的消息 outbox/inbox | domain separation、finality delay、重放与伪造消息测试 |

答辩用 3 分钟：运行一个实验 → 展示一个攻击测试 → 解释一个不变量 → 现场修改并重跑。推荐优先讲清 Merkle 格式、并发 nonce、原子重组、vault 偿付能力四个取舍。

评分建议（人工）：正确性 35 / 反例与测试 25 / 系统边界 20 / 可复现交付 20。网页的“自评完成”不计作自动验收。
