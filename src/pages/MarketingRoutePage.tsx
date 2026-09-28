import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CircleDollarSign,
  Coins,
  Compass,
  Gauge,
  Globe2,
  Layers3,
  ListChecks,
  Scale,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { MarketingLayout } from "../components/marketing/MarketingChrome";

export type MarketingRouteKind =
  | "products"
  | "spot"
  | "futures"
  | "cfds"
  | "staking"
  | "learn"
  | "basics"
  | "risk-management"
  | "order-types";

type RouteCard = {
  icon: LucideIcon;
  image: string;
  imageAlt: string;
  title: string;
  eyebrow: string;
  text: string;
  to: string;
  facts: Array<{ label: string; value: string }>;
};

type DetailConfig = {
  family: "product" | "learning";
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  image: string;
  imageAlt: string;
  highlights: Array<{ label: string; value: string; detail: string }>;
  processEyebrow: string;
  sectionTitle: string;
  sectionText: string;
  steps: Array<{ title: string; text: string; outcome: string }>;
  anatomyEyebrow: string;
  anatomyTitle: string;
  anatomyText: string;
  anatomy: Array<{ label: string; value: string; detail: string }>;
  checklistTitle: string;
  checklistText: string;
  checklist: Array<{ title: string; text: string }>;
  cautionTitle: string;
  caution: string;
  nextEyebrow: string;
  nextTitle: string;
  nextText: string;
  nextLabel: string;
  nextTo: string;
};

const productCards: RouteCard[] = [
  {
    icon: Coins,
    image: "/atlas-portfolio-professional.jpg",
    imageAlt: "Investor reviewing the composition of a digital-asset portfolio",
    title: "Crypto spot",
    eyebrow: "Exchange the underlying asset",
    text: "Convert between supported digital assets, choose immediate or price-defined execution, and hold the resulting balance in your wallet.",
    to: "/products/spot",
    facts: [
      { label: "Exposure", value: "Asset ownership" },
      { label: "Direction", value: "Buy or sell" },
      { label: "Schedule", value: "24/7" },
    ],
  },
  {
    icon: BarChart3,
    image: "/atlas-futures-desk.jpg",
    imageAlt:
      "Derivatives trader monitoring futures positions and market depth",
    title: "Crypto futures",
    eyebrow: "Express a directional view",
    text: "Open long or short positions, select leverage deliberately, and monitor margin and liquidation estimates throughout the trade.",
    to: "/products/futures",
    facts: [
      { label: "Exposure", value: "Derivative" },
      { label: "Direction", value: "Long or short" },
      { label: "Core risk", value: "Liquidation" },
    ],
  },
  {
    icon: Globe2,
    image: "/atlas-market-analysts.jpg",
    imageAlt:
      "Market analysts comparing currency, metals, index, and equity research",
    title: "Global CFDs",
    eyebrow: "Access selected world markets",
    text: "Trade price movements in selected currencies, commodities, indices, and equities without taking ownership of the referenced asset.",
    to: "/products/cfds",
    facts: [
      { label: "Coverage", value: "Multi-asset" },
      { label: "Pricing", value: "Spread based" },
      { label: "Holding cost", value: "May apply" },
    ],
  },
  {
    icon: CircleDollarSign,
    image: "/atlas-staking-planning.jpg",
    imageAlt:
      "Long-term investor reviewing the schedule for an asset allocation",
    title: "Staking",
    eyebrow: "Allocate eligible holdings",
    text: "Compare durations, reward structures, and availability conditions before assigning supported assets to a defined plan.",
    to: "/products/staking",
    facts: [
      { label: "Purpose", value: "Asset rewards" },
      { label: "Access", value: "Term dependent" },
      { label: "Return", value: "Not guaranteed" },
    ],
  },
];

const learningCards: RouteCard[] = [
  {
    icon: BookOpen,
    image: "/atlas-trading-education.jpg",
    imageAlt:
      "Market educator explaining price formation and a written trading plan",
    title: "Trading basics",
    eyebrow: "Build the foundation",
    text: "Understand instruments, quotes, spreads, positions, profit and loss, and the questions worth answering before any order.",
    to: "/learn/trading-basics",
    facts: [
      { label: "Level", value: "Foundation" },
      { label: "Lessons", value: "4 stages" },
      { label: "Outcome", value: "Trade plan" },
    ],
  },
  {
    icon: ShieldCheck,
    image: "/atlas-risk-manager.jpg",
    imageAlt:
      "Risk manager comparing portfolio exposure with several market scenarios",
    title: "Risk management",
    eyebrow: "Set boundaries first",
    text: "Connect account risk, position size, leverage, correlation, and exit planning into one repeatable pre-trade process.",
    to: "/learn/risk-management",
    facts: [
      { label: "Level", value: "Essential" },
      { label: "Focus", value: "Loss control" },
      { label: "Scope", value: "Whole account" },
    ],
  },
  {
    icon: Layers3,
    image: "/atlas-trading-professional.jpg",
    imageAlt:
      "Trader reviewing execution choices and active orders across several screens",
    title: "Order types",
    eyebrow: "Understand execution",
    text: "Compare speed, price control, trigger behaviour, and fill uncertainty across market, limit, stop-loss, and take-profit instructions.",
    to: "/learn/order-types",
    facts: [
      { label: "Level", value: "Practical" },
      { label: "Orders", value: "4 explained" },
      { label: "Focus", value: "Execution" },
    ],
  },
];

const detailPages: Record<
  Exclude<MarketingRouteKind, "products" | "learn">,
  DetailConfig
