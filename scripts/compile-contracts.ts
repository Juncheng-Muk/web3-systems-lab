import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import solc from 'solc';
import type { Abi, Hex } from 'viem';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export interface ContractArtifact {
  contractName: string;
  sourceName: string;
  compiler: string;
  sourceHash: string;
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
}

interface CompilerContract {
  abi: Abi;
  evm: { bytecode: { object: string }; deployedBytecode: { object: string } };
}

let cached: Record<string, ContractArtifact> | undefined;

export function compileContracts(): Record<string, ContractArtifact> {
  if (cached) return cached;
  const sources: Record<string, { content: string }> = {};
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.sol'))
        sources[relative(projectRoot, path).replaceAll('\\', '/')] = {
          content: readFileSync(path, 'utf8'),
        };
    }
  }
  visit(resolve(projectRoot, 'contracts'));
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
      },
    },
  };
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), {
      import: (path: string) => {
        try {
          return { contents: readFileSync(resolve(projectRoot, 'node_modules', path), 'utf8') };
        } catch {
          return { error: `Import not found: ${path}` };
        }
      },
    }),
  ) as {
    errors?: { severity: string; formattedMessage: string }[];
    contracts?: Record<string, Record<string, CompilerContract>>;
  };
  const errors = output.errors?.filter((entry) => entry.severity === 'error') ?? [];
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  if (!output.contracts) throw new Error('Compiler produced no contracts');
  const artifacts: Record<string, ContractArtifact> = {};
  for (const [sourceName, contracts] of Object.entries(output.contracts)) {
    if (!sourceName.startsWith('contracts/')) continue;
    for (const [contractName, contract] of Object.entries(contracts)) {
      if (!contract.evm.bytecode.object) continue;
      artifacts[contractName] = {
        contractName,
        sourceName,
        compiler: solc.version(),
        sourceHash: createHash('sha256').update(sources[sourceName]!.content).digest('hex'),
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
        deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
      };
    }
  }
  cached = artifacts;
  return artifacts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(projectRoot, 'artifacts/contracts');
  mkdirSync(directory, { recursive: true });
  const artifacts = compileContracts();
  for (const artifact of Object.values(artifacts)) {
    writeFileSync(
      resolve(directory, `${artifact.contractName}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }
  console.table(
    Object.values(artifacts).map((artifact) => ({
      contract: artifact.contractName,
      runtimeBytes: (artifact.deployedBytecode.length - 2) / 2,
      compiler: artifact.compiler.split('+')[0],
    })),
  );
}
