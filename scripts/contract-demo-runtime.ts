import { createHardhatRuntimeEnvironment } from 'hardhat/hre';
import { createPublicClient, createWalletClient, custom, type Address, type Hex } from 'viem';
import { hardhat } from 'viem/chains';
import config from '../hardhat.config.js';
import { compileContracts, projectRoot, type ContractArtifact } from './compile-contracts.js';

export interface DeployedContract {
  address: Address;
  artifact: ContractArtifact;
}

/** Each call creates a fresh chain. No HTTP server, RPC key, or external account. */
export async function createLabChain() {
  const hre = await createHardhatRuntimeEnvironment(config, {}, projectRoot);
  const connection = await hre.network.create('lab');
  const transport = custom(connection.provider);
  const publicClient = createPublicClient({ chain: hardhat, transport });
  const wallet = createWalletClient({ chain: hardhat, transport });
  const accounts = await wallet.getAddresses();
  const artifacts = compileContracts();

  async function receipt(hash: Hex) {
    const result = await publicClient.waitForTransactionReceipt({ hash });
    if (result.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
    return result;
  }

  async function deploy(name: string, args: readonly unknown[] = [], value = 0n) {
    const artifact = artifacts[name];
    if (!artifact) throw new Error(`Unknown contract: ${name}`);
    const hash = await wallet.deployContract({
      account: accounts[0]!,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args,
      value,
    });
    const transaction = await receipt(hash);
    if (!transaction.contractAddress) throw new Error('Missing deployment address');
    return { address: transaction.contractAddress, artifact, transaction };
  }

  async function read<T = unknown>(
    contract: DeployedContract,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<T> {
    return (await publicClient.readContract({
      address: contract.address,
      abi: contract.artifact.abi,
      functionName,
      args,
    })) as T;
  }

  async function write(
    contract: DeployedContract,
    functionName: string,
    args: readonly unknown[] = [],
    options: { account?: Address; value?: bigint } = {},
  ) {
    const { request } = await publicClient.simulateContract({
      address: contract.address,
      abi: contract.artifact.abi,
      functionName,
      args,
      account: options.account ?? accounts[0]!,
      ...(options.value === undefined ? {} : { value: options.value }),
    });
    return receipt(await wallet.writeContract(request));
  }

  /** Bypass preflight only when testing a mined revert and its atomic rollback. */
  async function sendUnchecked(
    contract: DeployedContract,
    functionName: string,
    args: readonly unknown[] = [],
    options: { account?: Address; value?: bigint } = {},
  ) {
    const hash = await wallet.writeContract({
      address: contract.address,
      abi: contract.artifact.abi,
      functionName,
      args,
      account: options.account ?? accounts[0]!,
      gas: 1_000_000n,
      ...(options.value === undefined ? {} : { value: options.value }),
    });
    return publicClient.waitForTransactionReceipt({ hash });
  }

  async function advance(seconds: number) {
    await connection.provider.request({ method: 'evm_increaseTime', params: [seconds] });
    await connection.provider.request({ method: 'evm_mine', params: [] });
  }

  return {
    accounts,
    publicClient,
    wallet,
    deploy,
    read,
    write,
    sendUnchecked,
    receipt,
    advance,
    close: () => connection.close(),
  };
}

export type LabChain = Awaited<ReturnType<typeof createLabChain>>;