> = {
  spot: {
    family: "product",
    eyebrow: "Atlas products · Crypto spot",
    title: "Direct access to digital assets.",
    description:
      "Buy and sell supported crypto assets through a transparent order workflow, then see the resulting holdings, cost context, and activity in the same portfolio.",
    icon: Coins,
    image: "/atlas-portfolio-professional.jpg",
    imageAlt: "Investor reviewing a digital-asset portfolio on a tablet",
    highlights: [
      {
        label: "Market schedule",
        value: "Continuous crypto access",
        detail: "Digital-asset markets generally operate throughout the week.",
      },
      {
        label: "Execution choices",
        value: "Market and limit orders",
        detail: "Prioritise immediate access or define an acceptable price.",
      },
      {
        label: "After execution",
        value: "Wallet balance updates",
        detail: "Completed exchanges flow into the unified portfolio record.",
      },
    ],
    processEyebrow: "Spot transaction flow",
    sectionTitle: "From quoted pair to owned balance.",
    sectionText:
      "A spot order exchanges one asset for another. The base asset is the item being bought or sold; the quote asset is the currency used to express its price.",
    steps: [
      {
        title: "Read the pair",
        text: "Confirm the base and quote assets, current bid and ask, recent range, and whether enough liquidity is available for the intended size.",
        outcome: "You know exactly what is being exchanged.",
      },
      {
        title: "Choose price behaviour",
        text: "A market order seeks an immediate fill at available prices. A limit order waits for your specified price or better and may not execute.",
        outcome: "The instruction matches your priority.",
      },
      {
        title: "Confirm the conversion",
        text: "Check the side, quantity, estimated value, quoted spread, and resulting wallet asset before submitting the order.",
        outcome: "The portfolio impact is understood.",
      },
      {
        title: "Reconcile the activity",
        text: "Review filled quantity, average execution price, applicable costs, and the updated transaction history.",
        outcome: "The final result is documented.",
      },
    ],
    anatomyEyebrow: "What changes the result",
    anatomyTitle: "Three variables behind a spot fill.",
    anatomyText:
      "The last traded price is only one piece of the outcome. Order size, available liquidity, and the chosen instruction determine the actual execution.",
    anatomy: [
      {
        label: "Spread",
        value: "Bid versus ask",
        detail:
          "The gap between available sell and buy prices is an immediate trading cost.",
      },
      {
        label: "Depth",
        value: "Orders at each price",
        detail:
          "A larger order may consume several price levels and produce a different average fill.",
      },
      {
        label: "Volatility",
        value: "Speed of price change",
        detail:
          "Fast movement can alter the available quote between review and execution.",
      },
    ],
    checklistTitle: "Before exchanging an asset",
    checklistText:
      "Use a short verification sequence to avoid preventable pair, size, and custody mistakes.",
    checklist: [
      {
        title: "Pair orientation",
        text: "Verify which asset you receive and which balance will be reduced.",
      },
      {
        title: "Order value",
        text: "Translate the quantity into account currency and compare it with the intended allocation.",
      },
      {
        title: "Storage context",
        text: "Understand how the acquired asset appears in the wallet and whether network actions are required later.",
      },
      {
        title: "Exit liquidity",
        text: "Consider whether the market can support the future size you may need to sell.",
      },
    ],
    cautionTitle: "Digital-asset ownership carries distinct risks",
    caution:
      "Prices can be highly volatile. Liquidity, network congestion, protocol events, custody arrangements, and changes in market confidence can affect value or access to an asset.",
    nextEyebrow: "Execution next",
    nextTitle: "Match the instruction to the price you are willing to accept.",
    nextText:
      "The order-types guide explains the trade-off between immediate execution and price control, including why a pending order may remain unfilled.",
    nextLabel: "Study order types",
    nextTo: "/learn/order-types",
  },
  futures: {
    family: "product",
    eyebrow: "Atlas products · Crypto futures",
    title: "Trade both sides of the market.",
    description:
      "Open long or short directional exposure with configurable leverage, visible margin requirements, liquidation context, and controls attached to the position.",
    icon: BarChart3,
    image: "/atlas-futures-desk.jpg",
    imageAlt: "Derivatives trader monitoring a fast-moving futures market",
    highlights: [
      {
        label: "Directional choice",
        value: "Long or short",
        detail:
          "Take a view on rising or falling prices without a standard spot purchase.",
      },
      {
        label: "Capital framework",
        value: "Margin based",
        detail:
          "Only part of the position value is posted, increasing sensitivity to price changes.",
      },
      {
        label: "Position controls",
        value: "Stop-loss and take-profit",
        detail: "Define conditional exit instructions at position level.",
      },
    ],
    processEyebrow: "Position lifecycle",
    sectionTitle: "Leverage changes every calculation.",
    sectionText:
      "A futures position creates derivative exposure whose notional value can exceed the margin committed. Position size, leverage, maintenance margin, and liquidation distance are inseparable.",
    steps: [
      {
        title: "Form a directional thesis",
        text: "Define why the market may rise or fall, which evidence would invalidate the view, and how long the idea should remain relevant.",
        outcome: "Direction is tied to a testable premise.",
      },
      {
        title: "Calculate notional exposure",
        text: "Translate contract quantity into full position value before evaluating the smaller margin figure shown on the ticket.",
        outcome: "Exposure is not mistaken for deposit size.",
      },
      {
        title: "Stress the liquidation distance",
        text: "Compare the estimate with normal volatility, planned stop placement, and the account’s remaining free margin.",
        outcome: "Forced-close risk is visible before entry.",
      },
      {
        title: "Manage funding and exits",
        text: "Monitor unrealised results, funding adjustments, margin health, and whether the original thesis still holds.",
        outcome: "The position is actively supervised.",
      },
    ],
    anatomyEyebrow: "Margin mechanics",
    anatomyTitle: "Read beyond the leverage multiplier.",
    anatomyText:
      "Selecting a leverage number is not a complete risk decision. Position value and adverse price distance determine how quickly account equity can change.",
    anatomy: [
      {
        label: "Initial margin",
        value: "Entry requirement",
        detail:
          "The amount required to establish the position under current conditions.",
      },
      {
        label: "Maintenance margin",
        value: "Minimum support",
        detail:
          "Falling below the required level can trigger a forced reduction or liquidation.",
      },
      {
        label: "Funding",
        value: "Periodic adjustment",
        detail:
          "Depending on the contract, longs or shorts may exchange payments while the position remains open.",
      },
    ],
    checklistTitle: "Pre-trade derivatives check",
    checklistText:
      "A futures ticket should be evaluated as a complete risk package, not simply as an entry price.",
    checklist: [
      {
        title: "Maximum planned loss",
        text: "Define a loss amount in account currency before selecting contract quantity.",
      },
      {
        title: "Margin mode",
        text: "Understand how the chosen mode can isolate risk or draw on wider account collateral.",
      },
      {
        title: "Event calendar",
        text: "Consider scheduled announcements and periods when gaps or volatility may increase.",
      },
      {
        title: "Exit dependency",
        text: "Confirm that the plan remains workable if slippage prevents an exact stop fill.",
      },
    ],
    cautionTitle: "Liquidation can happen faster than expected",
    caution:
      "Leveraged futures are high-risk products. Small adverse moves can cause substantial losses, and a position may be liquidated when margin no longer meets the platform requirement.",
    nextEyebrow: "Build the risk framework",
    nextTitle: "Size the loss before sizing the opportunity.",
    nextText:
      "Learn how account risk, correlated exposure, leverage, and exit planning combine into a repeatable decision process.",
    nextLabel: "Open the risk-management guide",
    nextTo: "/learn/risk-management",
  },
  cfds: {
    family: "product",
    eyebrow: "Atlas products · Global CFDs",
    title: "A broader view of global markets.",
    description:
      "Access selected currency pairs, commodities, indices, and equities through one interface while accounting for each market’s schedule and contract terms.",
    icon: Globe2,
    image: "/atlas-market-analysts.jpg",
    imageAlt: "Global markets analysts reviewing multi-asset research",
    highlights: [
      {
        label: "Asset coverage",
        value: "Selected global markets",
        detail:
          "Research forex, metals, indices, and equities from one account.",
      },
      {
        label: "Instrument type",
        value: "Price-difference contract",
        detail: "Gain exposure without owning the referenced underlying asset.",
      },
      {
        label: "Trading conditions",
        value: "Instrument specific",
        detail:
          "Sessions, spreads, contract sizes, and financing differ by market.",
      },
    ],
    processEyebrow: "Contract workflow",
    sectionTitle: "The symbol is only the starting point.",
    sectionText:
      "Each CFD refers to an underlying market but has its own specification. Trading hours, point value, minimum size, margin rate, and overnight treatment must be reviewed together.",
    steps: [
      {
        title: "Identify the underlying market",
        text: "Separate currencies from indices, commodities, or equities because their price drivers and active sessions differ.",
        outcome: "The instrument is placed in the right context.",
      },
      {
        title: "Read the contract specification",
        text: "Check point value, minimum quantity, margin rate, trading schedule, and the currency used for profit and loss.",
        outcome: "Contract size becomes an account-level number.",
      },
      {
        title: "Estimate holding cost",
        text: "Review the live spread and whether overnight financing or other adjustments may apply across the intended horizon.",
        outcome: "Time-dependent costs enter the plan.",
      },
      {
        title: "Monitor the relevant session",
        text: "Follow when the underlying market is active and note closures that can create gaps when trading resumes.",
        outcome: "Market structure informs management.",
      },
    ],
    anatomyEyebrow: "Cross-market differences",
    anatomyTitle: "One interface, distinct market structures.",
    anatomyText:
      "A position in EUR/USD does not behave like a gold, index, or single-stock contract. The drivers and operational details vary materially.",
    anatomy: [
      {
        label: "Currencies",
        value: "Relative economies",
        detail:
          "Rates, inflation expectations, and central-bank policy often shape the pair.",
      },
      {
        label: "Commodities",
        value: "Physical supply and demand",
        detail:
          "Inventory, production, transport, and geopolitical events may influence price.",
      },
      {
        label: "Indices and equities",
        value: "Business and market cycles",
        detail:
          "Earnings, sector concentration, dividends, and exchange sessions can matter.",
      },
    ],
    checklistTitle: "Before opening a CFD",
    checklistText:
      "Confirm the contract rather than relying on familiarity with the underlying market name.",
    checklist: [
      {
        title: "Session and holiday hours",
        text: "Know when the contract trades, pauses, and reopens in your local time.",
      },
      {
        title: "Point value",
        text: "Calculate how a one-point move changes profit or loss at the selected size.",
      },
      {
        title: "Financing horizon",
        text: "Estimate the effect of holding through one or several daily cut-offs.",
      },
      {
        title: "Currency conversion",
        text: "Check whether position results must be converted into the account currency.",
      },
    ],
    cautionTitle: "Market gaps and financing affect outcomes",
    caution:
      "CFDs are leveraged products. Spread changes, overnight charges, session gaps, currency conversion, and rapid movement in the underlying market can materially change a position’s result.",
    nextEyebrow: "Price the position",
    nextTitle: "Separate visible spread from time-dependent cost.",
    nextText:
      "The pricing page explains spreads, overnight financing, product charges, and the fields worth reviewing before confirmation.",
    nextLabel: "Review costs and conditions",
    nextTo: "/fees",
  },
  staking: {
    family: "product",
    eyebrow: "Atlas products · Staking",
    title: "Put eligible assets to work.",
    description:
      "Compare available durations and product terms, allocate a supported asset, and follow its status without separating it from the wider portfolio.",
    icon: CircleDollarSign,
    image: "/atlas-staking-planning.jpg",
    imageAlt: "Long-term investor reviewing an allocation schedule",
    highlights: [
      {
        label: "Plan information",
        value: "Term shown upfront",
        detail:
          "Review duration, minimum allocation, and availability before committing.",
      },
      {
        label: "Portfolio treatment",
        value: "Tracked with holdings",
        detail: "Active allocations remain visible beside liquid balances.",
      },
      {
        label: "Reward profile",
        value: "Product dependent",
        detail: "Rates, calculation methods, and payment timing can vary.",
      },
    ],
    processEyebrow: "Allocation lifecycle",
    sectionTitle: "Understand access before considering return.",
    sectionText:
      "Staking may exchange immediate liquidity for a reward opportunity. Compare rate together with term, redemption rules, asset volatility, and product mechanics.",
    steps: [
      {
        title: "Confirm asset eligibility",
        text: "Review whether the holding is supported, the minimum quantity, and any account or regional conditions.",
        outcome: "The allocation can be accepted under current terms.",
      },
      {
        title: "Compare reward structures",
        text: "Distinguish stated, estimated, fixed, or variable rates and identify how and when rewards are calculated.",
        outcome: "The displayed rate is interpreted correctly.",
      },
      {
        title: "Review access conditions",
        text: "Understand lock periods, early-redemption rules, processing times, and when principal becomes available again.",
        outcome: "Liquidity needs are matched to the term.",
      },
      {
        title: "Track completion",
        text: "Follow active amount, accrued reward information, maturity status, and the destination of returned assets.",
        outcome: "The allocation stays inside portfolio oversight.",
      },
    ],
    anatomyEyebrow: "Return context",
    anatomyTitle: "A rate never tells the whole story.",
    anatomyText:
      "The asset’s market value can move by more than the reward earned. Terms and protocol conditions also influence the practical result.",
    anatomy: [
      {
        label: "Reference rate",
        value: "Annualised expression",
        detail:
          "An annualised figure must be translated to the actual allocation period.",
      },
      {
        label: "Lock period",
        value: "Liquidity constraint",
        detail:
          "Committed assets may not be immediately available to sell or transfer.",
      },
      {
        label: "Asset price",
        value: "Principal volatility",
        detail:
          "Rewards do not insulate the underlying holding from market losses.",
      },
    ],
    checklistTitle: "Allocation suitability check",
    checklistText:
      "Treat a staking plan as a portfolio decision with liquidity and concentration consequences.",
    checklist: [
      {
        title: "Cash-flow needs",
        text: "Avoid committing assets that may be required before the plan permits access.",
      },
      {
        title: "Portfolio concentration",
        text: "Measure how the allocation changes exposure to the same underlying asset.",
      },
      {
        title: "Reward assumptions",
        text: "Check whether the displayed figure can change and what deductions may apply.",
      },
      {
        title: "Redemption process",
        text: "Know the steps and expected timing for principal and rewards to return.",
      },
    ],
    cautionTitle: "Rewards do not remove principal risk",
    caution:
      "Staking can involve lock-up, price, protocol, validator, counterparty, and operational risks. Access may be delayed, returns may change, and neither principal nor rewards are guaranteed.",
    nextEyebrow: "See it in context",
    nextTitle: "Place long-term allocations beside liquid exposure.",
    nextText:
      "Explore how the portfolio workspace separates available balance, open positions, and allocated assets without losing the total account view.",
    nextLabel: "See portfolio tools",
    nextTo: "/platform#staking",
  },
  basics: {
    family: "learning",
    eyebrow: "Atlas learn · Trading basics",
    title: "Understand the trade before placing it.",
    description:
      "A practical introduction to instruments, quoted prices, positions, profit and loss, and the information a complete trading idea should contain.",
    icon: BookOpen,
    image: "/atlas-trading-education.jpg",
    imageAlt: "Market educator explaining a written trading plan",
    highlights: [
      {
        label: "Starting point",
        value: "Instrument and quote",
        detail: "Understand what is traded and how its price is expressed.",
      },
      {
        label: "Core calculation",
        value: "Size and price movement",
        detail: "Connect quantity with potential profit or loss.",
      },
      {
        label: "Practical output",
        value: "Written trade plan",
        detail:
          "Record entry logic, invalidation, horizon, and exit conditions.",
      },
    ],
    processEyebrow: "Foundational sequence",
    sectionTitle: "Turn a market opinion into a defined plan.",
    sectionText:
      "“I think price will rise” is not yet a plan. A usable plan identifies the product, time horizon, evidence, acceptable loss, execution method, and closing conditions.",
    steps: [
      {
        title: "Name the instrument",
        text: "Determine whether the position involves ownership, a futures contract, a CFD, or a fixed-term allocation.",
        outcome: "Product mechanics are clear.",
      },
      {
        title: "Read both sides of the quote",
        text: "Compare bid and ask rather than focusing on one headline price, and note whether the market is open and active.",
        outcome: "Immediate cost and tradability are visible.",
      },
      {
        title: "Translate movement into money",
        text: "Calculate how the intended quantity responds to a realistic price change in favourable and adverse directions.",
        outcome: "Risk is expressed in account currency.",
      },
      {
        title: "Write the exit conditions",
        text: "Set thesis failure, profit objective, maximum holding period, and review points before market pressure begins.",
        outcome: "The decision has boundaries.",
      },
    ],
    anatomyEyebrow: "Vocabulary in practice",
    anatomyTitle: "Three terms every ticket assumes you know.",
    anatomyText:
      "Platform fields are concise because each term carries a specific meaning. Misreading one can change the direction or scale of the order.",
    anatomy: [
      {
        label: "Bid / ask",
        value: "Sell / buy quotes",
        detail:
          "The side used depends on whether you are entering or exiting and in which direction.",
      },
      {
        label: "Position size",
        value: "Economic quantity",
        detail:
          "Size determines how much a given price movement changes the position result.",
      },
      {
        label: "Unrealised P&L",
        value: "Open result",
        detail:
          "A changing estimate becomes realised only when the position is closed.",
      },
    ],
    checklistTitle: "The first-trade worksheet",
    checklistText:
      "Answer each question in plain language. If an answer is missing, the idea needs more work.",
    checklist: [
      {
        title: "What exactly am I trading?",
        text: "State the instrument, product type, and direction without abbreviations.",
      },
      {
        title: "Why now?",
        text: "Identify the observable evidence supporting entry at this moment.",
      },
      {
        title: "What proves me wrong?",
        text: "Choose an invalidation condition before calculating the order quantity.",
      },
      {
        title: "How will I close?",
        text: "Define price-based, time-based, and event-based exit conditions.",
      },
    ],
    cautionTitle: "Education cannot predict an outcome",
    caution:
      "Examples explain mechanics; they do not forecast prices or account for your circumstances. Educational material is not personalised investment, legal, or tax advice.",
    nextEyebrow: "Second lesson",
    nextTitle: "Give every idea an explicit loss boundary.",
    nextText:
      "Continue with position sizing, correlated exposure, leverage discipline, and scenario planning across the whole account.",
    nextLabel: "Continue to risk management",
    nextTo: "/learn/risk-management",
  },
  "risk-management": {
    family: "learning",
    eyebrow: "Atlas learn · Risk management",
    title: "Define risk before opportunity.",
    description:
      "Connect maximum planned loss, position sizing, leverage, exit execution, and portfolio correlation into a process that can be reviewed consistently.",
    icon: ShieldCheck,
    image: "/atlas-risk-manager.jpg",
    imageAlt: "Risk manager reviewing exposure and scenario planning",
    highlights: [
      {
        label: "Decision order",
        value: "Risk before size",
        detail: "Set the account-level loss limit before calculating quantity.",
      },
      {
        label: "Portfolio lens",
        value: "Combined exposure",
        detail: "Several positions may depend on the same market driver.",
      },
      {
        label: "Control limit",
        value: "Loss reduction, not removal",
        detail: "Stops and alerts cannot guarantee an exact execution price.",
      },
    ],
    processEyebrow: "Risk-planning cycle",
    sectionTitle: "Build from account tolerance to order size.",
    sectionText:
      "Risk management works from the outside in: total capital, tolerable loss, distance to invalidation, and only then position quantity.",
    steps: [
      {
        title: "Set an account-risk amount",
        text: "Choose the maximum planned loss for the idea as a currency amount that remains tolerable within the wider portfolio.",
        outcome: "The trade has a hard planning constraint.",
      },
      {
        title: "Locate thesis invalidation",
        text: "Use market structure or another defined condition rather than an arbitrary percentage to identify where the premise fails.",
        outcome: "Exit distance reflects the idea.",
      },
      {
        title: "Derive position quantity",
        text: "Calculate size from allowed loss and invalidation distance, then verify margin and notional exposure.",
        outcome: "Quantity follows risk rather than emotion.",
      },
      {
        title: "Review portfolio interaction",
        text: "Stress several positions together under adverse currency, equity, commodity, or crypto scenarios.",
        outcome: "Hidden concentration becomes visible.",
      },
    ],
    anatomyEyebrow: "Portfolio risk map",
    anatomyTitle: "Look for risk repeated under different symbols.",
    anatomyText:
      "Diversification by instrument name can be misleading. Positions may react to one interest-rate decision, liquidity shock, or broad risk-off move.",
    anatomy: [
      {
        label: "Correlation",
        value: "Shared price behaviour",
        detail:
          "Two positions can rise and decline together even when they belong to different categories.",
      },
      {
        label: "Concentration",
        value: "One dominant driver",
        detail:
          "Several individually small trades may form one large combined exposure.",
      },
      {
        label: "Gap risk",
        value: "Price jumps between levels",
        detail:
          "Execution may occur beyond a stop when no tradable price is available in between.",
      },
    ],
    checklistTitle: "Daily exposure review",
    checklistText:
      "Risk changes after entry. Recheck the account when volatility, correlation, or available margin changes.",
    checklist: [
      {
        title: "Aggregate downside",
        text: "Estimate the combined result if every planned stop is reached.",
      },
      {
        title: "Margin buffer",
        text: "Keep enough free margin for ordinary movement and avoid relying on an exact liquidation estimate.",
      },
      {
        title: "Event overlap",
        text: "Flag positions exposed to the same announcement or market session.",
      },
      {
        title: "Behavioural trigger",
        text: "Predetermine when trading pauses after a loss or a break from the plan.",
      },
    ],
    cautionTitle: "Controls can fail to execute as expected",
    caution:
      "Stop-loss orders may fill at a worse price during gaps, volatility, or limited liquidity. Margin estimates can change, and diversification cannot prevent broad market losses.",
    nextEyebrow: "Apply the framework",
    nextTitle: "Choose an order whose behaviour matches the plan.",
    nextText:
      "Compare immediate execution, resting price instructions, and conditional exits—including what each instruction cannot guarantee.",
    nextLabel: "Continue to order types",
    nextTo: "/learn/order-types",
  },
  "order-types": {
    family: "learning",
    eyebrow: "Atlas learn · Order types",
    title: "Choose how the order reaches the market.",
    description:
      "Understand the trade-off between execution speed, price control, trigger conditions, partial fills, and the uncertainty that remains after submission.",
    icon: Layers3,
    image: "/atlas-trading-professional.jpg",
    imageAlt: "Trader reviewing order execution on multiple screens",
    highlights: [
      {
        label: "Market instruction",
        value: "Execution priority",
        detail:
          "Seeks available liquidity without guaranteeing one exact fill price.",
      },
      {
        label: "Limit instruction",
        value: "Price boundary",
        detail:
          "Will not cross the chosen limit but may remain pending or fill partially.",
      },
      {
        label: "Conditional exits",
        value: "Trigger dependent",
        detail:
          "Become active only after a specified market condition is observed.",
      },
    ],
    processEyebrow: "Instruction behaviour",
    sectionTitle: "Every order exchanges one certainty for another.",
    sectionText:
      "A trader can prioritise speed or set a price boundary, but cannot guarantee both in every market. Conditional orders add structure while remaining subject to gaps and liquidity.",
    steps: [
      {
        title: "Market order",
        text: "Use when entering or exiting promptly matters more than controlling the exact average price across available liquidity.",
        outcome: "Execution is prioritised; final price can vary.",
      },
      {
        title: "Limit order",
        text: "Specify the worst acceptable price. The order can wait, fill in parts, or expire without any execution.",
        outcome: "Price is bounded; completion is uncertain.",
      },
      {
        title: "Stop-loss instruction",
        text: "Set a trigger intended to reduce further loss after the market reaches a defined level; the resulting fill can slip.",
        outcome: "Exit is automated; exact loss is not guaranteed.",
      },
      {
        title: "Take-profit instruction",
        text: "Define a favourable level for closing some or all of a position while gaps and partial fills can still occur.",
        outcome: "Profit-taking is planned in advance.",
      },
    ],
    anatomyEyebrow: "Order status guide",
    anatomyTitle: "Submission is not the same as completion.",
    anatomyText:
      "Follow the order record through its lifecycle. A pending, partially filled, cancelled, rejected, and completed order each has a different portfolio effect.",
    anatomy: [
      {
        label: "Open",
        value: "Waiting in the market",
        detail:
          "The conditions for full execution have not yet been satisfied.",
      },
      {
        label: "Partially filled",
        value: "Some quantity completed",
        detail:
          "The remaining amount may continue to wait at the specified condition.",
      },
      {
        label: "Filled",
        value: "Execution complete",
        detail:
          "Review average price and resulting exposure rather than the requested price alone.",
      },
    ],
    checklistTitle: "Order-ticket verification",
    checklistText:
      "Small input mistakes can create materially different exposure. Pause on the confirmation screen.",
    checklist: [
      {
        title: "Side and position effect",
        text: "Confirm whether the instruction opens, adds to, reduces, or closes exposure.",
      },
      {
        title: "Quantity and units",
        text: "Check whether size is expressed in assets, contracts, lots, or account currency.",
      },
      {
        title: "Time in force",
        text: "Understand when a pending instruction expires or remains active.",
      },
      {
        title: "Attached-order quantity",
        text: "Make sure protective instructions cover the intended amount after partial fills or changes.",
      },
    ],
    cautionTitle: "No order type guarantees a perfect fill",
    caution:
      "Slippage, spread changes, gaps, insufficient liquidity, rejected instructions, and technical interruption can affect execution. A limit controls price but cannot guarantee participation.",
    nextEyebrow: "Choose a market",
    nextTitle: "See how execution changes across product types.",
    nextText:
      "Compare underlying-asset exchange, leveraged derivatives, multi-asset contracts, and fixed-term allocations before choosing a route.",
    nextLabel: "Compare all products",
    nextTo: "/products",
  },
};

