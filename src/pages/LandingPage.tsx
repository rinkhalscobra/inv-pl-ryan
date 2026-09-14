import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Compass,
  Globe2,
  Layers3,
  LineChart,
  LockKeyhole,
  Menu,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  WalletCards,
  X,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';

const features = [
  {
    icon: LineChart,
    title: 'Trade with clarity',
    description: 'Move from market discovery to execution with focused charts, order tools, and a clean workspace.',
    accent: 'from-sky-400 to-blue-500',
  },
  {
    icon: Layers3,
    title: 'One connected portfolio',
    description: 'Track your assets, positions, staking activity, and transaction history from one streamlined view.',
    accent: 'from-violet-400 to-fuchsia-500',
  },
  {
    icon: Bot,
    title: 'Smarter automation',
    description: 'Explore built-in strategy tools designed to make complex workflows easier to understand and manage.',
    accent: 'from-cyan-400 to-teal-500',
  },
];

const productPills = [
  { icon: BarChart3, label: 'Spot & futures' },
  { icon: Globe2, label: 'Global markets' },
  { icon: WalletCards, label: 'Portfolio wallet' },
  { icon: CircleDollarSign, label: 'Staking' },
];

const steps = [
  {
    icon: UserRoundCheck,
    number: '01',
    title: 'Create your account',
    description: 'Set up your secure account and complete the required verification steps.',
  },
  {
    icon: Compass,
    number: '02',
    title: 'Explore the markets',
    description: 'Build your watchlist, review live market information, and find opportunities.',
  },
  {
    icon: ScanSearch,
    number: '03',
    title: 'Make informed moves',
    description: 'Use focused trading tools and track every position from your dashboard.',
  },
];

const faqs = [
  {
    question: 'What can I access on Atlas Market?',
    answer: 'Atlas Market brings market discovery, crypto and leveraged trading tools, portfolio tracking, staking, and account activity into one connected experience.',
  },
  {
    question: 'Do I need trading experience to get started?',
    answer: 'The platform is designed to be clear for different experience levels, but every market carries risk. Take time to understand each product before placing a trade.',
  },
  {
    question: 'How is my account protected?',
    answer: 'Atlas Market uses encrypted connections, account verification workflows, and transparent activity records to help you maintain control of your account.',
  },
  {
    question: 'Can I review my whole portfolio in one place?',
    answer: 'Yes. Your dashboard brings balances, assets, open positions, staking activity, and transaction history into a unified portfolio view.',
  },
];

const LandingPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const landingHashes = ['#top', '#platform', '#markets', '#how-it-works', '#security'];
    if (landingHashes.includes(window.location.hash)) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const scrollToSection = (sectionId: string) => {
    if (sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setMenuOpen(false);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  };

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-[#070812] text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#070812]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <button type="button" onClick={() => scrollToSection('top')} className="flex items-center" aria-label="Atlas Market home">
            <BrandLogo className="h-12 w-40 object-contain object-left sm:w-44" />
          </button>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 md:flex" aria-label="Main navigation">
            <button type="button" onClick={() => scrollToSection('platform')} className="transition-colors hover:text-white">Platform</button>
            <button type="button" onClick={() => scrollToSection('markets')} className="transition-colors hover:text-white">Markets</button>
            <button type="button" onClick={() => scrollToSection('how-it-works')} className="transition-colors hover:text-white">How it works</button>
            <button type="button" onClick={() => scrollToSection('security')} className="transition-colors hover:text-white">Security</button>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link to="/auth" className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:text-white">
              Sign in
            </Link>
            <Link
              to="/auth/register"
              className="group flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#090a13] transition hover:bg-violet-100"
            >
              Create account
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-200 md:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/[0.07] bg-[#090a15] px-5 py-5 md:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 text-sm text-slate-200" aria-label="Mobile navigation">
              {[
                { label: 'Platform', sectionId: 'platform' },
                { label: 'Markets', sectionId: 'markets' },
                { label: 'How it works', sectionId: 'how-it-works' },
                { label: 'Security', sectionId: 'security' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => scrollToSection(item.sectionId)}
                  className="rounded-xl px-4 py-3 text-left hover:bg-white/5"
                >
                  {item.label}
                </button>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <Link to="/auth" className="rounded-xl border border-white/10 px-4 py-3 text-center font-semibold">Sign in</Link>
                <Link to="/auth/register" className="rounded-xl bg-white px-4 py-3 text-center font-bold text-[#090a13]">Get started</Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="top">
        <section className="relative isolate min-h-[920px] overflow-hidden pb-24 pt-36 sm:pt-44 lg:min-h-[860px] lg:pb-28">
          <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_16%,rgba(124,58,237,0.18),transparent_28%),radial-gradient(circle_at_82%_28%,rgba(14,165,233,0.14),transparent_30%),linear-gradient(180deg,#070812_0%,#0a0a18_62%,#070812_100%)]" />
          <div className="landing-grid pointer-events-none absolute inset-0 -z-10 opacity-30" />
          <div className="landing-glow landing-glow-one" />
          <div className="landing-glow landing-glow-two" />

          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
            <div className="relative z-10 mx-auto w-full min-w-0 max-w-2xl text-center lg:mx-0 lg:text-left">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                <Sparkles size={14} />
                Your market. Your move.
              </div>
              <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-[76px]">
                Markets move fast.
                <span className="mt-2 block bg-gradient-to-r from-[#bd8cff] via-[#8b7bff] to-[#57c7ff] bg-clip-text text-transparent">
                  Stay ahead.
                </span>
              </h1>
              <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg lg:mx-0">
                Discover, trade, and manage digital assets from one refined workspace built to keep every decision in focus.
              </p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
                <Link
                  to="/auth/register"
                  className="group flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 px-7 py-4 text-sm font-bold shadow-[0_18px_50px_rgba(124,58,237,0.28)] transition hover:brightness-110"
                >
                  Start exploring
                  <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <button type="button" onClick={() => scrollToSection('platform')} className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-7 py-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]">
                  See the platform
                  <ChevronDown size={16} />
                </button>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-slate-500 lg:justify-start">
                <span className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> No setup fees</span>
                <span className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Unified dashboard</span>
                <span className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> 24/7 market access</span>
              </div>
            </div>

            <div className="relative mx-auto w-full min-w-0 max-w-[680px] lg:translate-x-8">
              <figure className="landing-dashboard group relative rounded-[30px] border border-white/10 bg-[#101223] p-2 shadow-[0_45px_120px_rgba(0,0,0,0.48)] sm:p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[22px]">
                  <img
                    src="/atlas-trading-professional.jpg"
                    alt="Financial markets professional reviewing charts in a contemporary office"
                    className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.025]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080914]/85 via-transparent to-[#080914]/15" />
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-[#090a14]/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md sm:left-6 sm:top-6">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Global market access
                  </div>
                  <figcaption className="absolute bottom-5 left-5 right-5 sm:bottom-7 sm:left-7 sm:right-7">
                    <p className="text-lg font-semibold tracking-tight text-white sm:text-xl">A professional workspace for focused decisions.</p>
                    <p className="mt-1 text-xs text-slate-300 sm:text-sm">Research · Execute · Monitor</p>
                  </figcaption>
                </div>
                <div className="absolute -bottom-5 -right-4 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#15172a]/95 px-4 py-3 shadow-2xl backdrop-blur-xl sm:flex">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><ShieldCheck size={18} /></span>
                  <div><p className="text-[10px] text-slate-500">Built around control</p><p className="text-xs font-semibold text-white">Your account, clearly managed</p></div>
                </div>
              </figure>
              </div>
          </div>
        </section>

        <section id="markets" className="border-y border-white/[0.07] bg-white/[0.018]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/[0.07] px-5 sm:px-8 md:grid-cols-4 md:divide-y-0">
            {productPills.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center justify-center gap-3 px-3 py-6 text-sm font-medium text-slate-400">
                <Icon size={18} className="text-violet-300" />
                {label}
              </div>
            ))}
          </div>
        </section>

        <section className="relative py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            <figure className="relative overflow-hidden rounded-[30px] border border-white/[0.09] bg-white/[0.03] p-2 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
              <img
                src="/atlas-market-team.jpg"
                alt="Investment professionals discussing global market research"
                className="aspect-[4/3] w-full rounded-[22px] object-cover"
                loading="lazy"
              />
              <figcaption className="absolute bottom-5 left-5 rounded-xl border border-white/15 bg-[#090a14]/75 px-4 py-3 text-xs font-medium text-white backdrop-blur-md sm:bottom-7 sm:left-7">
                Decisions backed by a broader view
              </figcaption>
            </figure>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">See the whole market</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">One perspective.<br />More possibilities.</h2>
              <p className="mt-6 max-w-xl leading-7 text-slate-400">Move between markets without losing sight of your wider portfolio. Atlas Market keeps research, execution, and account activity connected.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {['Crypto spot markets', 'Leveraged futures', 'Global CFD instruments', 'Staking and automation'].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-4 text-sm text-slate-300">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-400/10 text-violet-300"><Check size={14} /></span>
                    {item}
                  </div>
                ))}
              </div>
              <Link to="/auth/register" className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-300 transition hover:text-violet-200">
                Explore with Atlas
                <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </section>

        <section id="platform" className="relative py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">Built around your decisions</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Everything you need.<br />Nothing in the way.</h2>
              <p className="mt-5 max-w-xl leading-7 text-slate-400">A modern market experience that brings powerful tools into one calm, connected workspace.</p>
            </div>

            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, description, accent }, index) => (
                <article key={title} className="group relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-7 transition duration-300 hover:-translate-y-1 hover:border-violet-400/25 hover:bg-white/[0.04] sm:p-8">
                  <div className={`absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${accent} opacity-[0.08] blur-3xl transition-opacity group-hover:opacity-[0.16]`} />
                  <div className="flex items-center justify-between">
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}><Icon size={21} /></span>
                    <span className="text-xs font-medium text-slate-700">0{index + 1}</span>
                  </div>
                  <h3 className="mt-10 text-xl font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-white/[0.07] bg-white/[0.018] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">A clear way forward</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">From account to action.</h2>
              <p className="mt-5 leading-7 text-slate-400">Start with a simple, guided path and keep control at every step.</p>
            </div>
            <div className="relative mt-14 grid gap-5 lg:grid-cols-3">
              <div className="absolute left-[16%] right-[16%] top-7 hidden h-px bg-gradient-to-r from-transparent via-violet-400/30 to-transparent lg:block" />
              {steps.map(({ icon: Icon, number, title, description }) => (
                <article key={number} className="relative rounded-[26px] border border-white/[0.08] bg-[#0b0c17] p-7 text-center sm:p-8">
                  <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-200 shadow-[0_0_0_8px_#0b0c17]"><Icon size={22} /></span>
                  <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Step {number}</p>
                  <h3 className="mt-3 text-xl font-semibold text-white">{title}</h3>
                  <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-gradient-to-br from-[#121426] via-[#0d0f1e] to-[#141027] px-6 py-14 sm:px-12 lg:px-16 lg:py-20">
              <div className="absolute right-[-8%] top-[-30%] h-80 w-80 rounded-full bg-violet-600/15 blur-[90px]" />
              <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_0.8fr]">
                <div>
                  <span className="grid h-14 w-14 place-items-center rounded-2xl border border-violet-300/15 bg-violet-400/10 text-violet-200"><LockKeyhole size={24} /></span>
                  <h2 className="mt-7 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">Confidence starts with control.</h2>
                  <p className="mt-4 max-w-xl leading-7 text-slate-400">Clear account controls, encrypted connections, and verification workflows help you stay in command of your experience.</p>
                </div>
                <div className="grid gap-3">
                  {['Encrypted platform connection', 'Identity verification workflows', 'Transparent activity history'].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/10 px-4 py-4 text-sm text-slate-300">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check size={14} /></span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-24 sm:pb-32">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">Good to know</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Questions,<br />answered clearly.</h2>
              <p className="mt-5 max-w-sm leading-7 text-slate-400">A few essentials about the Atlas Market experience before you begin.</p>
            </div>
            <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {faqs.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={faq.question}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-5 py-6 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-base font-semibold text-slate-100 sm:text-lg">{faq.question}</span>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-slate-400 transition ${isOpen ? 'rotate-180 bg-white/[0.06] text-white' : ''}`}>
                        <ChevronDown size={16} />
                      </span>
                    </button>
                    {isOpen && <p className="max-w-2xl pb-6 pr-12 text-sm leading-7 text-slate-400">{faq.answer}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/[0.07] py-24 text-center sm:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(124,58,237,0.16),transparent_42%)]" />
          <div className="relative mx-auto max-w-3xl px-5">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300">Your next move starts here</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">A better view of the market is one account away.</h2>
            <p className="mx-auto mt-5 max-w-xl leading-7 text-slate-400">Create your Atlas Market account and bring your trading, portfolio, and market tools together.</p>
            <Link to="/auth/register" className="group mt-9 inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-bold text-[#090a13] transition hover:bg-violet-100">
              Create your account
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] bg-[#05060d]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <div className="flex flex-col items-center justify-between gap-7 sm:flex-row">
            <BrandLogo className="h-11 w-36 object-contain object-left" />
            <div className="flex items-center gap-6 text-xs text-slate-500">
              <button type="button" onClick={() => scrollToSection('platform')} className="hover:text-slate-300">Platform</button>
              <button type="button" onClick={() => scrollToSection('security')} className="hover:text-slate-300">Security</button>
              <Link to="/auth" className="hover:text-slate-300">Sign in</Link>
            </div>
          </div>
          <div className="mt-8 border-t border-white/[0.06] pt-7 text-center text-[11px] leading-5 text-slate-600 sm:text-left">
            <p>Trading digital assets and leveraged products involves significant risk and may not be suitable for all investors. Values shown in the platform preview are illustrative only.</p>
            <p className="mt-3">© {new Date().getFullYear()} Atlas Market. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
