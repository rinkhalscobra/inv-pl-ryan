import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Check,
  CircleDollarSign,
  Clock3,
  Coins,
  FileCheck2,
  Gauge,
  Globe2,
  Headphones,
  Landmark,
  Layers3,
  LineChart,
  LockKeyhole,
  Mail,
  MonitorSmartphone,
  PieChart,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCheck,
  WalletCards,
} from "lucide-react";
import { MarketingLayout } from "../components/marketing/MarketingChrome";

export type MarketingPageKind =
  | "platform"
  | "markets"
  | "fees"
  | "security"
  | "company"
  | "support"
  | "risk"
  | "privacy"
  | "terms";

const SectionIntro = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) => (
  <div className="max-w-2xl">
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
      {eyebrow}
    </p>
    <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] text-white sm:text-5xl">
      {title}
    </h2>
    <div className="mt-5 text-sm leading-7 text-slate-500">{children}</div>
  </div>
);

const PageHero = ({
  eyebrow,
  title,
  description,
  aside,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
  primary: { label: string; to: string };
  secondary: { label: string; to: string };
}) => (
  <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20 sm:py-28">
    <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_15%,rgba(124,58,237,.15),transparent_29%),radial-gradient(circle_at_82%_5%,rgba(37,99,235,.09),transparent_25%),linear-gradient(180deg,#0c0d18,#090a12)]" />
    <div className="landing-grid absolute inset-0 -z-10 opacity-25" />
    <div
      className={`mx-auto grid max-w-[1380px] items-center gap-14 px-5 sm:px-8 ${aside ? "lg:grid-cols-[.85fr_1.15fr]" : ""}`}
    >
      <div className={aside ? "" : "max-w-4xl"}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
          {eyebrow}
        </p>
        <h1 className="mt-5 text-5xl font-medium leading-[1.03] tracking-[-0.055em] text-white sm:text-6xl lg:text-[72px]">
          {title}
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-slate-400">
          {description}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            to={primary.to}
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-bold text-[#090a12] hover:bg-violet-100"
          >
            {primary.label}{" "}
            <ArrowRight
              size={16}
              className="transition group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            to={secondary.to}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]"
          >
            {secondary.label}
          </Link>
        </div>
      </div>
      {aside}
    </div>
  </section>
);

const PlatformPage = () => {
  const tools = [
    {
      icon: LineChart,
      title: "Advanced charting",
      text: "Move between timeframes, review price structure, and keep instrument detail in view.",
      output: "Price history · Timeframes · Market context",
    },
    {
      icon: SlidersHorizontal,
      title: "Flexible order entry",
      text: "Choose market or limit execution and define sizing, leverage, stop loss, and take profit.",
      output: "Side · Quantity · Execution conditions",
    },
    {
      icon: Layers3,
      title: "Position management",
      text: "Track open orders, unrealised results, margin, and liquidation estimates in one place.",
      output: "Status · Exposure · Attached controls",
    },
    {
      icon: BellRing,
      title: "Market monitoring",
      text: "Use watchlists and focused market panels to follow the instruments that matter to you.",
      output: "Watchlists · Movers · Quote state",
    },
    {
      icon: WalletCards,
      title: "Unified wallet",
      text: "Review cash, assets, allocations, and transaction history without leaving the workspace.",
      output: "Balances · Transfers · Activity records",
    },
    {
      icon: PieChart,
      title: "Portfolio context",
      output: "Allocation · Concentration · Available funds",
      text: "See how each position and product contributes to the account’s total exposure.",
    },
  ];
  return (
    <>
      <PageHero
        eyebrow="Atlas platform"
        title="A trading workspace without the noise."
        description="Built to keep research, execution, and portfolio management connected—whether you are checking one market or managing several positions."
        primary={{
          label: "Explore workspace tools",
          to: "/platform#workspace",
        }}
        secondary={{ label: "Compare products", to: "/products" }}
        aside={
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2 shadow-[0_35px_90px_rgba(0,0,0,.4)]">
            <img
              src="/atlas-trading-professional.jpg"
              alt="Professional trading workspace"
              className="aspect-[16/10] w-full rounded-xl object-cover"
            />
            <div className="absolute inset-2 rounded-xl bg-gradient-to-t from-[#080910]/80 via-transparent to-transparent" />
            <div className="absolute bottom-7 left-7">
              <p className="text-xs font-semibold text-white">
                Designed around decisions
              </p>
              <p className="mt-1 text-[9px] text-slate-400">
                Research · Execute · Monitor
              </p>
            </div>
          </div>
        }
      />
      <section id="workspace" className="py-24 sm:py-28">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <SectionIntro
            eyebrow="Workspace essentials"
            title="The tools you need, arranged around the trade."
          >
            <p>
              A consistent interface across market categories means less time
              relearning navigation and more time understanding the position.
            </p>
          </SectionIntro>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map(({ icon: Icon, title, text, output }) => (
              <article
                key={title}
                className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-400/[0.09] text-violet-300">
                  <Icon size={18} />
                </span>
                <h3 className="mt-6 text-sm font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-3 text-xs leading-6 text-slate-500">{text}</p>
                <p className="mt-5 border-t border-white/[0.06] pt-4 text-[9px] font-medium text-violet-300/70">
                  {output}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="border-y border-white/[0.07] bg-[#080910] py-24">
        <div className="mx-auto grid max-w-[1380px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-24">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-5">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-600">
                  Account overview
                </p>
                <p className="mt-2 text-2xl font-semibold">$82,430.18</p>
              </div>
              <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold text-emerald-400">
                +3.2% MTD
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                ["Available balance", "$46,208.40"],
                ["Open exposure", "$28,342.71"],
                ["Earn allocations", "$7,879.07"],
                ["Open positions", "6"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/[0.06] bg-black/10 p-4"
                >
                  <p className="text-[9px] text-slate-600">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-200">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[8px] text-slate-700">
              Illustrative account values
            </p>
          </div>
          <SectionIntro
            eyebrow="Portfolio first"
            title="See the account, not just the order."
          >
            <p>
              Balances, positions, working orders, and longer-term allocations
              all affect the same portfolio. Atlas keeps that relationship
              visible so decisions are made with fuller context.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Real-time position and margin context",
                "Consolidated asset and cash balances",
                "Searchable transaction and order history",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-xs text-slate-400"
                >
                  <Check size={14} className="text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </SectionIntro>
        </div>
      </section>
      <section id="staking" className="py-24">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="grid gap-10 rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_85%_20%,rgba(124,58,237,.13),transparent_32%),#0d0f17] p-8 sm:p-12 lg:grid-cols-[1fr_.8fr] lg:items-center">
            <div>
              <CircleDollarSign size={26} className="text-violet-300" />
              <h2 className="mt-6 text-3xl font-medium tracking-[-0.04em]">
                Put eligible assets to work.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500">
                Compare available staking durations, review the applicable
                terms, and follow allocations alongside the rest of your
                portfolio.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                "Clear term and return information",
                "Allocation status and completion tracking",
                "Integrated balance and activity records",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 text-xs text-slate-300"
                >
                  <Check size={14} className="text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="border-t border-white/[0.07] bg-[#080910] py-24">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <SectionIntro
            eyebrow="A complete decision loop"
            title="One workflow from discovery to review."
          >
            <p>
              The interface keeps each stage connected while giving every stage
              its own information hierarchy, controls, and record.
            </p>
          </SectionIntro>
          <div className="mt-12 grid gap-4 lg:grid-cols-4">
            {[
              {
                number: "01",
                title: "Discover",
                text: "Filter instruments, compare current conditions, and move selected markets into a focused watchlist.",
                detail: "Output: a defined instrument shortlist",
              },
              {
                number: "02",
                title: "Analyse",
                text: "Review chart structure, depth, contract information, schedule, and the events relevant to the market.",
                detail: "Output: a documented market thesis",
              },
              {
                number: "03",
                title: "Execute",
                text: "Choose order behaviour, calculate size, inspect margin or conversion impact, and verify the confirmation summary.",
                detail: "Output: a traceable order instruction",
              },
              {
                number: "04",
                title: "Supervise",
                text: "Track fills, open exposure, unrealised results, attached controls, and changes in available account resources.",
                detail: "Output: an updated portfolio view",
              },
            ].map((item) => (
              <article
                key={item.number}
                className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6"
              >
                <span className="text-[9px] font-semibold text-violet-300">
                  {item.number}
                </span>
                <h3 className="mt-5 text-base font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  {item.text}
                </p>
                <p className="mt-5 border-t border-white/[0.06] pt-4 text-[9px] font-medium text-emerald-400/75">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

const MarketsPage = () => {
  const categories = [
    {
      id: "crypto",
      icon: Coins,
      title: "Crypto spot",
      eyebrow: "Own the underlying asset",
      text: "Exchange supported digital assets through a straightforward spot order workflow and follow holdings from the unified wallet.",
      features: [
        "Market and limit orders",
        "Portfolio asset tracking",
        "Integrated crypto wallet",
      ],
    },
    {
      id: "futures",
      icon: BarChart3,
      title: "Crypto futures",
      eyebrow: "Trade market direction",
      text: "Access long and short exposure with configurable leverage, visible margin requirements, and position-level risk controls.",
      features: [
        "Long and short positions",
        "Isolated and cross margin context",
        "Stop-loss and take-profit controls",
      ],
    },
    {
      id: "cfds",
      icon: Globe2,
      title: "Global CFDs",
      eyebrow: "One account, broader markets",
      text: "Follow selected forex, commodities, indices, and equities without leaving the Atlas market workspace.",
      features: [
        "Currency pairs and metals",
        "Selected indices and equities",
        "Consistent multi-asset interface",
      ],
    },
  ];
  return (
    <>
      <PageHero
        eyebrow="Atlas markets"
        title="More ways to express a market view."
        description="Move across digital assets and selected global markets from one account—with consistent tools, clearer product context, and portfolio-wide visibility."
        primary={{ label: "Compare product routes", to: "/products" }}
        secondary={{ label: "Read market risks", to: "/legal/risk-disclosure" }}
        aside={
          <div>
            <figure className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2">
              <img
                src="/atlas-market-analysts.jpg"
                alt="Global markets analysts reviewing multi-asset research"
                className="aspect-[16/9] w-full rounded-xl object-cover"
              />
            </figure>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                ["Crypto", "24/7"],
                ["Order types", "Market + limit"],
                ["Exposure", "Long + short"],
                ["Workspace", "Multi-asset"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"
                >
                  <p className="text-[8px] uppercase tracking-widest text-slate-600">
                    {label}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-200">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        }
      />
      <section className="py-24 sm:py-28">
        <div className="mx-auto max-w-[1380px] space-y-5 px-5 sm:px-8">
          {categories.map(
            ({ id, icon: Icon, title, eyebrow, text, features }) => (
              <article
                id={id}
                key={id}
                className="scroll-mt-28 grid gap-10 rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-7 sm:p-10 lg:grid-cols-[.75fr_1.25fr] lg:items-center"
              >
                <div>
                  <span className="grid h-12 w-12 place-items-center rounded-xl border border-violet-400/15 bg-violet-400/[0.08] text-violet-300">
                    <Icon size={21} />
                  </span>
                  <p className="mt-7 text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                    {eyebrow}
                  </p>
                  <h2 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
                    {title}
                  </h2>
                </div>
                <div>
                  <p className="text-sm leading-7 text-slate-400">{text}</p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-3">
                    {features.map((feature) => (
                      <div
                        key={feature}
                        className="rounded-xl border border-white/[0.06] bg-black/10 p-4 text-[11px] leading-5 text-slate-400"
                      >
                        <Check size={13} className="mb-3 text-emerald-400" />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <Link
                    to="/auth/register"
                    className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-violet-300"
                  >
                    Explore {title.toLowerCase()} <ArrowUpRight size={13} />
                  </Link>
                </div>
              </article>
            ),
          )}
        </div>
      </section>
      <section className="border-t border-white/[0.07] bg-[#080910] py-24">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="grid gap-14 lg:grid-cols-[.72fr_1.28fr] lg:gap-24">
            <SectionIntro
              eyebrow="Research by market"
              title="Follow the driver behind the symbol."
            >
              <p>
                Market categories respond to different information. A useful
                research process starts with the economic mechanism most likely
                to move the instrument.
              </p>
            </SectionIntro>
            <div className="space-y-3">
              {[
                {
                  market: "Digital assets",
                  driver:
                    "Network activity, liquidity, sentiment, protocol events",
                  review:
                    "Check market depth, venue conditions, token-specific announcements, and whether weekend liquidity differs from weekday activity.",
                },
                {
                  market: "Currencies",
                  driver:
                    "Rates, inflation, employment, central-bank expectations",
                  review:
                    "Compare both economies in the pair and note which regional session is most likely to provide active liquidity.",
                },
                {
                  market: "Metals & commodities",
                  driver:
                    "Supply, inventories, production, geopolitics, the US dollar",
                  review:
                    "Separate physical-market developments from broad macro positioning and review relevant inventory or production schedules.",
                },
                {
                  market: "Indices & equities",
                  driver:
                    "Earnings, valuation, sector weight, policy, risk appetite",
                  review:
                    "Identify concentration in the index or company and account for exchange hours, results dates, and potential opening gaps.",
                },
              ].map((item) => (
                <article
                  key={item.market}
                  className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#0c0e16] p-5 sm:grid-cols-[150px_1fr]"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      {item.market}
                    </p>
                    <p className="mt-2 text-[9px] uppercase tracking-widest text-violet-300/70">
                      {item.driver}
                    </p>
                  </div>
                  <p className="text-xs leading-6 text-slate-500">
                    {item.review}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-white/[0.07] bg-[#080910] py-24">
        <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:items-center">
          <SectionIntro
            eyebrow="Know the product"
            title="Different markets. Different risk."
          >
            <p>
              Spot assets, derivatives, and contracts for difference do not
              behave the same way. Leverage magnifies both gains and losses,
              funding and overnight costs may apply, and available instruments
              can vary.
            </p>
            <Link
              to="/legal/risk-disclosure"
              className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-violet-300"
            >
              Read the risk disclosure <ArrowRight size={13} />
            </Link>
          </SectionIntro>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Spot", "Asset ownership; no position leverage by default"],
              ["Futures", "Leveraged directional exposure; liquidation risk"],
              ["CFDs", "Leveraged contracts; financing and spread costs"],
              ["Staking", "Lock-up, asset, and product-specific risks"],
            ].map(([title, text]) => (
              <div
                key={title}
                className="rounded-xl border border-white/[0.08] bg-[#0d0f17] p-5"
              >
                <p className="text-xs font-semibold text-slate-200">{title}</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-600">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

const FeesPage = () => (
  <>
    <PageHero
      eyebrow="Pricing and conditions"
      title="Trading costs, explained clearly."
      description="Understand the cost categories that can apply before you place a trade. Actual spreads, financing, and product terms can vary by instrument and market conditions."
      primary={{ label: "Compare cost categories", to: "/fees#costs" }}
      secondary={{
        label: "Review risk disclosure",
        to: "/legal/risk-disclosure",
      }}
      aside={
        <div>
          <figure className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2">
            <img
              src="/atlas-portfolio-professional.jpg"
              alt="Investor reviewing portfolio costs and market activity"
              className="aspect-[16/9] w-full rounded-xl object-cover"
            />
          </figure>
          <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#0c0e16] p-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              Pricing principles
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                "Costs shown before confirmation",
                "Product-specific spread context",
                "Clear overnight financing terms",
                "No public-page price guarantees",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 text-[10px] text-slate-300"
                >
                  <Check size={12} className="shrink-0 text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
    <section id="costs" className="scroll-mt-28 py-24 sm:py-28">
      <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
        <SectionIntro
          eyebrow="Cost structure"
          title="Know what can affect the trade."
        >
          <p>
            Different products use different pricing models. Review the
            instrument detail and order summary for the conditions that apply to
            your position.
          </p>
        </SectionIntro>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: BarChart3,
              title: "Spread",
              text: "The difference between the available buy and sell price. Spreads can widen when markets are volatile or liquidity is limited.",
            },
            {
              icon: Clock3,
              title: "Overnight financing",
              text: "A financing or swap adjustment may apply when a leveraged position remains open across the relevant daily cut-off.",
            },
            {
              icon: CircleDollarSign,
              title: "Product charges",
              text: "Some funding, withdrawal, conversion, or earning products may carry product-specific network or service costs.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-7"
            >
              <Icon size={20} className="text-violet-300" />
              <h2 className="mt-7 text-base font-semibold">{title}</h2>
              <p className="mt-3 text-xs leading-6 text-slate-500">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
    <section className="border-y border-white/[0.07] bg-[#080910] py-24">
      <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
        <SectionIntro
          eyebrow="By product"
          title="Pricing depends on how you access the market."
        >
          <p>
            This overview is a guide to the main cost categories, not a live
            quote. The order ticket and instrument detail provide the relevant
            trading information.
          </p>
        </SectionIntro>
        <div className="mt-12 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0e16]">
          <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-white/[0.07] bg-white/[0.02] px-5 py-4 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
            <span>Product</span>
            <span>Primary cost</span>
            <span>May also apply</span>
          </div>
          {[
            ["Crypto spot", "Quoted spread", "Network or conversion costs"],
            ["Crypto futures", "Spread", "Funding and liquidation risk"],
            ["Global CFDs", "Spread", "Overnight financing"],
            ["Staking", "Product terms", "Lock-up and asset risk"],
          ].map((row) => (
            <div
              key={row[0]}
              className="grid grid-cols-[1fr_1fr_1fr] border-b border-white/[0.06] px-5 py-5 text-[10px] last:border-0 sm:text-xs"
            >
              <span className="font-semibold text-slate-200">{row[0]}</span>
              <span className="text-slate-400">{row[1]}</span>
              <span className="text-slate-500">{row[2]}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5 text-xs leading-6 text-amber-100/60">
          Market conditions can change quickly. Displayed prices and cost
          estimates may change before an order is executed, particularly during
          volatile or illiquid periods.
        </div>
      </div>
    </section>
    <section className="py-24">
      <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-[.78fr_1.22fr] lg:gap-24">
        <SectionIntro
          eyebrow="Worked cost review"
          title="Read the route from quote to net result."
        >
          <p>
            This illustrative walkthrough shows where cost information enters a
            leveraged position. It deliberately avoids presenting a fixed rate
            because live conditions are instrument specific.
          </p>
        </SectionIntro>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6 sm:p-8">
          <div className="grid grid-cols-[42px_1fr_auto] gap-4 border-b border-white/[0.07] pb-5 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
            <span>Step</span>
            <span>Question</span>
            <span>Evidence</span>
          </div>
          {[
            ["01", "What is the entry cost?", "Compare executable bid and ask"],
            [
              "02",
              "How large is the economic exposure?",
              "Multiply quantity by contract value",
            ],
            [
              "03",
              "Will the position cross a daily cut-off?",
              "Read financing time and direction",
            ],
            [
              "04",
              "What changes at exit?",
              "Recheck spread, conversion, and fill price",
            ],
          ].map((row) => (
            <div
              key={row[0]}
              className="grid grid-cols-[42px_1fr_auto] gap-4 border-b border-white/[0.06] py-5 text-xs last:border-0"
            >
              <span className="font-semibold text-violet-300">{row[0]}</span>
              <span className="font-medium text-slate-200">{row[1]}</span>
              <span className="max-w-[230px] text-right text-slate-500">
                {row[2]}
              </span>
            </div>
          ))}
          <p className="mt-5 rounded-lg bg-white/[0.025] p-4 text-[10px] leading-5 text-slate-600">
            Net result = realised price movement − spread impact − applicable
            financing − product or conversion charges. Actual components vary by
            product.
          </p>
        </div>
      </div>
    </section>
    <section className="border-t border-white/[0.07] bg-[#080910] py-24">
      <div className="mx-auto grid max-w-[1380px] items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-3xl font-medium tracking-[-0.04em]">
            Review the full order before you confirm.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
            Instrument, side, size, price type, margin, holding horizon, account
            currency, and applicable costs all affect the result. Take time to
            review each field.
          </p>
        </div>
        <Link
          to="/auth/register"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-bold text-[#090a12] hover:bg-violet-100"
        >
          Open an account <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  </>
);

const SecurityPage = () => {
  const safeguards = [
    {
      icon: LockKeyhole,
      title: "Account access",
      text: "Authentication and recovery flows are designed to keep access tied to the verified account holder.",
    },
    {
      icon: UserCheck,
      title: "Identity verification",
      text: "Structured identity and document review workflows support account integrity and eligibility checks.",
    },
    {
      icon: FileCheck2,
      title: "Activity records",
      text: "Account movements and trading activity are recorded so users can review what changed and when.",
    },
    {
      icon: Gauge,
      title: "Trading risk controls",
      text: "Position information, margin context, and attached order controls support more deliberate risk management.",
    },
    {
      icon: MonitorSmartphone,
      title: "Session awareness",
      text: "Account access is designed around secure sessions and controlled authentication handoffs.",
    },
    {
      icon: ShieldCheck,
      title: "Operational controls",
      text: "Administrative access and client workflows use role and network controls where applicable.",
    },
  ];
  return (
    <>
      <PageHero
        eyebrow="Security at Atlas"
        title="Confidence begins with control."
        description="Security is more than a login screen. Atlas combines account safeguards, verification workflows, activity visibility, and trading risk tools across the client experience."
        primary={{
          label: "Review account safeguards",
          to: "/security#safeguards",
        }}
        secondary={{ label: "Report a concern", to: "/support#contact" }}
        aside={
          <figure className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2 shadow-[0_32px_90px_rgba(0,0,0,.4)]">
            <img
              src="/atlas-security-operations.jpg"
              alt="Financial technology security and support professionals reviewing account activity"
              className="aspect-[16/10] w-full rounded-xl object-cover"
            />
            <div className="absolute inset-2 rounded-xl bg-gradient-to-t from-[#080910]/75 via-transparent to-transparent" />
            <span className="absolute bottom-6 left-6 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-[#0b0d15]/80 text-emerald-300 backdrop-blur">
              <ShieldCheck size={18} />
            </span>
          </figure>
        }
      />
      <section id="safeguards" className="scroll-mt-28 py-24 sm:py-28">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <SectionIntro
            eyebrow="Layered safeguards"
            title="Protection across the account lifecycle."
          >
            <p>
              Every security control serves a different purpose. Together, they
              create clearer boundaries around access, activity, and trading
              decisions.
            </p>
          </SectionIntro>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {safeguards.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6"
              >
                <Icon size={20} className="text-emerald-400" />
                <h3 className="mt-6 text-sm font-semibold">{title}</h3>
                <p className="mt-3 text-xs leading-6 text-slate-500">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="border-y border-white/[0.07] bg-[#080910] py-24">
        <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-[.8fr_1.2fr]">
          <SectionIntro
            eyebrow="Your role"
            title="Good security is a shared practice."
          >
            <p>
              Use a unique password, protect access to your email, review
              account activity regularly, and contact support if something looks
              unfamiliar.
            </p>
          </SectionIntro>
          <div className="space-y-3">
            {[
              "Never share your password or recovery details",
              "Verify the address before entering account credentials",
              "Review transaction and position history frequently",
              "Contact support immediately about suspicious activity",
            ].map((item, index) => (
              <div
                key={item}
                className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-[#0c0e16] p-4"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-violet-400/[0.08] text-[9px] font-semibold text-violet-300">
                  0{index + 1}
                </span>
                <p className="text-xs text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-24">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
            <SectionIntro
              eyebrow="If something looks wrong"
              title="Contain first. Investigate second."
            >
              <p>
                Fast reporting gives the support and security workflow better
                information to protect access, review activity, and document the
                incident.
              </p>
            </SectionIntro>
            <p className="max-w-2xl text-sm leading-7 text-slate-500">
              Do not continue approving prompts or repeat a transfer while
              trying to diagnose an issue. Preserve timestamps, transaction
              identifiers, and the exact messages shown without sharing
              credentials.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Secure access",
                text: "Change exposed credentials from a trusted device, protect the connected email account, and end sessions you do not recognise.",
                meta: "Immediate user action",
              },
              {
                title: "Preserve evidence",
                text: "Record time, device, network context, affected asset or order, reference identifiers, and screenshots that do not reveal secrets.",
                meta: "Incident record",
              },
              {
                title: "Contact the right channel",
                text: "Use signed-in support where possible, describe what happened once, and keep all follow-up inside the same case.",
                meta: "Controlled escalation",
              },
            ].map(({ title, text, meta }) => (
              <article
                key={title}
                className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6"
              >
                <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400/70">
                  {meta}
                </p>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-3 text-xs leading-6 text-slate-500">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

const CompanyPage = () => (
  <>
    <PageHero
      eyebrow="About Atlas"
      title="Built for clearer market participation."
      description="Atlas Market brings multi-asset access, modern execution tools, and portfolio visibility into one considered experience."
      primary={{ label: "Read our approach", to: "/company#approach" }}
      secondary={{ label: "See the platform", to: "/platform" }}
      aside={
        <div className="overflow-hidden rounded-2xl border border-white/[0.09] p-2">
          <img
            src="/atlas-market-team.jpg"
            alt="Market professionals collaborating"
            className="aspect-[16/10] w-full rounded-xl object-cover"
          />
        </div>
      }
    />
    <section id="approach" className="scroll-mt-28 py-24">
      <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
        <SectionIntro
          eyebrow="Our approach"
          title="Complex markets. A more coherent experience."
        >
          <p>
            Trading products can be sophisticated without the product experience
            becoming confusing. Our approach is to surface the information that
            matters, preserve context between actions, and be direct about risk.
          </p>
        </SectionIntro>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Target,
              title: "Clarity over clutter",
              text: "Interfaces should make price, exposure, order state, and account impact easier to understand.",
            },
            {
              icon: Layers3,
              title: "One connected account",
              text: "Market activity, balances, and portfolio history should tell one consistent story.",
            },
            {
              icon: Sparkles,
              title: "Useful innovation",
              text: "Automation and new product features should solve a real user problem, not add novelty.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article
              key={title}
              className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-7"
            >
              <Icon size={20} className="text-violet-300" />
              <h3 className="mt-7 text-base font-semibold">{title}</h3>
              <p className="mt-3 text-xs leading-6 text-slate-500">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
    <section className="border-y border-white/[0.07] bg-[#080910] py-24">
      <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:items-center">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Multi-asset", "Market access"],
            ["Integrated", "Portfolio view"],
            ["Structured", "Risk controls"],
            ["Human", "Support access"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="rounded-xl border border-white/[0.08] bg-[#0c0e16] p-6"
            >
              <p className="text-lg font-semibold text-white">{value}</p>
              <p className="mt-2 text-[10px] uppercase tracking-widest text-slate-600">
                {label}
              </p>
            </div>
          ))}
        </div>
        <SectionIntro
          eyebrow="What we are building"
          title="A platform designed to earn attention."
        >
          <p>
            Serious market tools should feel dependable, direct, and respectful
            of the user’s time. Atlas is developed around that standard—from the
            first market search to the complete account history.
          </p>
        </SectionIntro>
      </div>
    </section>
    <section className="py-24">
      <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:gap-24">
        <SectionIntro
          eyebrow="Product principles"
          title="Standards that shape each release."
        >
          <p>
            A serious trading experience is built through repeated operational
            choices: what information appears first, which actions require
            confirmation, and how the final account record is preserved.
          </p>
        </SectionIntro>
        <div className="space-y-3">
          {[
            {
              title: "Explain the economic effect",
              text: "Product copy and ticket fields should describe ownership, leverage, margin, duration, and cost in terms that connect directly to the account.",
            },
            {
              title: "Preserve decision context",
              text: "Research, order details, position state, and history should remain connected so a user can reconstruct why an action was taken.",
            },
            {
              title: "Design the exception path",
              text: "Rejected orders, unavailable markets, verification delays, and support escalation deserve the same care as the ideal workflow.",
            },
            {
              title: "Keep risk visible",
              text: "Warnings should appear at the relevant decision—not only in a distant document—and should avoid implying that controls guarantee outcomes.",
            },
          ].map((item, index) => (
            <article
              key={item.title}
              className="grid gap-4 rounded-xl border border-white/[0.08] bg-[#0c0e16] p-5 sm:grid-cols-[42px_1fr]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-400/[0.08] text-[9px] font-semibold text-violet-300">
                0{index + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {item.text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  </>
);

const SupportPage = () => (
  <>
    <PageHero
      eyebrow="Atlas support"
      title="Answers when you need them."
      description="Find guidance on accounts, funding, trading products, portfolio activity, and security—or reach the support team for account-specific help."
      primary={{ label: "Browse help categories", to: "/support#topics" }}
      secondary={{ label: "Contact support", to: "/support#contact" }}
      aside={
        <div>
          <figure className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2">
            <img
              src="/atlas-client-support.jpg"
              alt="Client support specialist assisting with an account request"
              className="aspect-[16/9] w-full rounded-xl object-cover"
            />
          </figure>
          <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#0c0e16] p-4">
            <div className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-[#090a12] px-4 py-3 text-slate-600">
              <Search size={15} />
              <span className="text-[10px]">Search help topics</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {["Account", "Funding", "Trading", "Security"].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-white/[0.06] p-2 text-center text-[8px] text-slate-400"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
    <section id="topics" className="scroll-mt-28 py-24">
      <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: UserCheck,
              title: "Account access",
              text: "Resolve registration, sign-in, verification, recovery, and profile-maintenance questions.",
              topics: ["Login", "Verification", "Profile"],
            },
            {
              icon: Landmark,
              title: "Funding & wallet",
              text: "Trace balance changes, network deposits, withdrawal reviews, and transaction status.",
              topics: ["Deposits", "Withdrawals", "History"],
            },
            {
              icon: LineChart,
              title: "Trading help",
              text: "Understand product mechanics, order states, margin fields, and position-management actions.",
              topics: ["Orders", "Margin", "Positions"],
            },
            {
              icon: ShieldCheck,
              title: "Security",
              text: "Report unfamiliar access, protect a session, and follow the controlled recovery process.",
              topics: ["Sessions", "Reports", "Recovery"],
            },
          ].map(({ icon: Icon, title, text, topics }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6"
            >
              <Icon size={20} className="text-violet-300" />
              <h2 className="mt-6 text-sm font-semibold">{title}</h2>
              <p className="mt-3 text-xs leading-6 text-slate-500">{text}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[8px] font-medium text-slate-500"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
    <section className="border-t border-white/[0.07] bg-[#080910] py-24">
      <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-24">
        <SectionIntro
          eyebrow="Prepare the request"
          title="Details that shorten the investigation."
        >
          <p>
            Provide the smallest complete set of non-sensitive facts. A precise
            timeline and reference number are more useful than repeatedly
            opening new requests.
          </p>
        </SectionIntro>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              title: "Account or profile issue",
              text: "Include the affected workflow, exact error message, local time, device type, and the last step that completed successfully.",
            },
            {
              title: "Deposit or withdrawal",
              text: "Provide asset, network, amount, transaction identifier, destination status, and the time the transaction was submitted.",
            },
            {
              title: "Order or position",
              text: "Include instrument, product, order identifier, side, requested size, order type, and the status currently displayed.",
            },
            {
              title: "Suspicious activity",
              text: "State what you do not recognise, when you first noticed it, and which access-protection actions you have already completed.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-white/[0.08] bg-[#0c0e16] p-5"
            >
              <h3 className="text-sm font-semibold text-slate-200">
                {item.title}
              </h3>
              <p className="mt-3 text-xs leading-6 text-slate-500">
                {item.text}
              </p>
            </article>
          ))}
          <div className="sm:col-span-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5 text-xs leading-6 text-amber-100/60">
            Never send a password, one-time code, recovery phrase, private key,
            or full payment-card details. Atlas support does not need these
            secrets to investigate an account request.
          </div>
        </div>
      </div>
    </section>
    <section
      id="contact"
      className="scroll-mt-28 border-y border-white/[0.07] bg-[#080910] py-24"
    >
      <div className="mx-auto grid max-w-[1380px] gap-12 px-5 sm:px-8 lg:grid-cols-[.8fr_1.2fr]">
        <SectionIntro
          eyebrow="Contact support"
          title="Need account-specific help?"
        >
          <p>
            For your security, do not include passwords, recovery credentials,
            or full payment details in a support request.
          </p>
        </SectionIntro>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6">
            <Headphones size={20} className="text-emerald-400" />
            <h3 className="mt-6 text-sm font-semibold">Client support</h3>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              Sign in to access account-aware assistance and keep your request
              connected to your profile.
            </p>
            <Link
              to="/auth"
              className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-violet-300"
            >
              Sign in <ArrowRight size={13} />
            </Link>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6">
            <Mail size={20} className="text-emerald-400" />
            <h3 className="mt-6 text-sm font-semibold">General enquiries</h3>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              Use the support channel available in the platform for questions
              that are not tied to an active order.
            </p>
            <Link
              to="/auth/register"
              className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-violet-300"
            >
              Create account <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  </>
);

const legalCopy = {
  risk: {
    eyebrow: "Legal information",
    title: "Risk disclosure",
    intro:
      "This summary explains key risks associated with digital assets, derivatives, leveraged products, and staking. It is not investment, legal, or tax advice.",
    summary: [
      ["Applies to", "Trading and allocation products"],
      ["Primary principle", "Capital can be lost"],
      ["User action", "Review before exposure"],
    ],
    notice:
      "Risk cannot be reduced to one warning or metric. Review the product specification, live order information, account exposure, and your own capacity for loss together before acting.",
    sections: [
      [
        "Market risk",
        "Prices can move rapidly and unpredictably. You may lose some or all of the capital committed to a product or position. Past performance does not indicate future results.",
      ],
      [
        "Leverage risk",
        "Leverage magnifies both profits and losses. Relatively small market movements can lead to significant losses or liquidation. You should understand margin requirements before trading.",
      ],
      [
        "Liquidity and execution risk",
        "Orders may execute at a different price than expected, may execute partially, or may not execute in fast or illiquid markets. Spreads can widen materially.",
      ],
      [
        "Digital asset risk",
        "Digital assets can be highly volatile and may be affected by technology failures, network events, protocol changes, regulatory developments, and loss of market confidence.",
      ],
      [
        "Staking and lock-up risk",
        "Staking products may restrict access to allocated assets for a period. Returns are not guaranteed, and product or asset-specific risks may affect principal and rewards.",
      ],
      [
        "Suitability",
        "Only trade products you understand and can afford to lose. Consider your objectives, financial circumstances, experience, and independent professional advice where appropriate.",
      ],
    ],
  },
  privacy: {
    eyebrow: "Legal information",
    title: "Privacy policy",
    intro:
      "This page describes the categories of information used to provide, secure, and improve the Atlas Market experience.",
    summary: [
      ["Coverage", "Account and platform data"],
      ["Purpose", "Operate, secure, and support"],
      ["Requests", "Available through support"],
    ],
    notice:
      "A privacy request should identify the account and the right being exercised without including passwords, recovery secrets, or unnecessary identity documents in the first message.",
    sections: [
      [
        "Information you provide",
        "Account details, contact information, identity verification materials, support correspondence, and information submitted during account or transaction workflows.",
      ],
      [
        "Platform and device information",
        "Technical and usage information such as device type, browser data, session records, security signals, and interactions with platform features.",
      ],
      [
        "How information is used",
        "To operate accounts, deliver products, process requests, maintain security, meet applicable obligations, provide support, and improve platform reliability.",
      ],
      [
        "Information sharing",
        "Information may be shared with service providers that support platform operations, security, verification, communications, and legal compliance, subject to appropriate controls.",
      ],
      [
        "Retention and security",
        "Information is retained according to operational and legal needs. Technical and organisational controls are used to protect information, though no system can guarantee absolute security.",
      ],
      [
        "Your choices",
        "Depending on applicable law, you may have rights relating to access, correction, deletion, restriction, or objection. Contact support to submit a privacy request.",
      ],
    ],
  },
  terms: {
    eyebrow: "Legal information",
    title: "Terms of use",
    intro:
      "These website terms describe the basic conditions for accessing Atlas Market public pages and account services.",
    summary: [
      ["Scope", "Website and account services"],
      ["Availability", "Eligibility dependent"],
      ["Market content", "May be illustrative"],
    ],
    notice:
      "Product-specific terms, live instrument conditions, and account notices may add to these general website terms. Review the information presented at the point of action.",
    sections: [
      [
        "Using the service",
        "You must provide accurate information, protect your account credentials, and use the platform only for lawful purposes and in accordance with applicable product conditions.",
      ],
      [
        "Product availability",
        "Products, instruments, features, and account access may vary by jurisdiction, eligibility, account status, and operational availability.",
      ],
      [
        "Market information",
        "Public website prices, charts, commentary, and examples may be delayed or illustrative. They are not an offer, recommendation, or guarantee of execution.",
      ],
      [
        "User responsibility",
        "You are responsible for evaluating each product, reviewing order details, monitoring open positions, and maintaining adequate account access and security.",
      ],
      [
        "Service availability",
        "The platform may be changed, suspended, or unavailable for maintenance, security, technical, market, or legal reasons.",
      ],
      [
        "Risk acknowledgement",
        "By using trading products, you acknowledge that markets involve risk and that losses can be substantial, particularly when leverage is involved.",
      ],
    ],
  },
};

const LegalPage = ({ type }: { type: "risk" | "privacy" | "terms" }) => {
  const copy = legalCopy[type];
  const image =
    type === "risk"
      ? "/atlas-risk-manager.jpg"
      : type === "privacy"
        ? "/atlas-security-operations.jpg"
        : "/atlas-market-team.jpg";
  const imageAlt =
    type === "risk"
      ? "Risk professional reviewing market exposure and scenario limits"
      : type === "privacy"
        ? "Security operations team reviewing controlled account activity"
        : "Operations team reviewing service standards and account conditions";
  return (
    <>
      <section className="border-b border-white/[0.07] bg-[#0b0c15] py-20 sm:py-24">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
              {copy.eyebrow}
            </p>
            <h1 className="mt-5 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-400">
              {copy.intro}
            </p>
            <p className="mt-5 text-[10px] text-slate-600">
              Last updated: 28 September 2026
            </p>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2">
            <img
              src={image}
              alt={imageAlt}
              className="aspect-[16/9] w-full rounded-xl object-cover"
            />
          </figure>
        </div>
      </section>
      <section className="border-b border-white/[0.07] bg-[#080910]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 divide-y divide-white/[0.07] px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8">
          {copy.summary.map(([label, value]) => (
            <div key={label} className="px-5 py-6">
              <p className="text-[9px] uppercase tracking-widest text-slate-600">
                {label}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-200">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="space-y-12">
            {copy.sections.map(([title, text], index) => (
              <article
                key={title}
                className="grid gap-4 border-b border-white/[0.07] pb-10 sm:grid-cols-[80px_1fr]"
              >
                <span className="text-[10px] font-semibold text-slate-700">
                  0{index + 1}
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    {title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    {text}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-12 rounded-xl border border-violet-400/15 bg-violet-400/[0.05] p-5 text-xs leading-6 text-slate-400">
            {copy.notice}
            <Link
              to="/support#contact"
              className="mt-4 flex items-center gap-2 font-semibold text-violet-300"
            >
              {type === "privacy"
                ? "Submit a privacy question"
                : type === "terms"
                  ? "Ask about account conditions"
                  : "Clarify product risk"}
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
};

const MarketingInfoPage = ({ kind }: { kind: MarketingPageKind }) => {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    window.setTimeout(
      () =>
        document
          .getElementById(location.hash.slice(1))
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }, [location.hash]);
  let content: ReactNode;
  if (kind === "platform") content = <PlatformPage />;
  else if (kind === "markets") content = <MarketsPage />;
  else if (kind === "fees") content = <FeesPage />;
  else if (kind === "security") content = <SecurityPage />;
  else if (kind === "company") content = <CompanyPage />;
  else if (kind === "support") content = <SupportPage />;
  else content = <LegalPage type={kind} />;
  return (
    <MarketingLayout>
      <main>{content}</main>
    </MarketingLayout>
  );
};

export default MarketingInfoPage;