const overviewComparison = [
  {
    name: "Crypto spot",
    relationship: "Own the exchanged asset",
    direction: "Buy or sell holdings",
    cost: "Spread; possible network costs",
    primaryRisk: "Asset volatility and liquidity",
  },
  {
    name: "Crypto futures",
    relationship: "Derivative contract",
    direction: "Long or short",
    cost: "Spread and possible funding",
    primaryRisk: "Leverage and liquidation",
  },
  {
    name: "Global CFDs",
    relationship: "Contract on price movement",
    direction: "Long or short",
    cost: "Spread and overnight financing",
    primaryRisk: "Leverage, gaps, and holding cost",
  },
  {
    name: "Staking",
    relationship: "Term allocation",
    direction: "Hold eligible assets",
    cost: "Product-specific terms",
    primaryRisk: "Lock-up and asset-price movement",
  },
];

const OverviewHero = ({ learn = false }: { learn?: boolean }) => (
  <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20 sm:py-28">
    <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_12%,rgba(124,58,237,.16),transparent_30%),radial-gradient(circle_at_84%_8%,rgba(37,99,235,.1),transparent_25%),linear-gradient(180deg,#0c0d18,#090a12)]" />
    <div className="landing-grid absolute inset-0 -z-10 opacity-25" />
    <div className="mx-auto grid max-w-[1380px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr]">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
          {learn ? "Atlas learning centre" : "Atlas product directory"}
        </p>
        <h1 className="mt-5 max-w-4xl text-5xl font-medium leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-[72px]">
          {learn
            ? "Build knowledge before exposure."
            : "Choose how you access the market."}
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-8 text-slate-400">
          {learn
            ? "Work through market structure, risk planning, and execution behaviour in a practical sequence designed to improve the questions you ask before trading."
            : "Compare ownership, derivative exposure, global market contracts, and longer-term allocations by mechanics, cost structure, liquidity, and risk—not by headline alone."}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            to={learn ? "/learn/trading-basics" : "/products/spot"}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-bold text-[#090a12] hover:bg-violet-100"
          >
            {learn ? "Start with the basics" : "Explore spot trading"}{" "}
            <ArrowRight size={15} />
          </Link>
          <Link
            to={learn ? "/learn/risk-management" : "/legal/risk-disclosure"}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-6 py-3.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.04]"
          >
            {learn ? "Go to risk management" : "Understand the risks"}
          </Link>
        </div>
      </div>
      <figure className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2 shadow-[0_30px_80px_rgba(0,0,0,.38)]">
        <img
          src={
            learn
              ? "/atlas-trading-education.jpg"
              : "/atlas-products-overview.jpg"
          }
          alt={
            learn
              ? "Market educator discussing a written trading plan"
              : "Professional comparing several market products"
          }
          className="aspect-[16/10] w-full rounded-xl object-cover"
        />
      </figure>
    </div>
  </section>
);

