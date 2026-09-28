import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  HelpCircle,
  Headphones,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import BrandLogo from "../BrandLogo";

const navigation = [
  { label: "Products", to: "/products" },
  { label: "Platform", to: "/platform" },
  { label: "Markets", to: "/markets" },
  { label: "Pricing", to: "/fees" },
  { label: "Learn", to: "/learn" },
  { label: "Security", to: "/security" },
  { label: "Company", to: "/company" },
];

const footerGroups = [
  {
    title: "Products",
    links: [
      { label: "Crypto spot", to: "/products/spot" },
      { label: "Crypto futures", to: "/products/futures" },
      { label: "Global CFDs", to: "/products/cfds" },
      { label: "Staking", to: "/products/staking" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Learning centre", to: "/learn" },
      { label: "Trading basics", to: "/learn/trading-basics" },
      { label: "Risk management", to: "/learn/risk-management" },
      { label: "Order types", to: "/learn/order-types" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Overview", to: "/platform" },
      { label: "Trading tools", to: "/platform#workspace" },
      { label: "Fees", to: "/fees" },
      { label: "Security", to: "/security" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Atlas", to: "/company" },
      { label: "Our approach", to: "/company#approach" },
      { label: "Support centre", to: "/support" },
      { label: "Contact", to: "/support#contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Risk disclosure", to: "/legal/risk-disclosure" },
      { label: "Privacy policy", to: "/legal/privacy" },
      { label: "Terms of use", to: "/legal/terms" },
    ],
  },
];

export const MarketingHeader = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <>
      <div className="relative z-[60] border-b border-white/[0.06] bg-[#070810] text-[11px] text-slate-500">
        <div className="mx-auto flex h-8 max-w-[1380px] items-center justify-between px-5 sm:px-8">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            Systems operational
          </span>
          <div className="flex items-center gap-5">
            <Link
              to="/security"
              className="hidden items-center gap-1.5 transition hover:text-slate-300 sm:flex"
            >
              <ShieldCheck size={12} /> Security
            </Link>
            <Link
              to="/support"
              className="flex items-center gap-1.5 transition hover:text-slate-300"
            >
              <HelpCircle size={12} /> Support
            </Link>
          </div>
        </div>
      </div>
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#090a12]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1380px] items-center justify-between px-5 sm:px-8">
          <Link
            to="/"
            className="flex shrink-0 items-center"
            aria-label="Atlas Market home"
          >
            <BrandLogo className="h-11 w-[142px] object-contain object-left" />
          </Link>

          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Main navigation"
          >
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2.5 text-[13px] font-medium transition ${isActive ? "bg-white/[0.06] text-white" : "text-slate-400 hover:bg-white/[0.035] hover:text-white"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              to="/auth"
              className="rounded-lg px-4 py-2.5 text-[13px] font-semibold text-slate-300 transition hover:text-white"
            >
              Sign in
            </Link>
            <Link
              to="/auth/register"
              className="group flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-[13px] font-bold text-[#090a12] transition hover:bg-violet-100"
            >
              Open account
              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 md:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/[0.07] bg-[#090a12] px-5 pb-6 pt-4 md:hidden">
            <nav
              className="mx-auto flex max-w-[1380px] flex-col"
              aria-label="Mobile navigation"
            >
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="flex items-center justify-between border-b border-white/[0.06] py-3.5 text-sm font-medium text-slate-200"
                >
                  {item.label}
                  <ChevronDown
                    size={15}
                    className="-rotate-90 text-slate-600"
                  />
                </NavLink>
              ))}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Link
                  to="/auth"
                  className="rounded-lg border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  Sign in
                </Link>
                <Link
                  to="/auth/register"
                  className="rounded-lg bg-white px-4 py-3 text-center text-sm font-bold text-[#090a12]"
                >
                  Open account
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
};

export const MarketingFooter = () => (
  <footer className="border-t border-white/[0.07] bg-[#06070b]">
    <div className="mx-auto max-w-[1380px] px-5 pb-8 pt-16 sm:px-8 lg:pt-20">
      <div className="grid gap-12 border-b border-white/[0.08] pb-14 lg:grid-cols-[1.25fr_2fr]">
        <div className="max-w-sm">
          <BrandLogo className="h-12 w-[156px] object-contain object-left" />
          <p className="mt-6 text-sm leading-6 text-slate-500">
            A multi-market trading workspace designed for clear decisions,
            precise execution, and complete portfolio visibility.
          </p>
          <div className="mt-6 grid grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-4">
            {[
              ["Coverage", "Multi-asset"],
              ["Guides", "7 detailed"],
              ["Support", "Account-aware"],
            ].map(([label, value]) => (
              <div key={label} className="px-3 first:pl-0">
                <p className="text-[8px] uppercase tracking-widest text-slate-700">
                  {label}
                </p>
                <p className="mt-1.5 text-[10px] font-semibold text-slate-300">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <Link
            to="/support"
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
          >
            <Headphones size={16} className="text-violet-300" /> Visit support
            centre
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-x-7 gap-y-10 sm:grid-cols-5">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                {group.title}
              </h3>
              <ul className="mt-5 space-y-3.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-[13px] text-slate-500 transition hover:text-slate-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="py-8 text-[11px] leading-5 text-slate-600">
        <p>
          <strong className="font-semibold text-slate-500">
            Risk warning:
          </strong>{" "}
          Trading digital assets, derivatives, and leveraged products involves a
          high degree of risk and may result in losses exceeding the amount
          committed to a position. These products may not be suitable for every
          investor. Consider your objectives, experience, and risk tolerance
          before trading.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <strong className="block text-[9px] uppercase tracking-widest text-slate-500">
              Availability
            </strong>
            <span className="mt-1 block">
              Products and instruments depend on eligibility, account status,
              and jurisdiction.
            </span>
          </p>
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <strong className="block text-[9px] uppercase tracking-widest text-slate-500">
              Execution
            </strong>
            <span className="mt-1 block">
              Market conditions can affect spreads, liquidity, order fills, and
              displayed estimates.
            </span>
          </p>
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <strong className="block text-[9px] uppercase tracking-widest text-slate-500">
              Education
            </strong>
            <span className="mt-1 block">
              Public guides explain mechanics and do not provide personalised
              investment advice.
            </span>
          </p>
        </div>
        <div className="mt-7 flex flex-col gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Atlas Market. All rights reserved.</p>
          <p>
            Market data shown on public pages may be delayed or illustrative.
          </p>
        </div>
      </div>
    </div>
  </footer>
);

export const MarketingLayout = ({ children }: { children: ReactNode }) => (
  <div className="landing-page min-h-screen bg-[#090a12] text-white">
    <MarketingHeader />
    {children}
    <MarketingFooter />
  </div>
);
