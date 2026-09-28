import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Coins,
  Globe2,
  Landmark,
  Layers3,
  LineChart,
  LockKeyhole,
  PieChart,
  ScanLine,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  WalletCards,
  Zap,
} from "lucide-react";
import { MarketingLayout } from "../components/marketing/MarketingChrome";

type MarketRow = {
  symbol: string;
  name: string;
  price: string;
  change: string;
  range: string;
  session: string;
  positive: boolean;
  points: string;
  tone: string;
};

const markets: MarketRow[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    price: "$67,842.10",
    change: "+2.48%",
    range: "$65.9k–$68.4k",
    session: "24/7",
    positive: true,
    points: "2,32 20,28 38,34 56,15 74,22 92,8 110,17 128,4",
    tone: "#a78bfa",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    price: "$3,482.64",
    change: "+1.16%",
    range: "$3.38k–$3.51k",
    session: "24/7",
    positive: true,
    points: "2,29 20,24 38,31 56,23 74,26 92,12 110,16 128,8",
    tone: "#60a5fa",
  },
  {
    symbol: "XAU",
    name: "Gold / USD",
    price: "$2,653.80",
    change: "+0.42%",
    range: "$2,631–$2,661",
    session: "Global",
    positive: true,
    points: "2,30 20,33 38,24 56,26 74,18 92,20 110,9 128,12",
    tone: "#fbbf24",
  },
  {
    symbol: "EUR",
    name: "EUR / USD",
    price: "1.1168",
    change: "-0.18%",
    range: "1.1134–1.1202",
    session: "Global",
    positive: false,
    points: "2,10 20,7 38,15 56,12 74,20 92,17 110,27 128,30",
    tone: "#fb7185",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: "$227.32",
    change: "+0.74%",
    range: "$223.91–$228.17",
    session: "US",
    positive: true,
    points: "2,31 20,27 38,29 56,18 74,21 92,14 110,18 128,7",
    tone: "#34d399",
  },
];

const products = [
  {
    icon: Coins,
    image: "/atlas-products-overview.jpg",
    eyebrow: "Digital assets",
    title: "Crypto spot",
    description:
      "Access established and emerging digital asset pairs with transparent order controls and a unified wallet.",
    link: "/products/spot",
    facts: ["Own the asset", "Market or limit", "24/7 schedule"],
  },
  {
    icon: TrendingUp,
    image: "/atlas-futures-desk.jpg",
    eyebrow: "Directional markets",
    title: "Crypto futures",
    description:
      "Trade both sides of the market with configurable leverage, margin visibility, and position-level risk tools.",
    link: "/products/futures",
    facts: ["Long or short", "Margin based", "Liquidation risk"],
  },
  {
    icon: Globe2,
    image: "/atlas-market-team.jpg",
    eyebrow: "Global exposure",
    title: "Multi-asset CFDs",
    description:
      "Follow currency pairs, metals, indices, and selected equities from a single market workspace.",
    link: "/products/cfds",
    facts: ["Selected markets", "Spread pricing", "Session specific"],
  },
  {
    icon: CircleDollarSign,
    image: "/atlas-staking-planning.jpg",
    eyebrow: "Portfolio allocation",
    title: "Staking",
    description:
      "Allocate eligible assets to defined-duration plans and track progress alongside the rest of your portfolio.",
    link: "/products/staking",
    facts: ["Eligible assets", "Term conditions", "Variable risk"],
  },
];

const faqs = [
  {
    question: "Which markets are available on Atlas Market?",
    answer:
      "Atlas Market brings crypto spot, crypto futures, selected global CFD instruments, staking, and portfolio tools into one account. Product availability may vary by account and jurisdiction.",
  },
  {
    question: "How does Atlas help me manage trading risk?",
    answer:
      "The workspace surfaces available margin, estimated liquidation levels, open exposure, and position-level stop-loss and take-profit controls. These tools can help structure risk, but they cannot eliminate it.",
  },
  {
    question: "Are the prices on this page live?",
    answer:
      "Public-page prices and charts are illustrative. Signed-in market workspaces connect to the platform’s available market data sources and display the relevant quote status.",
  },
  {
    question: "Can I see all of my activity in one place?",
    answer:
      "Yes. The account workspace consolidates balances, portfolio holdings, positions, open orders, staking allocations, and transaction history.",
  },
  {
    question: "What do I need to open an account?",
    answer:
      "Create an account with your contact details, secure your login, and complete any required identity and account checks before accessing eligible products.",
  },
];