const CardGrid = ({
  cards,
  learn = false,
}: {
  cards: RouteCard[];
  learn?: boolean;
}) => (
  <section className="py-24 sm:py-28">
    <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
      <div className="mb-12 max-w-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
          {learn ? "Structured learning paths" : "Product specifications"}
        </p>
        <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
          {learn
            ? "One concept at a time, in the right order."
            : "Start with how the product actually works."}
        </h2>
        <p className="mt-5 text-sm leading-7 text-slate-500">
          {learn
            ? "Each guide ends with a practical checklist and connects to the concept that should follow."
            : "Every route explains exposure, order flow, operational terms, relevant costs, and the risks that deserve attention before use."}
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {cards.map(
          ({
            icon: Icon,
            image,
            imageAlt,
            title,
            eyebrow,
            text,
            to,
            facts,
          }) => (
            <Link
              key={title}
              to={to}
              className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0e16] transition hover:-translate-y-1 hover:border-violet-400/25 hover:bg-[#10121c]"
            >
              <div className="relative aspect-[16/8] overflow-hidden">
                <img
                  src={image}
                  alt={imageAlt}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e16] via-transparent to-transparent" />
                <span className="absolute bottom-4 left-5 grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-[#0b0d15]/80 text-violet-200 backdrop-blur">
                  <Icon size={19} />
                </span>
                <ArrowUpRight
                  size={17}
                  className="absolute right-5 top-5 text-white/60 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
                />
              </div>
              <div className="p-7 sm:p-8">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  {eyebrow}
                </p>
                <h2 className="mt-2 text-xl font-semibold">{title}</h2>
                <p className="mt-3 max-w-lg text-xs leading-6 text-slate-500">
                  {text}
                </p>
                <div className="mt-6 grid grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-4">
                  {facts.map((fact) => (
                    <div key={fact.label} className="px-3 first:pl-0 last:pr-0">
                      <p className="text-[8px] uppercase tracking-wider text-slate-700">
                        {fact.label}
                      </p>
                      <p className="mt-1.5 text-[10px] font-semibold text-slate-300">
                        {fact.value}
                      </p>
                    </div>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-violet-300">
                  Open detailed guide{" "}
                  <ArrowRight
                    size={13}
                    className="transition group-hover:translate-x-1"
                  />
                </span>
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  </section>
);

const ProductComparison = () => (
  <section className="border-y border-white/[0.07] bg-[#080910] py-24">
    <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
      <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
            Side-by-side
          </p>
          <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
            Different exposure. Different obligations.
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-500">
          The same market opinion can produce very different account behaviour
          depending on whether you own an asset, use leverage, hold through a
          financing cut-off, or commit assets for a term.
        </p>
      </div>
      <div className="mt-12 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0c0e16]">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[.8fr_1.1fr_1fr_1.2fr_1.2fr] border-b border-white/[0.07] bg-white/[0.02] px-6 py-4 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
            <span>Route</span>
            <span>Relationship</span>
            <span>Direction</span>
            <span>Cost context</span>
            <span>Primary risk</span>
          </div>
          {overviewComparison.map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[.8fr_1.1fr_1fr_1.2fr_1.2fr] border-b border-white/[0.06] px-6 py-5 text-xs last:border-0"
            >
              <span className="font-semibold text-white">{row.name}</span>
              <span className="text-slate-400">{row.relationship}</span>
              <span className="text-slate-400">{row.direction}</span>
              <span className="text-slate-500">{row.cost}</span>
              <span className="text-slate-500">{row.primaryRisk}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const LearningSequence = () => (
  <section className="border-y border-white/[0.07] bg-[#080910] py-24">
    <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
      <div className="grid gap-14 lg:grid-cols-[.72fr_1.28fr] lg:gap-24">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
            Recommended sequence
          </p>
          <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
            Mechanics, boundaries, execution.
          </h2>
          <p className="mt-5 text-sm leading-7 text-slate-500">
            The curriculum moves from understanding what a trade is, to defining
            what the account can risk, to choosing how an instruction should
            behave in the market.
          </p>
        </div>
        <div className="space-y-3">
          {[
            {
              number: "01",
              title: "Build the vocabulary",
              text: "Identify the instrument, read both sides of a quote, and translate price movement into account impact.",
              to: "/learn/trading-basics",
            },
            {
              number: "02",
              title: "Set the loss boundary",
              text: "Calculate position quantity from planned loss, then test correlation and free-margin resilience.",
              to: "/learn/risk-management",
            },
            {
              number: "03",
              title: "Choose the instruction",
              text: "Balance execution speed against price control and understand every possible order status.",
              to: "/learn/order-types",
            },
          ].map((item) => (
            <Link
              to={item.to}
              key={item.number}
              className="group grid gap-4 rounded-xl border border-white/[0.08] bg-[#0c0e16] p-5 transition hover:border-violet-400/25 sm:grid-cols-[48px_1fr_auto] sm:items-center"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-400/[0.08] text-[9px] font-semibold text-violet-300">
                {item.number}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {item.text}
                </p>
              </div>
              <ArrowRight
                size={15}
                className="hidden text-slate-600 transition group-hover:translate-x-1 group-hover:text-violet-300 sm:block"
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const DetailPage = ({ config }: { config: DetailConfig }) => {
  const Icon = config.icon;
  const isLearning = config.family === "learning";
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20 sm:py-28">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_12%,rgba(124,58,237,.16),transparent_30%),linear-gradient(180deg,#0c0d18,#090a12)]" />
        <div className="landing-grid absolute inset-0 -z-10 opacity-25" />
        <div className="mx-auto grid max-w-[1380px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_.85fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
              {config.eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-medium leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-[68px]">
              {config.title}
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-400">
              {config.description}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to={isLearning ? "/learn" : "/auth/register"}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-bold text-[#090a12] hover:bg-violet-100"
              >
                {isLearning ? "Learning centre" : "Open an account"}{" "}
                <ArrowRight size={15} />
              </Link>
              <Link
                to={isLearning ? "/legal/risk-disclosure" : "/products"}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-6 py-3.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.04]"
              >
                {isLearning ? "Read risk disclosure" : "Compare products"}
              </Link>
            </div>
          </div>
          <figure className="group relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0e16] p-2 shadow-[0_32px_90px_rgba(0,0,0,.4)]">
            <img
              src={config.image}
              alt={config.imageAlt}
              className="aspect-[4/3] w-full rounded-xl object-cover transition duration-700 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-2 rounded-xl bg-gradient-to-t from-[#080910]/70 via-transparent to-transparent" />
            <span className="absolute bottom-6 left-6 grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-[#0b0d15]/80 text-violet-200 backdrop-blur">
              <Icon size={19} />
            </span>
          </figure>
        </div>
      </section>

      <section className="border-b border-white/[0.07] bg-[#080910]">
        <div className="mx-auto grid max-w-[1380px] grid-cols-1 divide-y divide-white/[0.07] px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8">
          {config.highlights.map((item) => (
            <div key={item.label} className="px-4 py-7 sm:px-6">
              <p className="text-[9px] uppercase tracking-widest text-slate-600">
                {item.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-200">
                {item.value}
              </p>
              <p className="mt-2 text-[10px] leading-5 text-slate-600">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24 sm:py-28">
        <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-[.76fr_1.24fr] lg:gap-24">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
              {config.processEyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
              {config.sectionTitle}
            </h2>
            <p className="mt-5 text-sm leading-7 text-slate-500">
              {config.sectionText}
            </p>
          </div>
          <div className="space-y-3">
            {config.steps.map((step, index) => (
              <article
                key={step.title}
                className="grid gap-4 rounded-xl border border-white/[0.08] bg-[#0c0e16] p-5 sm:grid-cols-[42px_1fr]"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-400/[0.08] text-[9px] font-semibold text-violet-300">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    {step.text}
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-[10px] font-medium text-emerald-400/80">
                    <Check size={12} />
                    {step.outcome}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.07] bg-[#080910] py-24">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                {config.anatomyEyebrow}
              </p>
              <h2 className="mt-4 text-3xl font-medium tracking-[-0.04em] sm:text-5xl">
                {config.anatomyTitle}
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-slate-500">
              {config.anatomyText}
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {config.anatomy.map((item, index) => (
              <article
                key={item.label}
                className="rounded-2xl border border-white/[0.08] bg-[#0c0e16] p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-400/[0.08] text-violet-300">
                    {index === 0 ? (
                      <Compass size={16} />
                    ) : index === 1 ? (
                      <Scale size={16} />
                    ) : (
                      <Gauge size={16} />
                    )}
                  </span>
                  <span className="text-[9px] font-semibold text-slate-700">
                    0{index + 1}
                  </span>
                </div>
                <p className="mt-6 text-[9px] uppercase tracking-widest text-slate-600">
                  {item.label}
                </p>
                <h3 className="mt-2 text-base font-semibold text-slate-200">
                  {item.value}
                </h3>
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-[1380px] gap-14 px-5 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-24">
          <div>
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-violet-400/15 bg-violet-400/[0.08] text-violet-300">
              <ListChecks size={19} />
            </span>
            <h2 className="mt-6 text-3xl font-medium tracking-[-0.04em] sm:text-4xl">
              {config.checklistTitle}
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-slate-500">
              {config.checklistText}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {config.checklist.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-white/[0.08] bg-[#0c0e16] p-5"
              >
                <Check size={14} className="text-emerald-400" />
                <h3 className="mt-4 text-sm font-semibold text-slate-200">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.07] bg-[#080910] py-20">
        <div className="mx-auto grid max-w-[1380px] items-center gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_auto]">
          <div className="flex max-w-4xl gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-400/15 bg-amber-400/[0.05] text-amber-300">
              <Target size={17} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                {config.cautionTitle}
              </h2>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {config.caution}
              </p>
            </div>
          </div>
          <Link
            to="/legal/risk-disclosure"
            className="inline-flex items-center gap-2 text-xs font-semibold text-violet-300"
          >
            Read the full disclosure <ArrowUpRight size={13} />
          </Link>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-[1380px] gap-7 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">
              {config.nextEyebrow}
            </p>
            <h2 className="mt-3 max-w-3xl text-2xl font-medium tracking-tight sm:text-3xl">
              {config.nextTitle}
            </h2>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-slate-500">
              {config.nextText}
            </p>
          </div>
          <Link
            to={config.nextTo}
            className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white"
          >
            {config.nextLabel}
            <ArrowRight
              size={15}
              className="transition group-hover:translate-x-1"
            />
          </Link>
        </div>
      </section>
    </>
  );
};

const MarketingRoutePage = ({ kind }: { kind: MarketingRouteKind }) => {
  let content;
  if (kind === "products")
    content = (
      <>
        <OverviewHero />
        <CardGrid cards={productCards} />
        <ProductComparison />
      </>
    );
  else if (kind === "learn")
    content = (
      <>
        <OverviewHero learn />
        <CardGrid cards={learningCards} learn />
        <LearningSequence />
      </>
    );
  else content = <DetailPage config={detailPages[kind]} />;
  return (
    <MarketingLayout>
      <main>{content}</main>
    </MarketingLayout>
  );
};

export default MarketingRoutePage;
