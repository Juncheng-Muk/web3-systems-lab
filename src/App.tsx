import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  buildMerkleTree,
  getMerkleProof,
  verifyMerkleProof,
  quoteSwap,
  executeSwap,
  ReorgIndexer,
} from './core';
import type { IndexedBlock } from './core';
import { modules } from './data/curriculum';
import type { Module } from './data/curriculum';

const REPOSITORY =
  import.meta.env.VITE_REPOSITORY_URL || 'https://github.com/Juncheng-Muk/web3-systems-lab';
const STORAGE_KEY = 'web3-systems-lab.progress.v1';
type Page = 'overview' | 'roadmap' | 'playground' | 'architecture';
type Lab = 'merkle' | 'amm' | 'indexer';
type IconName =
  | 'grid'
  | 'route'
  | 'code'
  | 'nodes'
  | 'arrow'
  | 'external'
  | 'check'
  | 'close'
  | 'download'
  | 'github'
  | 'copy'
  | 'reset';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="M6 7v9a3 3 0 0 0 3 3h2M18 17V8a3 3 0 0 0-3-3h-2" />
      </>
    ),
    code: (
      <>
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
      </>
    ),
    nodes: (
      <>
        <circle cx="5" cy="5" r="2.5" />
        <circle cx="19" cy="12" r="2.5" />
        <circle cx="5" cy="19" r="2.5" />
        <path d="m7.5 6.2 9 4.6m-9 7 9-4.6" />
      </>
    ),
    arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    github: (
      <>
        <path d="M9 19c-4 1-4-2-6-2m12 5v-4a4 4 0 0 0-1-3c3 0 6-2 6-6a5 5 0 0 0-1-3 5 5 0 0 0 0-4s-2 0-4 2a13 13 0 0 0-6 0C7 2 5 2 5 2a5 5 0 0 0 0 4 5 5 0 0 0-1 3c0 4 3 6 6 6a4 4 0 0 0-1 3v4" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 1 7M3 3v7h7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function initialProgress(): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data)
      ? [
          ...new Set(
            data.filter(
              (id): id is string => typeof id === 'string' && modules.some((m) => m.id === id),
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

function App() {
  const [page, setPage] = useState<Page>('overview');
  const [completed, setCompleted] = useState<string[]>(initialProgress);
  const [selected, setSelected] = useState<Module | null>(null);
  const [filter, setFilter] = useState('全部');
  const [lab, setLab] = useState<Lab>('merkle');
  const [storageWarning, setStorageWarning] = useState(false);
  const [toast, setToast] = useState('');
  const contentRef = useRef<HTMLElement>(null);
  const closeModule = useCallback(() => setSelected(null), []);
  const hours = modules.reduce((sum, module) => sum + module.hours, 0);
  const progress = Math.round((completed.length / (modules.length || 1)) * 100);
  const nav: { page: Page; label: string; icon: IconName; number: string }[] = [
    { page: 'overview', label: '学习总览', icon: 'grid', number: '01' },
    { page: 'roadmap', label: '训练路线', icon: 'route', number: '02' },
    { page: 'playground', label: '交互实验室', icon: 'code', number: '03' },
    { page: 'architecture', label: '系统知识图谱', icon: 'nodes', number: '04' },
  ];
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }, [completed]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(id);
  }, [toast]);
  function navigate(next: Page) {
    setPage(next);
    contentRef.current?.focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  function toggleComplete(id: string) {
    setCompleted((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }
  function exportProgress() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            project: 'web3-systems-lab',
            version: 1,
            exportedAt: new Date().toISOString(),
            type: 'self-assessment',
            completed,
            totalModules: modules.length,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'web3-lab-progress.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('学习记录已导出');
  }
  function openLab(module: Module) {
    setLab(module.lab === 'amm' ? 'amm' : module.lab === 'indexer' ? 'indexer' : 'merkle');
    setSelected(null);
    navigate('playground');
  }
  const visibleModules = modules.filter((m) => filter === '全部' || m.level === filter);
  const current = nav.find((item) => item.page === page)!;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳转到内容
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate('overview')}
          aria-label="Web3 Systems Lab 首页"
        >
          <span className="brand-mark">
            W<span>3</span>
            <i />
          </span>
          <span className="brand-text">
            SYSTEMS LAB<span>WEB3 ENGINEERING</span>
          </span>
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="主导航">
          {nav.map((item) => (
            <button
              key={item.page}
              className={`nav-item ${page === item.page ? 'active' : ''}`}
              onClick={() => navigate(item.page)}
              aria-current={page === item.page ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <small>{item.number}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-progress">
          <div className="mini-label">
            <span>YOUR PROGRESS</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p>
            {completed.length} / {modules.length} 个模块已自评完成
          </p>
          <button className="text-button muted" onClick={exportProgress}>
            <Icon name="download" size={14} />
            导出学习记录
          </button>
        </div>
        <div className="sidebar-footer">
          <div className="open-source-badge">
            <span /> OPEN SOURCE · MIT
          </div>
          <a href={REPOSITORY} target="_blank" rel="noreferrer">
            <Icon name="github" size={16} />
            <span>在 GitHub 查看</span>
            <Icon name="external" size={12} />
          </a>
          <p>
            Understand the system.
            <br />
            Build it from first principles.
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            工作台 <span>/</span> <strong>{current.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="sandbox-status">
              <i />
              Local sandbox
            </span>
            <span className="version">v1.0</span>
            <a className="source-link" href={REPOSITORY} target="_blank" rel="noreferrer">
              源代码 <Icon name="external" size={13} />
            </a>
          </div>
        </header>
        <main id="main" ref={contentRef} tabIndex={-1}>
          {storageWarning && (
            <div className="notice" role="status">
              浏览器存储不可用，当前进度仅保留在本次会话；可以导出学习记录。
            </div>
          )}
          {(page === 'overview' || page === 'roadmap') && (
            <>
              {page === 'overview' ? (
                <section className="hero">
                  <div className="hero-copy">
                    <div className="eyebrow">
                      <span /> BUILD. BREAK. UNDERSTAND.
                    </div>
                    <h1>
                      从第一笔交易，
                      <br />
                      到一个<span className="underlined">完整协议</span>。
                    </h1>
                    <p className="hero-description">
                      一条从计算机基础到链上系统的实践路线。
                      <br />
                      用代码理解 Web3，用测试证明你的理解。
                    </p>
                    <div className="hero-actions">
                      <button
                        className="button primary"
                        onClick={() =>
                          setSelected(modules.find((m) => !completed.includes(m.id)) || modules[0])
                        }
                      >
                        继续训练 <Icon name="arrow" size={17} />
                      </button>
                      <button className="button ghost" onClick={() => navigate('playground')}>
                        打开实验室 <Icon name="code" size={17} />
                      </button>
                    </div>
                    <div className="hero-footnote">
                      <span>零基础起步</span>
                      <i />
                      <span>代码驱动</span>
                      <i />
                      <span>本地运行</span>
                    </div>
                  </div>
                  <HeroVisual />
                </section>
              ) : (
                <div className="page-intro">
                  <div className="eyebrow">THE ENGINEERING ROADMAP</div>
                  <h1>每一周，构建一个新能力。</h1>
                  <p>按依赖顺序推进，以可运行代码和验收条件完成每个模块。</p>
                </div>
              )}
              <section className="stats-grid" aria-label="训练概览">
                <Stat
                  value={String(modules.length).padStart(2, '0')}
                  unit="周"
                  title="循序渐进的训练"
                  detail="从基础到端到端系统"
                />
                <Stat
                  value={String(hours)}
                  unit="h"
                  title="建议投入时间"
                  detail="每周练习 · 持续构建"
                />
                <Stat value="03" unit="个" title="交互式实验" detail="Merkle · AMM · Reorg" />
                <Stat
                  value={String(completed.length).padStart(2, '0')}
                  unit={` / ${modules.length}`}
                  title="自评完成模块"
                  detail="进度保存在当前浏览器"
                  progress={progress}
                />
              </section>
              <section className="roadmap-section">
                <SectionHeading
                  number="01"
                  title="你的训练路线"
                  subtitle="从理解原理，到交付系统。"
                  right={
                    page === 'overview' ? (
                      <button className="text-button" onClick={() => navigate('roadmap')}>
                        全部 {modules.length} 个模块 <Icon name="arrow" size={16} />
                      </button>
                    ) : (
                      <button className="text-button" onClick={exportProgress}>
                        <Icon name="download" size={15} />
                        导出进度
                      </button>
                    )
                  }
                />
                <div className="phase-strip">
                  <div>
                    <span className="phase-number">01—04</span>
                    <strong>构建基础</strong>
                    <span>CS & CRYPTOGRAPHY</span>
                  </div>
                  <Icon name="arrow" size={16} />
                  <div>
                    <span className="phase-number">05—08</span>
                    <strong>理解协议</strong>
                    <span>CONTRACTS & PROTOCOLS</span>
                  </div>
                  <Icon name="arrow" size={16} />
                  <div>
                    <span className="phase-number">09—12</span>
                    <strong>交付系统</strong>
                    <span>SYSTEMS & SECURITY</span>
                  </div>
                </div>
                {page === 'roadmap' && (
                  <div className="filter-bar" aria-label="按难度筛选">
                    {['全部', '基础', '进阶', '综合'].map((value) => (
                      <button
                        aria-pressed={filter === value}
                        className={filter === value ? 'selected' : ''}
                        key={value}
                        onClick={() => setFilter(value)}
                      >
                        {value}
                        <span>
                          {value === '全部'
                            ? modules.length
                            : modules.filter((m) => m.level === value).length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="module-grid">
                  {(page === 'overview' ? modules.slice(0, 6) : visibleModules).map((module) => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      completed={completed.includes(module.id)}
                      onOpen={() => setSelected(module)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
          {(page === 'overview' || page === 'playground') && (
            <section className="playground-section">
              {page === 'playground' ? (
                <div className="page-intro">
                  <div className="eyebrow">OBSERVE. CHANGE. VERIFY.</div>
                  <h1>让抽象原理，变得可验证。</h1>
                  <p>修改输入，观察系统响应。所有实验在浏览器内运行。</p>
                </div>
              ) : (
                <SectionHeading
                  number="02"
                  title="把原理跑起来"
                  subtitle="三个小实验，直达协议核心。"
                  right={<span className="label-outline">浏览器模拟</span>}
                />
              )}
              <div className="lab-shell">
                <div className="lab-tabs" role="tablist" aria-label="选择交互实验">
                  {(
                    [
                      { id: 'merkle', label: 'Merkle 证明', code: '01' },
                      { id: 'amm', label: 'AMM 交易', code: '02' },
                      { id: 'indexer', label: '链重组索引', code: '03' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      role="tab"
                      aria-selected={lab === item.id}
                      id={`tab-${item.id}`}
                      aria-controls="lab-panel"
                      className={lab === item.id ? 'selected' : ''}
                      onClick={() => setLab(item.id)}
                      tabIndex={lab === item.id ? 0 : -1}
                      onKeyDown={(event) => {
                        const tabs: Lab[] = ['merkle', 'amm', 'indexer'];
                        const index = tabs.indexOf(item.id);
                        const next =
                          event.key === 'ArrowRight'
                            ? tabs[(index + 1) % tabs.length]
                            : event.key === 'ArrowLeft'
                              ? tabs[(index + tabs.length - 1) % tabs.length]
                              : event.key === 'Home'
                                ? tabs[0]
                                : event.key === 'End'
                                  ? tabs[tabs.length - 1]
                                  : undefined;
                        if (next) {
                          event.preventDefault();
                          setLab(next);
                          document.getElementById(`tab-${next}`)?.focus();
                        }
                      }}
                    >
                      <span>{item.code}</span>
                      {item.label}
                    </button>
                  ))}
                  <span className="live-label">
                    <i /> LIVE COMPUTATION
                  </span>
                </div>
                <div id="lab-panel" role="tabpanel" tabIndex={0} aria-labelledby={`tab-${lab}`}>
                  {lab === 'merkle' ? <MerkleLab /> : lab === 'amm' ? <AmmLab /> : <IndexerLab />}
                </div>
              </div>
            </section>
          )}
          {page === 'architecture' && (
            <>
              <div className="page-intro">
                <div className="eyebrow">CONNECT THE CONCEPTS</div>
                <h1>理解连接，才能构建系统。</h1>
                <p>一张从计算机科学到 Web3 应用的依赖图。点击节点打开对应训练。</p>
              </div>
              <Architecture onSelect={setSelected} />
              <div className="architecture-notes">
                <div>
                  <span>01 / TRUST</span>
                  <h3>从数据到可验证状态</h3>
                  <p>哈希、签名与状态转换共同定义系统的信任边界。</p>
                </div>
                <div>
                  <span>02 / COORDINATION</span>
                  <h3>从单机到分布式共识</h3>
                  <p>执行顺序、重组处理与最终性决定数据何时可信。</p>
                </div>
                <div>
                  <span>03 / DELIVERY</span>
                  <h3>从协议到完整应用</h3>
                  <p>把合约、索引、客户端和测试连成一个可运行闭环。</p>
                </div>
              </div>
            </>
          )}
          <footer className="main-footer">
            <span>
              <span className="footer-square" /> WEB3 SYSTEMS LAB
            </span>
            <span>Read the code. Run the tests. Make it yours.</span>
            <a href={`${REPOSITORY}#quick-start`} target="_blank" rel="noreferrer">
              本地启动 <Icon name="arrow" size={13} />
            </a>
          </footer>
        </main>
      </div>
      {selected && (
        <ModuleDialog
          module={selected}
          completed={completed.includes(selected.id)}
          onClose={closeModule}
          onToggle={() => toggleComplete(selected.id)}
          onLab={() => openLab(selected)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  unit,
  title,
  detail,
  progress,
}: {
  value: string;
  unit: string;
  title: string;
  detail: string;
  progress?: number;
}) {
  return (
    <div className="stat">
      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {progress !== undefined && (
        <div className="stat-progress" aria-label={`${progress}% 完成`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
function SectionHeading({
  number,
  title,
  subtitle,
  right,
}: {
  number: string;
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <div className="section-title">
          <span>{number}</span>
          <h2>{title}</h2>
        </div>
        <p>{subtitle}</p>
      </div>
      {right}
    </div>
  );
}
function HeroVisual() {
  return (
    <div className="hero-visual" aria-label="由基础到完整协议的系统示意图">
      <div className="diagram-caption">
        <span className="cross">+</span>SYSTEM OVERVIEW<span className="diagram-v">FIG. 001</span>
      </div>
      <svg viewBox="0 0 420 250" fill="none" aria-hidden="true">
        <defs>
          <pattern id="dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".7" fill="#d8d9d4" />
          </pattern>
        </defs>
        <rect width="420" height="250" fill="url(#dots)" />
        <path
          d="M82 74v54h122m-122 70v-70m122-54v54m0 70v-70h129V74m0 124v-70"
          stroke="#b9beb7"
          strokeWidth="1.2"
        />
        <path d="M82 128h122m0 0h129" stroke="#e76b38" strokeWidth="1.4" />
        <rect x="43" y="43" width="78" height="50" rx="5" fill="#fbfbf8" stroke="#cbd0c7" />
        <text x="82" y="65" textAnchor="middle" fill="#282e29" fontSize="11" fontFamily="monospace">
          HASH
        </text>
        <text x="82" y="81" textAnchor="middle" fill="#92988f" fontSize="8" fontFamily="monospace">
          DATA → PROOF
        </text>
        <rect x="164" y="43" width="79" height="50" rx="5" fill="#fbfbf8" stroke="#cbd0c7" />
        <text
          x="203"
          y="65"
          textAnchor="middle"
          fill="#282e29"
          fontSize="11"
          fontFamily="monospace"
        >
          CONSENSUS
        </text>
        <text x="203" y="81" textAnchor="middle" fill="#92988f" fontSize="8" fontFamily="monospace">
          AGREE ON STATE
        </text>
        <rect x="293" y="43" width="79" height="50" rx="5" fill="#fbfbf8" stroke="#cbd0c7" />
        <text
          x="332"
          y="65"
          textAnchor="middle"
          fill="#282e29"
          fontSize="11"
          fontFamily="monospace"
        >
          CONTRACT
        </text>
        <text x="332" y="81" textAnchor="middle" fill="#92988f" fontSize="8" fontFamily="monospace">
          CODE IS LAW?
        </text>
        <rect x="43" y="171" width="78" height="50" rx="5" fill="#fbfbf8" stroke="#cbd0c7" />
        <text
          x="82"
          y="193"
          textAnchor="middle"
          fill="#282e29"
          fontSize="11"
          fontFamily="monospace"
        >
          NETWORK
        </text>
        <text x="82" y="209" textAnchor="middle" fill="#92988f" fontSize="8" fontFamily="monospace">
          PEER TO PEER
        </text>
        <rect x="159" y="105" width="89" height="47" rx="5" fill="#252c26" />
        <text
          x="203"
          y="125"
          textAnchor="middle"
          fill="#f7f8f4"
          fontSize="11"
          fontFamily="monospace"
        >
          YOUR SYSTEM
        </text>
        <text
          x="203"
          y="140"
          textAnchor="middle"
          fill="#c1c8b9"
          fontSize="8"
          fontFamily="monospace"
        >
          BUILD · TEST · SHIP
        </text>
        <rect x="164" y="171" width="79" height="50" rx="5" fill="#fbfbf8" stroke="#cbd0c7" />
        <text
          x="203"
          y="193"
          textAnchor="middle"
          fill="#282e29"
          fontSize="11"
          fontFamily="monospace"
        >
          SECURITY
        </text>
        <text
          x="203"
          y="209"
          textAnchor="middle"
          fill="#92988f"
          fontSize="8"
          fontFamily="monospace"
        >
          VERIFY ASSUMPTIONS
        </text>
        <rect x="293" y="171" width="79" height="50" rx="5" fill="#fbfbf8" stroke="#cbd0c7" />
        <text
          x="332"
          y="193"
          textAnchor="middle"
          fill="#282e29"
          fontSize="11"
          fontFamily="monospace"
        >
          APPLICATION
        </text>
        <text
          x="332"
          y="209"
          textAnchor="middle"
          fill="#92988f"
          fontSize="8"
          fontFamily="monospace"
        >
          END TO END
        </text>
        <circle cx="122" cy="128" r="3" fill="#e76b38" />
        <circle cx="287" cy="128" r="3" fill="#e76b38" />
      </svg>
      <div className="diagram-footer">
        <span>
          <i /> Engineering, from first principles.
        </span>
        <span>↗</span>
      </div>
    </div>
  );
}
function ModuleCard({
  module,
  completed,
  onOpen,
}: {
  module: Module;
  completed: boolean;
  onOpen: () => void;
}) {
  return (
    <button className={`module-card ${completed ? 'is-complete' : ''}`} onClick={onOpen}>
      <div className="module-top">
        <span className="week">WEEK {String(module.week).padStart(2, '0')}</span>
        <span className={`level level-${module.level}`}>
          {completed ? (
            <>
              <Icon name="check" size={12} />
              已自评
            </>
          ) : (
            module.level
          )}
        </span>
      </div>
      <h3>{module.title}</h3>
      <p>{module.subtitle}</p>
      <div className="module-tags">
        {module.concepts.slice(0, 3).map((concept) => (
          <span key={concept}>{concept}</span>
        ))}
      </div>
      <div className="module-bottom">
        <span>
          <span className="tiny-clock" />
          {module.hours} 小时 <i /> {module.tasks.length} 个实践任务
        </span>
        <Icon name="arrow" size={17} />
      </div>
    </button>
  );
}

function ModuleDialog({
  module,
  completed,
  onClose,
  onToggle,
  onLab,
}: {
  module: Module;
  completed: boolean;
  onClose: () => void;
  onToggle: () => void;
  onLab: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [onClose]);
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(module.command);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }
  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="module-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="module-title"
        tabIndex={-1}
        ref={ref}
      >
        <div className="dialog-top">
          <span className="eyebrow">
            WEEK {String(module.week).padStart(2, '0')} / {module.level} / {module.hours} HOURS
          </span>
          <button className="icon-button" aria-label="关闭模块详情" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <h2 id="module-title">{module.title}</h2>
        <p className="dialog-subtitle">{module.subtitle}</p>
        <div className="module-tags">
          {module.concepts.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="dialog-section">
          <h3>
            <span>01</span> 动手实现
          </h3>
          <ol className="task-list">
            {module.tasks.map((task, i) => (
              <li key={task}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {task}
              </li>
            ))}
          </ol>
        </div>
        <div className="dialog-section">
          <h3>
            <span>02</span> 验收标准
          </h3>
          <ul className="acceptance-list">
            {module.acceptance.map((item) => (
              <li key={item}>
                <Icon name="check" size={15} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="dialog-section">
          <h3>
            <span>03</span> 本地验证
          </h3>
          <div className="command-line">
            <code>{module.command}</code>
            <button className="icon-button" onClick={copyCommand} aria-label="复制验证命令">
              <Icon name={copied ? 'check' : 'copy'} size={17} />
            </button>
          </div>
          <p className="copy-status" role="status">
            {copied ? '命令已复制' : copyError ? '剪贴板不可用，请选中上方命令复制。' : ''}
          </p>
          <div className="source-files">
            {module.files.map((file) => (
              <a
                key={file}
                href={`${REPOSITORY}/blob/main/${file}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="code" size={13} />
                {file}
                <Icon name="external" size={11} />
              </a>
            ))}
          </div>
        </div>
        <div className="dialog-section">
          <h3>
            <span>04</span> 一手资料
          </h3>
          <div className="resource-links">
            {module.resources.map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
                {item.label}
                <Icon name="external" size={13} />
              </a>
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <div>
            <button
              className={`button ${completed ? 'completed-button' : 'primary'}`}
              onClick={onToggle}
            >
              <Icon name="check" size={16} />
              {completed ? '已自评完成 · 撤销' : '标记为自评完成'}
            </button>
            <span>请运行本地测试后，自行确认。</span>
          </div>
          {['merkle', 'amm', 'indexer'].includes(module.lab) && (
            <button className="button secondary" onClick={onLab}>
              打开对应实验 <Icon name="arrow" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function shorten(value: string, n = 8) {
  return value.length > n * 2 + 3 ? `${value.slice(0, n)}…${value.slice(-n)}` : value;
}
function MerkleLab() {
  const [input, setInput] = useState('alice:100\nbob:250\ncarol:400\ndave:150');
  const [selected, setSelected] = useState(0);
  const [tampered, setTampered] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const computed = useMemo(() => {
    try {
      const values = input
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);
      if (!values.length) return { error: '请至少输入一个叶子节点。' };
      if (values.length > 16) return { error: '交互视图最多支持 16 个叶子节点。' };
      const tree = buildMerkleTree(values);
      const index = Math.min(selected, values.length - 1);
      return { tree, proof: getMerkleProof(tree, index), index };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '无法构建 Merkle 树' };
    }
  }, [input, selected]);
  function verify() {
    if (computed.tree && computed.proof)
      setVerified(
        verifyMerkleProof(
          computed.tree.values[computed.index] + (tampered ? ':tampered' : ''),
          computed.proof,
          computed.tree.root,
        ),
      );
  }
  return (
    <div className="lab-content">
      <div className="lab-controls">
        <div className="lab-eyebrow">CRYPTOGRAPHY / MERKLE TREE</div>
        <h3>一条路径，验证一组数据。</h3>
        <p className="lab-description">
          修改叶子节点，观察根哈希；篡改数据，检验证明是否仍然成立。
        </p>
        <label className="field-label" htmlFor="merkle-values">
          叶子数据 <span>每行一项 · 最多 16 项</span>
        </label>
        <textarea
          id="merkle-values"
          className="code-input"
          rows={4}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setVerified(null);
          }}
        />
        <div className="two-fields">
          <div>
            <label className="field-label" htmlFor="merkle-leaf">
              目标节点
            </label>
            <select
              id="merkle-leaf"
              value={computed.index ?? 0}
              onChange={(event) => {
                setSelected(Number(event.target.value));
                setVerified(null);
              }}
            >
              {computed.tree?.values.map((value, index) => (
                <option value={index} key={index}>
                  {index}: {value}
                </option>
              ))}
            </select>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={tampered}
              onChange={(event) => {
                setTampered(event.target.checked);
                setVerified(null);
              }}
            />
            篡改待验证数据
          </label>
        </div>
        <button className="button primary" onClick={verify} disabled={!computed.tree}>
          验证 Merkle Proof <Icon name="arrow" size={16} />
        </button>
        {computed.error && (
          <p className="field-error" role="alert">
            {computed.error}
          </p>
        )}
        {verified !== null && (
          <div className={`verification ${verified ? 'success' : 'failure'}`} role="status">
            <span>{verified ? '✓' : '×'}</span>
            {verified ? '证明有效：数据属于当前 Merkle 树。' : '验证失败：待验证数据已发生变化。'}
          </div>
        )}
      </div>
      <div className="lab-output">
        <div className="output-header">
          <span>PROOF EXPLORER</span>
          <span className="output-status">
            {computed.tree ? `${computed.tree.values.length} LEAVES` : 'WAITING'}
          </span>
        </div>
        {computed.tree && (
          <>
            <div className="merkle-tree" aria-label="Merkle 树结构">
              <div className="tree-level">
                <div className="tree-node root-node" title={computed.tree.root}>
                  <span>ROOT · LENGTH BOUND</span>
                  <code>{shorten(computed.tree.root, 4)}</code>
                </div>
              </div>
              {[...computed.tree.levels].reverse().map((level, row) => (
                <div className={`tree-level tree-level-${row}`} key={row}>
                  {level.map((hash, index) => (
                    <div
                      className={`tree-node ${row === computed.tree.levels.length - 1 && index === computed.index ? 'selected-node' : ''}`}
                      key={`${index}-${hash}`}
                      title={hash}
                    >
                      {row === 0 && <span>TREE TOP</span>}
                      <code>{shorten(hash, 4)}</code>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <dl className="proof-details">
              <div>
                <dt>ROOT HASH</dt>
                <dd>{computed.tree.root}</dd>
              </div>
              <div>
                <dt>PROOF LENGTH</dt>
                <dd>
                  {computed.proof?.siblings.length} sibling hashes <span>· O(log n)</span>
                </dd>
              </div>
              <div>
                <dt>LEAF VALUE</dt>
                <dd className={tampered ? 'tampered-value' : ''}>
                  {computed.tree.values[computed.index]}
                  {tampered && ':tampered'}
                </dd>
              </div>
            </dl>
          </>
        )}
        <div className="output-footer">
          <span className="code-dot" /> core / merkle.ts <span>Deterministic · Local</span>
        </div>
      </div>
    </div>
  );
}

function AmmLab() {
  const [reserves, setReserves] = useState({ x: 100000n, y: 200000n });
  const [amount, setAmount] = useState('1000');
  const [history, setHistory] = useState<
    { input: string; output: string; before: string; after: string }[]
  >([]);
  const [message, setMessage] = useState('');
  const preview = useMemo(() => {
    try {
      if (!/^[1-9]\d{0,12}$/.test(amount)) return { error: '请输入 1 到 9999999999999 的整数。' };
      const input = BigInt(amount);
      const output = quoteSwap(input, reserves.x, reserves.y, 30);
      return {
        input,
        output,
        impact: (
          (1 - Number(output) / Number(input) / (Number(reserves.y) / Number(reserves.x))) *
          100
        ).toFixed(2),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '报价失败' };
    }
  }, [amount, reserves]);
  function trade() {
    if (preview.input === undefined) return;
    try {
      const result = executeSwap(preview.input, reserves.x, reserves.y, 30);
      setHistory((prev) =>
        [
          {
            input: preview.input!.toString(),
            output: result.amountOut.toString(),
            before: result.kBefore.toString(),
            after: result.kAfter.toString(),
          },
          ...prev,
        ].slice(0, 4),
      );
      setReserves({ x: result.reserveIn, y: result.reserveOut });
      setMessage(`模拟交易完成，收到 ${result.amountOut.toString()} TOKEN B。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '交易失败');
    }
  }
  function reset() {
    setReserves({ x: 100000n, y: 200000n });
    setHistory([]);
    setMessage('流动池已重置。');
  }
  return (
    <div className="lab-content">
      <div className="lab-controls">
        <div className="lab-eyebrow">DEFI / CONSTANT PRODUCT</div>
        <h3>一笔交易，如何改变价格？</h3>
        <p className="lab-description">在恒定乘积池中兑换代币，观察滑点、手续费与不变量。</p>
        <label className="field-label" htmlFor="swap-amount">
          支付 TOKEN A <span>最小整数单位</span>
        </label>
        <div className="amount-input">
          <input
            id="swap-amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setMessage('');
            }}
          />
          <span>A</span>
        </div>
        <div className="swap-separator">↓</div>
        <div className="receive-amount">
          <span>预估收到 TOKEN B</span>
          <strong>
            {preview.output?.toLocaleString() ?? '—'}
            <small>B</small>
          </strong>
        </div>
        <div className="quote-meta">
          <div>
            <span>交易手续费</span>
            <strong>0.30%</strong>
          </div>
          <div>
            <span>相对池价的输出折损（含手续费）</span>
            <strong>{preview.impact ?? '—'}%</strong>
          </div>
        </div>
        <div className="inline-actions">
          <button
            className="button primary"
            onClick={trade}
            disabled={preview.output === undefined || preview.output === 0n}
          >
            执行模拟交易 <Icon name="arrow" size={16} />
          </button>
          <button className="icon-button outlined" onClick={reset} aria-label="重置流动池">
            <Icon name="reset" size={17} />
          </button>
        </div>
        {preview.error && (
          <p className="field-error" role="alert">
            {preview.error}
          </p>
        )}
        {message && (
          <p className="operation-message" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="lab-output">
        <div className="output-header">
          <span>POOL STATE</span>
          <span className="output-status">FEE: 30 BPS</span>
        </div>
        <div className="amm-formula">
          <span>THE INVARIANT</span>
          <strong>
            x <i>×</i> y <i>≥</i> k
          </strong>
          <small>整数运算 · 向下取整 · 手续费留在池内</small>
        </div>
        <div className="pool-reserves">
          <div>
            <span>TOKEN A / x</span>
            <strong>{reserves.x.toLocaleString()}</strong>
          </div>
          <div>
            <span>TOKEN B / y</span>
            <strong>{reserves.y.toLocaleString()}</strong>
          </div>
        </div>
        <div className="k-value">
          <span>CURRENT k</span>
          <code>{(reserves.x * reserves.y).toLocaleString()}</code>
        </div>
        <div className="trade-history">
          <div className="mini-label">
            TRANSACTION LOG <span>{history.length} / 4 RECENT</span>
          </div>
          {history.length ? (
            history.map((tradeItem, index) => (
              <div className="trade-row" key={index}>
                <span>
                  {tradeItem.input} A → {tradeItem.output} B
                </span>
                <span className="invariant-check">
                  <Icon name="check" size={12} />{' '}
                  {BigInt(tradeItem.after) >= BigInt(tradeItem.before) ? 'k′ ≥ k' : 'k′ < k'}
                </span>
              </div>
            ))
          ) : (
            <div className="empty-log">
              等待第一笔模拟交易<span>交易后在此观察不变量</span>
            </div>
          )}
        </div>
        <div className="output-footer">
          <span className="code-dot" /> core / amm.ts <span>BigInt · Local</span>
        </div>
      </div>
    </div>
  );
}

type DemoIndexer = { indexer: ReorgIndexer; blocks: Map<string, IndexedBlock>; serial: number };
const DEMO_TREASURY = 'treasury';
const DEMO_LEARNER = 'learner';

function transferBlock(
  number: number,
  hash: string,
  parentHash: string | null,
  amount: bigint,
): IndexedBlock {
  return {
    number,
    hash,
    parentHash,
    logs:
      number === 0
        ? []
        : [
            {
              transactionHash: `tx-${hash}`,
              logIndex: 0,
              from: DEMO_TREASURY,
              to: DEMO_LEARNER,
              amount,
            },
          ],
  };
}
function createDemoIndexer(): DemoIndexer {
  const indexer = new ReorgIndexer({ [DEMO_TREASURY]: 100000n });
  const initial = [
    transferBlock(0, '0x0000', null, 0n),
    transferBlock(1, '0xa101', '0x0000', 12n),
    transferBlock(2, '0xa202', '0xa101', 8n),
  ];
  for (const block of initial) indexer.applyBlock(block);
  return { indexer, blocks: new Map(initial.map((block) => [block.hash, block])), serial: 0 };
}
function IndexerLab() {
  const [engine, setEngine] = useState(createDemoIndexer);
  const [snapshot, setSnapshot] = useState(() => engine.indexer.snapshot());
  const [events, setEvents] = useState(['应用区块 #1：+12', '应用区块 #2：+8']);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const chain = snapshot.chain.map((hash) => engine.blocks.get(hash)!);
  const tip = chain[chain.length - 1]!;
  const balance = snapshot.balances[DEMO_LEARNER] ?? 0n;
  function apply(block: IndexedBlock) {
    try {
      const result = engine.indexer.applyBlock(block);
      engine.blocks.set(block.hash, block);
      const updates = result.reverted.map(
        (hash) =>
          `回滚 ${hash}：−${engine.blocks.get(hash)!.logs.reduce((sum, log) => sum + log.amount, 0n)}`,
      );
      updates.push(
        result.applied
          ? `应用 ${block.hash}：+${block.logs.reduce((sum, log) => sum + log.amount, 0n)}`
          : `重复 ${block.hash}：忽略，余额不变`,
      );
      setSnapshot(engine.indexer.snapshot());
      setEvents((previous) => [...previous, ...updates].slice(-6));
      if (result.reverted.length) setRevision((previous) => previous + 1);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '索引操作失败');
    }
  }
  function append() {
    const height = tip.number + 1;
    const hash = `0xb${(++engine.serial).toString(16).padStart(4, '0')}`;
    apply(transferBlock(height, hash, tip.hash, BigInt(5 + height * 3)));
  }
  function reorg() {
    const parent = chain[chain.length - 2]!;
    const hash = `0xc${(++engine.serial).toString(16).padStart(4, '0')}`;
    apply(transferBlock(tip.number, hash, parent.hash, revision % 2 ? 9n : 3n));
  }
  function reset() {
    const next = createDemoIndexer();
    setEngine(next);
    setSnapshot(next.indexer.snapshot());
    setEvents(['应用区块 #1：+12', '应用区块 #2：+8']);
    setRevision(0);
    setError('');
  }
  return (
    <div className="lab-content">
      <div className="lab-controls">
        <div className="lab-eyebrow">DISTRIBUTED SYSTEMS / REORG</div>
        <h3>当链改变，索引如何跟上？</h3>
        <p className="lab-description">
          追加区块、替换链头、重复投递。由同一个索引器执行状态转换。
        </p>
        <div className="indexer-balance">
          <span>当前规范链上的 learner 余额</span>
          <strong aria-live="polite">
            {balance.toString()}
            <small>units</small>
          </strong>
        </div>
        <div className="indexer-facts">
          <span>
            链高度 <strong>#{snapshot.height}</strong>
          </span>
          <span>
            重组次数 <strong>{revision}</strong>
          </span>
          <span>
            有效日志 <strong>{snapshot.logCount}</strong>
          </span>
        </div>
        <div className="inline-actions">
          <button className="button primary" onClick={append} disabled={chain.length >= 12}>
            追加区块 <Icon name="arrow" size={16} />
          </button>
          <button className="button secondary" onClick={reorg}>
            模拟重组
          </button>
          <button className="icon-button outlined" onClick={reset} aria-label="重置索引模拟">
            <Icon name="reset" size={16} />
          </button>
        </div>
        <button className="text-button replay-button" onClick={() => apply(tip)}>
          重复投递链头 · 验证幂等性 <Icon name="reset" size={14} />
        </button>
        <p className="simulation-note">
          浏览器内确定性模拟 · 最多 12 个区块
          <br />
          调用 src/core/indexer.ts；链选择由操作按钮驱动。
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="lab-output">
        <div className="output-header">
          <span>CANONICAL CHAIN</span>
          <span className="output-status">HEIGHT {snapshot.height}</span>
        </div>
        <div className="block-chain">
          {chain.slice(-4).map((block, index) => (
            <div className="block-item" key={block.hash}>
              {index > 0 && <span className="block-connector">→</span>}
              <div>
                <span>#{block.number}</span>
                <code>{block.hash}</code>
                <small>
                  {block.number
                    ? `+${block.logs.reduce((sum, log) => sum + log.amount, 0n)} units`
                    : 'GENESIS'}
                </small>
              </div>
            </div>
          ))}
        </div>
        <div className="indexer-log">
          <div className="mini-label">
            EVENT LOG <span>ROLLBACK → REPLAY</span>
          </div>
          <div aria-live="polite">
            {events.map((event, index) => (
              <div className={event.startsWith('回滚') ? 'rollback' : ''} key={`${index}-${event}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {event}
              </div>
            ))}
          </div>
        </div>
        <div className="output-footer">
          <span className="code-dot" /> core / indexer.ts <span>Deterministic · Local</span>
        </div>
      </div>
    </div>
  );
}

function Architecture({ onSelect }: { onSelect: (module: Module) => void }) {
  const groups = [modules.slice(0, 4), modules.slice(4, 8), modules.slice(8, 12)];
  return (
    <div className="architecture">
      <div className="architecture-header">
        <span>DEPENDENCY MAP / v1</span>
        <span>12 MODULES · 3 LAYERS</span>
      </div>
      <div className="architecture-layers">
        {groups.map((group, groupIndex) => (
          <div className="architecture-layer" key={groupIndex}>
            <div className="layer-label">
              <span>0{groupIndex + 1}</span>
              <strong>
                {['COMPUTER SCIENCE', 'WEB3 PROTOCOLS', 'SYSTEM ENGINEERING'][groupIndex]}
              </strong>
              <small>{['从计算开始', '建立信任机制', '连接完整系统'][groupIndex]}</small>
            </div>
            <div className="architecture-nodes">
              {group.map((module) => (
                <button onClick={() => onSelect(module)} key={module.id}>
                  <span>W{String(module.week).padStart(2, '0')}</span>
                  <strong>{module.title}</strong>
                  <small>{module.concepts[0]}</small>
                  <Icon name="arrow" size={14} />
                </button>
              ))}
            </div>
            {groupIndex < 2 && (
              <div className="layer-connector" aria-hidden="true">
                <span />↓<span />↓<span />↓<span />↓
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="architecture-footer">
        <span className="code-dot" />
        知识沿层级递进；每个节点链接到具体代码与验收条件。
      </div>
    </div>
  );
}

export default App;