const MarketSparkline = ({ row }: { row: MarketRow }) => (
  <svg
    viewBox="0 0 130 38"
    className="h-9 w-28 overflow-visible"
    role="img"
    aria-label={`${row.symbol} seven-day illustrative trend`}
  >
    <defs>
      <linearGradient id={`fill-${row.symbol}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={row.tone} stopOpacity="0.28" />
        <stop offset="100%" stopColor={row.tone} stopOpacity="0" />
      </linearGradient>
    </defs>
    <polyline
      points={`${row.points} 128,38 2,38`}
      fill={`url(#fill-${row.symbol})`}
      stroke="none"
    />
    <polyline
      points={row.points}
      fill="none"
      stroke={row.tone}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TradingTerminal = () => (
  <div className="landing-terminal relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#0c0e16] shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
    <div className="flex h-11 items-center justify-between border-b border-white/[0.07] px-4 sm:px-5">
      <div className="flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f7931a] text-[10px] font-black text-white">
          ₿
        </span>
        <div>
          <p className="text-[11px] font-semibold text-white">BTC / USDT</p>
          <p className="text-[8px] text-slate-600">Bitcoin perpetual</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-semibold text-emerald-400">67,842.10</p>
        <p className="text-[8px] text-emerald-500/70">+2.48%</p>
      </div>
    </div>
    <div className="grid sm:grid-cols-[1fr_150px]">
      <div className="relative min-h-[330px] overflow-hidden border-white/[0.07] p-4 sm:border-r sm:p-5">
        <div className="mb-5 flex items-center gap-4 text-[8px] font-medium uppercase tracking-[0.12em] text-slate-600">
          <span className="text-slate-300">Chart</span>
          <span>Depth</span>
          <span>Orders</span>
          <span className="ml-auto rounded bg-white/[0.04] px-2 py-1">1H</span>
        </div>
        <div className="absolute bottom-5 left-5 top-16 w-7 text-[7px] text-slate-700">
          <span>70k</span>
          <span className="absolute left-0 top-[31%]">68k</span>
          <span className="absolute left-0 top-[62%]">66k</span>
          <span className="absolute bottom-0 left-0">64k</span>
        </div>
        <svg
          viewBox="0 0 500 260"
          preserveAspectRatio="none"
          className="ml-7 h-[238px] w-[calc(100%-1.75rem)]"
        >
          <defs>
            <pattern
              id="terminal-grid"
              width="62.5"
              height="52"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 62.5 0 L 0 0 0 52"
                fill="none"
                stroke="rgba(255,255,255,.055)"
                strokeWidth="1"
              />
            </pattern>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8b5cf6" stopOpacity=".3" />
              <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="500" height="260" fill="url(#terminal-grid)" />
          <path
            d="M0 225 C28 212 38 217 66 195 S110 208 137 178 S182 166 204 178 S248 141 270 150 S314 130 333 99 S372 116 394 79 S440 88 464 48 S485 46 500 29 L500 260 L0 260Z"
            fill="url(#chart-fill)"
          />
          <path
            d="M0 225 C28 212 38 217 66 195 S110 208 137 178 S182 166 204 178 S248 141 270 150 S314 130 333 99 S372 116 394 79 S440 88 464 48 S485 46 500 29"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="0"
            y1="86"
            x2="500"
            y2="86"
            stroke="#34d399"
            strokeOpacity=".45"
            strokeDasharray="4 5"
          />
          <circle
            cx="500"
            cy="29"
            r="5"
            fill="#a78bfa"
            stroke="#0c0e16"
            strokeWidth="3"
          />
        </svg>
        <div className="absolute bottom-3 left-12 right-4 flex justify-between text-[7px] text-slate-700">
          <span>09:00</span>
          <span>12:00</span>
          <span>15:00</span>
          <span>18:00</span>
          <span>21:00</span>
        </div>
      </div>
      <div className="hidden p-4 sm:block">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Order book
        </p>
        <div className="mt-4 grid grid-cols-2 text-[7px] text-slate-700">
          <span>Price</span>
          <span className="text-right">Size</span>
        </div>
        {[
          ["67,881.2", "0.142"],
          ["67,873.8", "0.084"],
          ["67,859.1", "0.331"],
          ["67,850.6", "0.218"],
        ].map((item, index) => (
          <div
            key={item[0]}
            className="relative mt-2.5 grid grid-cols-2 text-[8px]"
          >
            <span className="text-rose-400">{item[0]}</span>
            <span className="text-right text-slate-500">{item[1]}</span>
            <span
              className="absolute right-0 top-0 -z-0 h-full bg-rose-400/[0.06]"
              style={{ width: `${25 + index * 14}%` }}
            />
          </div>
        ))}
        <div className="my-4 border-y border-white/[0.06] py-2 text-[10px] font-semibold text-emerald-400">
          67,842.1{" "}
          <span className="ml-1 text-[7px] font-normal text-slate-600">
            ≈ $67,842
          </span>
        </div>
        {[
          ["67,831.4", "0.291"],
          ["67,820.2", "0.156"],
          ["67,814.9", "0.483"],
          ["67,802.7", "0.217"],
        ].map((item, index) => (
          <div
            key={item[0]}
            className="relative mt-2.5 grid grid-cols-2 text-[8px]"
          >
            <span className="text-emerald-400">{item[0]}</span>
            <span className="text-right text-slate-500">{item[1]}</span>
            <span
              className="absolute right-0 top-0 -z-0 h-full bg-emerald-400/[0.06]"
              style={{ width: `${63 - index * 10}%` }}
            />
          </div>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-3 border-t border-white/[0.07] bg-[#0a0c13] px-4 py-3 text-[8px] sm:px-5">
      <div>
        <p className="text-slate-600">24h volume</p>
        <p className="mt-1 font-semibold text-slate-300">$1.24B</p>
      </div>
      <div>
        <p className="text-slate-600">Open interest</p>
        <p className="mt-1 font-semibold text-slate-300">$428.6M</p>
      </div>
      <div>
        <p className="text-slate-600">Funding rate</p>
        <p className="mt-1 font-semibold text-slate-300">0.0100%</p>
      </div>
    </div>
    <div className="absolute bottom-14 right-4 rounded-lg border border-white/[0.1] bg-[#161925]/95 px-3 py-2 shadow-xl backdrop-blur sm:-right-5 sm:bottom-20">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-400/10 text-emerald-400">
          <Check size={14} />
        </span>
        <div>
          <p className="text-[8px] text-slate-500">Risk control</p>
          <p className="text-[9px] font-semibold text-white">
            Stop-loss attached
          </p>
        </div>
      </div>
    </div>
  </div>
);

const HeroPhoto = () => (
  <figure className="group relative overflow-hidden rounded-[24px] border border-white/[0.1] bg-[#0c0e16] p-2 shadow-[0_42px_110px_rgba(0,0,0,.52)]">
    <div className="relative aspect-[4/3] overflow-hidden rounded-[18px]">
      <img
        src="/atlas-institutional-trader.jpg"
        alt="Financial markets professional analysing charts at an institutional trading desk"
        className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.018]"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#080910]/90 via-transparent to-[#080910]/10" />
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md border border-white/15 bg-[#090a12]/75 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md sm:left-6 sm:top-6">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]" />
        Global market workspace
      </div>
      <figcaption className="absolute bottom-5 left-5 right-5 sm:bottom-7 sm:left-7 sm:right-7">
        <p className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          Professional tools. A considered experience.
        </p>
        <p className="mt-1.5 text-[10px] text-slate-300 sm:text-xs">
          Research · Execute · Monitor
        </p>
      </figcaption>
    </div>
    <div className="absolute bottom-5 right-4 hidden items-center gap-3 rounded-xl border border-white/10 bg-[#151823]/95 px-4 py-3 shadow-2xl backdrop-blur sm:flex sm:-right-4 sm:bottom-8">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300">
        <ShieldCheck size={16} />
      </span>
      <div>
        <p className="text-[8px] text-slate-500">Built around control</p>
        <p className="text-[10px] font-semibold text-white">
          Risk tools stay in view
        </p>
      </div>
    </div>
  </figure>
);

const LandingPage = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return (
    <MarketingLayout>
      <main>
        <section className="relative isolate overflow-hidden border-b border-white/[0.07] pb-24 pt-20 sm:pb-28 sm:pt-28 lg:min-h-[760px] lg:pt-24">
          <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_22%,rgba(124,58,237,0.16),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(37,99,235,0.11),transparent_27%),linear-gradient(180deg,#0b0c16_0%,#090a12_75%)]" />
          <div className="landing-grid pointer-events-none absolute inset-0 -z-10 opacity-35" />
          <div className="mx-auto grid max-w-[1380px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
            <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
              <div className="mb-7 inline-flex items-center gap-2 rounded-md border border-violet-400/20 bg-violet-400/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-violet-200">
                <Zap size={12} /> One account. Multiple markets.
              </div>
              <h1 className="text-balance text-5xl font-medium leading-[1.02] tracking-[-0.055em] text-white sm:text-6xl lg:text-[72px]">
                Markets in motion.
                <span className="mt-1 block bg-gradient-to-r from-[#c4a7ff] via-[#9382ff] to-[#6cb8ff] bg-clip-text text-transparent">
                  Trade with control.
                </span>
              </h1>
              <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-[17px] lg:mx-0">
                Access digital assets and global markets through a focused
                trading environment built for research, execution, and portfolio
                oversight.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  to="/auth/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-bold text-[#090a12] transition hover:bg-violet-100"
                >
                  Open an account{" "}
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <Link
                  to="/platform"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
                >
                  Explore the platform <ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-3 text-[11px] text-slate-500 lg:justify-start">
                <span className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400" /> Multi-market
                  access
                </span>
                <span className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400" /> Integrated
                  risk tools
                </span>
                <span className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400" /> Portfolio
                  visibility
                </span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[720px] lg:translate-x-3">
              <HeroPhoto />
              <p className="mt-4 text-center text-[9px] uppercase tracking-[0.13em] text-slate-700">
                Professional multi-market access
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-white/[0.07] bg-[#080910]">
          <div className="mx-auto grid max-w-[1380px] grid-cols-2 divide-x divide-y divide-white/[0.07] px-5 sm:px-8 md:grid-cols-4 md:divide-y-0">
            {[
              {
                icon: BarChart3,
                title: "Spot & derivatives",
                text: "Multiple ways to access markets",
              },
              {
                icon: Globe2,
                title: "Global instruments",
                text: "Crypto, forex, metals & more",
              },
              {
                icon: WalletCards,
                title: "Unified portfolio",
                text: "Balances and exposure in one view",
              },
              {
                icon: Clock3,
                title: "24/7 crypto access",
                text: "Monitor markets around the clock",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="flex items-start gap-3 px-3 py-6 sm:px-5"
              >
                <Icon size={17} className="mt-0.5 shrink-0 text-violet-300" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    {title}
                  </p>
                  <p className="mt-1 hidden text-[10px] text-slate-600 sm:block">
                    {text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-white/[0.07] py-24 sm:py-28">
          <div className="mx-auto grid max-w-[1380px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.15fr_.85fr] lg:gap-24">
            <div>
              <TradingTerminal />
              <p className="mt-4 text-center text-[9px] uppercase tracking-[0.13em] text-slate-700">
                Platform preview · values shown for illustration
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                From analysis to action
              </p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
                A workspace designed around the trade.
              </h2>
              <p className="mt-5 text-sm leading-7 text-slate-500">
                Move from price discovery to order entry while keeping market
                depth, position context, and risk controls within reach.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  "Focused charts and instrument context",
                  "Visible order book and market information",
                  "Position controls attached to the decision",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 text-xs text-slate-400"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-400/[0.08] text-emerald-400">
                      <Check size={12} />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
              <Link
                to="/platform"
                className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200"
              >
                Explore the full platform{" "}
                <ArrowRight
                  size={15}
                  className="transition group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>
        </section>

        <section className="py-24 sm:py-28" id="market-overview">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                  Market overview
                </p>
                <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
                  Follow what moves markets.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500">
                  Scan major asset classes, compare momentum, and move from
                  discovery to analysis without changing platforms.
                </p>
              </div>
              <Link
                to="/markets"
                className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"
              >
                View all markets{" "}
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
            </div>
            <div className="mt-12 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0e16]">
              <div className="hidden grid-cols-[1.3fr_.85fr_.7fr_1fr_1fr_70px] border-b border-white/[0.07] bg-white/[0.018] px-6 py-3 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-600 sm:grid">
                <span>Instrument</span>
                <span>Last price</span>
                <span>24h</span>
                <span>Day range</span>
                <span>7d trend</span>
                <span className="text-right">Access</span>
              </div>
              {markets.map((row, index) => (
                <div
                  key={row.symbol}
                  className={`grid grid-cols-[1.4fr_0.9fr_auto] items-center gap-3 px-4 py-4 transition hover:bg-white/[0.02] sm:grid-cols-[1.3fr_.85fr_.7fr_1fr_1fr_70px] sm:px-6 ${index < markets.length - 1 ? "border-b border-white/[0.06]" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] text-[9px] font-bold text-slate-300">
                      {row.symbol}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {row.name}
                      </p>
                      <p className="mt-0.5 text-[9px] text-slate-600">
                        {row.symbol}
                        {row.symbol === "EUR" ? "" : " / USD"} · {row.session}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-medium tabular-nums text-slate-300">
                    {row.price}
                  </p>
                  <p
                    className={`hidden text-xs font-semibold sm:block ${row.positive ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {row.change}
                  </p>
                  <p className="hidden text-[10px] tabular-nums text-slate-500 sm:block">
                    {row.range}
                  </p>
                  <div className="hidden sm:block">
                    <MarketSparkline row={row} />
                  </div>
                  <Link
                    to="/auth/register"
                    className="text-right text-[10px] font-semibold text-violet-300 hover:text-violet-200"
                  >
                    Trade <ArrowUpRight size={11} className="ml-1 inline" />
                  </Link>
                </div>
              ))}
              <p className="border-t border-white/[0.06] px-6 py-3 text-[9px] text-slate-700">
                Illustrative market data. Ranges and prices are examples, not
                live quotes or recommendations.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.07] bg-[#080910] py-24 sm:py-28">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                Markets, connected
              </p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
                Build a portfolio beyond one asset class.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-slate-500">
                Compare how ownership, leverage, trading schedules, and
                liquidity differ before selecting the product that matches the
                intended exposure.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {products.map(
                ({
                  icon: Icon,
                  image,
                  eyebrow,
                  title,
                  description,
                  link,
                  facts,
                }) => (
                  <Link
                    to={link}
                    key={title}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0f17] transition duration-300 hover:-translate-y-1 hover:border-violet-400/25 hover:bg-[#10121c]"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden">
                      <img
                        src={image}
                        alt={`${title} professional context`}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f17] via-transparent to-transparent" />
                      <span className="absolute bottom-3 left-4 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-[#0b0d15]/80 text-violet-200 backdrop-blur">
                        <Icon size={18} />
                      </span>
                      <ArrowUpRight
                        size={17}
                        className="absolute right-4 top-4 text-white/60 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                        {eyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-white">
                        {title}
                      </h3>
                      <p className="mt-3 text-xs leading-6 text-slate-500">
                        {description}
                      </p>
                      <div className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
                        {facts.map((fact) => (
                          <p
                            key={fact}
                            className="flex items-center gap-2 text-[9px] text-slate-500"
                          >
                            <Check size={11} className="text-emerald-400" />
                            {fact}
                          </p>
                        ))}
                      </div>
                    </div>
                  </Link>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="py-24 sm:py-32">
          <div className="mx-auto grid max-w-[1380px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-24">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                One intelligent workspace
              </p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
                Every decision in context.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-500">
                Atlas keeps research, order entry, exposure, and account history
                within reach, so you can act without losing sight of the wider
                portfolio.
              </p>
              <div className="mt-9 space-y-6">
                {[
                  {
                    icon: ScanLine,
                    title: "Research with clarity",
                    text: "Watchlists, charting, market detail, and instrument search in a focused interface.",
                  },
                  {
                    icon: Zap,
                    title: "Execute with precision",
                    text: "Market and limit orders with clear sizing, leverage, and margin information.",
                  },
                  {
                    icon: PieChart,
                    title: "Monitor total exposure",
                    text: "Open positions, orders, balances, and portfolio allocation in one connected view.",
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex gap-4">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-violet-300">
                      <Icon size={16} />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {title}
                      </h3>
                      <p className="mt-1.5 max-w-md text-xs leading-5 text-slate-500">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/platform"
                className="group mt-9 inline-flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200"
              >
                See how the platform works{" "}
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
            </div>
            <div className="relative rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-3 shadow-[0_30px_80px_rgba(0,0,0,.35)] sm:p-5">
              <div className="rounded-xl border border-white/[0.07] bg-[#090b12] p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                      Portfolio value
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                      $124,860.42
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-emerald-400">
                      +$2,418.16 today
                    </p>
                  </div>
                  <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[9px] text-slate-500">
                    30 days
                  </span>
                </div>
                <svg
                  viewBox="0 0 600 160"
                  preserveAspectRatio="none"
                  className="mt-5 h-36 w-full"
                >
                  <defs>
                    <linearGradient
                      id="portfolio-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0" stopColor="#8b5cf6" stopOpacity=".25" />
                      <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 135 C45 128 61 112 104 119 S169 88 208 97 S275 71 320 78 S377 45 421 58 S487 28 520 38 S567 20 600 14 L600 160 L0 160Z"
                    fill="url(#portfolio-fill)"
                  />
                  <path
                    d="M0 135 C45 128 61 112 104 119 S169 88 208 97 S275 71 320 78 S377 45 421 58 S487 28 520 38 S567 20 600 14"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="2"
                  />
                </svg>
                <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4">
                  {[
                    ["Available", "82,404.20"],
                    ["In positions", "36,218.12"],
                    ["Earn products", "6,238.10"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[8px] text-slate-600">{label}</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-300">
                        ${value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1.15fr_.85fr]">
                <div className="rounded-xl border border-white/[0.07] bg-[#090b12] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Open positions
                    </p>
                    <span className="text-[8px] text-slate-700">4 active</span>
                  </div>
                  {[
                    ["BTCUSDT", "Long · 5x", "+$1,242.40"],
                    ["XAUUSD", "Long · 2x", "+$186.72"],
                    ["EURUSD", "Short · 3x", "-$42.18"],
                  ].map((item, index) => (
                    <div
                      key={item[0]}
                      className="mt-3 grid grid-cols-[1fr_1fr_auto] border-t border-white/[0.05] pt-3 text-[9px]"
                    >
                      <span className="font-semibold text-slate-300">
                        {item[0]}
                      </span>
                      <span className="text-slate-600">{item[1]}</span>
                      <span
                        className={
                          index === 2 ? "text-rose-400" : "text-emerald-400"
                        }
                      >
                        {item[2]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-[#090b12] p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Allocation
                  </p>
                  <div className="mx-auto mt-4 aspect-square max-w-[110px] rounded-full bg-[conic-gradient(#8b5cf6_0_38%,#3b82f6_38%_64%,#14b8a6_64%_79%,#273246_79%_100%)] p-5">
                    <div className="grid h-full w-full place-items-center rounded-full bg-[#090b12] text-center">
                      <div>
                        <p className="text-sm font-semibold text-white">6</p>
                        <p className="text-[7px] text-slate-600">assets</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-[8px] text-slate-700">
                Illustrative account values
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.07] bg-[#080910] py-24 sm:py-28">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
            <div className="grid gap-12 rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_80%_10%,rgba(124,58,237,.12),transparent_30%),#0d0f17] p-7 sm:p-12 lg:grid-cols-[1fr_.9fr] lg:items-center lg:p-16">
              <div>
                <span className="grid h-12 w-12 place-items-center rounded-xl border border-violet-400/15 bg-violet-400/[0.08] text-violet-300">
                  <LockKeyhole size={21} />
                </span>
                <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                  Security by design
                </p>
                <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-4xl">
                  Control is part of every layer.
                </h2>
                <p className="mt-5 max-w-xl text-sm leading-7 text-slate-500">
                  Account access, verification, portfolio activity, and risk
                  controls are designed to work together—not as disconnected
                  features.
                </p>
                <Link
                  to="/security"
                  className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200"
                >
                  Explore our security approach{" "}
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: ShieldCheck,
                    title: "Account safeguards",
                    text: "Protected authentication flows and session controls.",
                  },
                  {
                    icon: UserCheck,
                    title: "Identity workflows",
                    text: "Structured verification and account review processes.",
                  },
                  {
                    icon: Layers3,
                    title: "Activity visibility",
                    text: "Clear records for account and portfolio movements.",
                  },
                  {
                    icon: Bot,
                    title: "Risk automation",
                    text: "Position controls that stay attached to the trade.",
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <div
                    key={title}
                    className="rounded-xl border border-white/[0.07] bg-black/10 p-5"
                  >
                    <Icon size={18} className="text-emerald-400" />
                    <h3 className="mt-4 text-xs font-semibold text-slate-200">
                      {title}
                    </h3>
                    <p className="mt-2 text-[10px] leading-5 text-slate-600">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 sm:py-28">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                A clear path to the market
              </p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
                From registration to execution.
              </h2>
              <p className="mt-5 text-sm leading-6 text-slate-500">
                A focused onboarding flow designed to get the essentials right
                before the first order.
              </p>
            </div>
            <div className="relative mt-14 grid gap-4 lg:grid-cols-3">
              <div className="absolute left-[17%] right-[17%] top-7 hidden h-px bg-gradient-to-r from-transparent via-violet-400/25 to-transparent lg:block" />
              {[
                {
                  number: "01",
                  icon: UserCheck,
                  title: "Create and secure your account",
                  text: "Set up your credentials and complete the account details required for access.",
                },
                {
                  number: "02",
                  icon: Landmark,
                  title: "Fund your portfolio",
                  text: "Review available funding methods and keep track of account balances from your wallet.",
                },
                {
                  number: "03",
                  icon: LineChart,
                  title: "Research and place your trade",
                  text: "Select a market, review the instrument, define risk, and choose your order type.",
                },
              ].map(({ number, icon: Icon, title, text }) => (
                <article
                  key={number}
                  className="relative rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-7"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-14 w-14 place-items-center rounded-xl border border-violet-400/20 bg-violet-400/[0.08] text-violet-300 shadow-[0_0_0_7px_#090a12]">
                      <Icon size={21} />
                    </span>
                    <span className="text-[10px] font-semibold text-slate-700">
                      {number}
                    </span>
                  </div>
                  <h3 className="mt-8 text-base font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-3 text-xs leading-6 text-slate-500">
                    {text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.07] bg-[#080910] py-24 sm:py-28">
          <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:gap-24">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                Before you begin
              </p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
                The important questions, answered.
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-slate-500">
                Understand the products, platform, and risks before deciding
                whether Atlas is right for you.
              </p>
              <Link
                to="/support"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"
              >
                Visit support centre <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="border-y border-white/[0.08]">
              {faqs.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <div
                    key={faq.question}
                    className="border-b border-white/[0.07] last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-5 py-6 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-semibold text-slate-200 sm:text-base">
                        {faq.question}
                      </span>
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] text-slate-500 transition ${isOpen ? "rotate-180 bg-white/[0.04] text-white" : ""}`}
                      >
                        <ChevronDown size={15} />
                      </span>
                    </button>
                    {isOpen && (
                      <p className="max-w-2xl pb-6 pr-12 text-xs leading-6 text-slate-500">
                        {faq.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden py-24 text-center sm:py-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(124,58,237,.15),transparent_44%)]" />
          <div className="relative mx-auto max-w-3xl px-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
              Your market. Your move.
            </p>
            <h2 className="mt-4 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
              A clearer way to access the markets.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-slate-500">
              Open an Atlas Market account and bring research, execution, and
              portfolio oversight into one focused workspace.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/auth/register"
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-bold text-[#090a12] transition hover:bg-violet-100"
              >
                Open an account{" "}
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                to="/support"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-6 py-3.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.04]"
              >
                Talk to support
              </Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
};

export default LandingPage;
