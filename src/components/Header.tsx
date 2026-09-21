import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLogo from './BrandLogo';
import {
  Home,
  Repeat,
  TrendingUp,
  Bot,
  Wallet,
  User,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Star,
  BarChart3,
  Layers,
  ShieldCheck,
  Eye,
  EyeOff,
  Gift
} from 'lucide-react';
import { TradingMode } from '../App';
import { MarketData } from '../hooks/useDatabase';
import { User as UserType } from '@supabase/supabase-js';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { TOP_CRYPTO_PAIRS, CFD_INSTRUMENTS, getCfdInstrument } from '../constants/tradingPairs';
import { useFiatCurrency } from '../hooks/useFiatCurrency';


interface HeaderProps {
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  currentPrice: number;
  marketData?: MarketData;
  usdtBalance: number;
  btcBalance: number;
  totalPortfolioValue: number;
  user: UserType;
  signOut: () => void;
  marketDataList: MarketData[];
  isAdmin: boolean;
}

const Header: React.FC<HeaderProps> = ({
  tradingMode,
  setTradingMode,
  selectedPair,
  setSelectedPair,
  currentPrice,
  usdtBalance,
  totalPortfolioValue,
  user,
  signOut,
  isAdmin
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatFiat, formatFiatPrice, formatTradingPair } = useFiatCurrency();
  const { marketData: cfdMarketData, getPriceBySymbol: getCfdPrice } = useMarketData();
  const { getPriceBySymbol: getCryptoPrice } = useBybitData();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getPriceBySymbol = (symbol: string): number => {
    if (tradingMode === 'futures') {
      return getCryptoPrice(symbol);
    }
    return getCfdPrice(symbol);
  };

  const marketData = tradingMode === 'futures'
    ? TOP_CRYPTO_PAIRS.map(pair => ({
      symbol: pair.symbol,
      price: getCryptoPrice(pair.symbol),
      name: pair.name,
      type: pair.type
    }))
    : cfdMarketData;
  const [showBalances, setShowBalances] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Refs for dropdown handling
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pairSelectorRef = useRef<HTMLDivElement>(null);

  // Get current price for selected pair
  const getCurrentPairPrice = () => {
    // Use the MarketDataContext's getPriceBySymbol which handles symbol conversion
    const price = getPriceBySymbol(selectedPair);
    if (price > 0) return price;

    // Fallback to currentPrice prop
    return currentPrice || 0;
  };

  const currentPairPrice = getCurrentPairPrice();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (pairSelectorRef.current && !pairSelectorRef.current.contains(event.target as Node)) {
        setShowPairSelector(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showUserMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUserMenu(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showUserMenu]);

  // Navigation items
  const navigationItems = [
    { key: 'home', label: t('navigation.home'), icon: Home },
    { key: 'swap', label: t('trading.swap'), icon: Repeat },
    { key: 'futures', label: t('trading.futures'), icon: TrendingUp },
    { key: 'cfd', label: t('trading.cfd'), icon: BarChart3 },
    { key: 'robot', label: t('trading.robot'), icon: Bot },
    { key: 'staking', label: t('trading.staking'), icon: Layers },
    { key: 'wheel', label: 'Spin Wheel', icon: Gift }
  ];

  // Format pair display
  const formatPairDisplay = (symbol: string) => {
    const cfdInstrument = getCfdInstrument(symbol);
    if (cfdInstrument && (cfdInstrument.type === 'stock' || cfdInstrument.type === 'index')) {
      return cfdInstrument.name;
    }
    if (symbol.endsWith('USDT')) {
      return formatTradingPair(symbol);
    }
    return symbol;
  };

  // Get appropriate decimal places based on asset type
  const getDecimalPlaces = (symbol: string, price: number) => {
    // Crypto pairs - 2-8 decimals based on price
    if (symbol.endsWith('USDT')) {
      if (price < 0.01) return 8;
      if (price < 1) return 6;
      if (price < 10) return 4;
      return 2;
    }

    // Forex pairs - 5 decimals
    if (symbol.includes('/') && !symbol.includes('XAU') && !symbol.includes('XAG') && !symbol.includes('XPT') && !symbol.includes('XPD')) {
      return 5;
    }

    // Commodities (Gold, Silver, Oil, etc.) - 3 decimals
    if (symbol.includes('XAU') || symbol.includes('XAG') || symbol.includes('XPT') || symbol.includes('XPD') ||
      symbol.includes('NATGAS') || symbol.includes('BCO') || symbol.includes('WTICO') ||
      symbol.includes('CORN') || symbol.includes('WHEAT') || symbol.includes('SOYBN') ||
      symbol.includes('SUGAR') || symbol.includes('COFFEE') || symbol.includes('COTTON') ||
      symbol.includes('COCOA')) {
      return 3;
    }

    // Stocks - 3 decimals
    return 3;
  };

  // Format price with appropriate decimal places
  const formatPrice = (symbol: string, price: number) => {
    const decimals = getDecimalPlaces(symbol, price);
    return price.toFixed(decimals);
  };

  const formatDisplayPrice = (symbol: string, price: number) => {
    const instrument = getCfdInstrument(symbol);
    if (instrument?.type === 'forex') return formatPrice(symbol, price);
    return formatFiatPrice(price, getDecimalPlaces(symbol, price));
  };

  // Filter pairs based on search term
  const getFilteredPairs = () => {
    // CFD mode uses the shared catalog so every selector stays in sync.
    if (tradingMode === 'cfd') {
      const term = searchTerm.trim().toLowerCase();
      return CFD_INSTRUMENTS
        .filter(instrument => !term
          || instrument.symbol.toLowerCase().includes(term)
          || instrument.name.toLowerCase().includes(term)
          || instrument.searchAliases?.some(alias => alias.toLowerCase().includes(term))
          || instrument.category?.toLowerCase().includes(term))
        .map(item => ({
          ...item,
          price: getCfdPrice(item.symbol)
        }));
    }

    if (!searchTerm) {
      if (tradingMode === 'futures') {
        return TOP_CRYPTO_PAIRS.map(pair => ({
          symbol: pair.symbol,
          price: getCryptoPrice(pair.symbol),
          name: pair.name,
          type: pair.type
        }));
      }
      return cfdMarketData;
    }

    const term = searchTerm.toLowerCase();

    if (tradingMode === 'futures') {
      return TOP_CRYPTO_PAIRS
        .filter(pair =>
          pair.symbol.toLowerCase().includes(term) ||
          pair.name.toLowerCase().includes(term) ||
          formatPairDisplay(pair.symbol).toLowerCase().includes(term)
        )
        .map(pair => ({
          symbol: pair.symbol,
          price: getCryptoPrice(pair.symbol),
          name: pair.name,
          type: pair.type
        }));
    }

    // For other modes, apply search to all market data
    return marketData.filter(data =>
      data.symbol.toLowerCase().includes(term) ||
      formatPairDisplay(data.symbol).toLowerCase().includes(term)
    );
  };

  const usesWideDesktopHeader = tradingMode === 'futures';
  const desktopHeaderBreakpoint = usesWideDesktopHeader ? '2xl:flex' : 'xl:flex';
  const compactHeaderBreakpoint = usesWideDesktopHeader ? '2xl:hidden' : 'xl:hidden';
  const headerContainerClass = 'w-full px-3 sm:px-4 lg:px-6';
  const headerPanelBackgroundClass = 'border border-white/[0.08] bg-[#141922]';
  const headerDropdownBackgroundClass = 'bg-[#171d27]';
  const headerSurfaceBackgroundClass = 'bg-[#202633]';
  const headerSurfaceHoverBackgroundClass = 'hover:bg-white/[0.06]';
  const headerSelectedBackgroundClass = 'bg-violet-500/10';

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0d1118]/95 text-slate-100 backdrop-blur-xl">
      <div className={headerContainerClass}>
        <div className="flex min-h-16 items-center justify-between gap-3">

          {/* Left Section - Logo and Navigation */}
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
            {/* Logo */}
            <div className={`flex shrink-0 items-center pr-1 ${usesWideDesktopHeader ? '2xl:border-r 2xl:pr-5' : 'xl:border-r xl:pr-5'} border-white/[0.08]`}>
              <BrandLogo className="h-auto w-24 sm:w-32" />
            </div>

            {/* Desktop Navigation */}
            <nav aria-label="Main navigation" className={`hidden min-w-0 flex-1 items-center gap-0.5 ${desktopHeaderBreakpoint}`}>
              {navigationItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.key}>
                    {index === 4 && <span aria-hidden="true" className="mx-2 h-5 w-px shrink-0 bg-white/[0.1] 2xl:mx-3" />}
                    <button
                      onClick={() => setTradingMode(item.key as TradingMode)}
                      aria-current={tradingMode === item.key ? 'page' : undefined}
                      className={`flex h-16 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium transition-colors 2xl:gap-2 2xl:px-3 2xl:text-sm ${tradingMode === item.key
                        ? 'border-violet-400 bg-white/[0.04] text-white'
                        : `border-transparent text-slate-400 hover:border-white/[0.18] hover:text-white ${headerSurfaceHoverBackgroundClass}`
                        }`}
                    >
                      <Icon size={16} className={tradingMode === item.key ? 'text-violet-300' : 'text-slate-500'} />
                      <span>{item.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          {/* Center Section - Pair Selector and Price */}
          {(tradingMode === 'futures' || tradingMode === 'cfd') && (
            <div className={`hidden items-center gap-2.5 2xl:gap-3 ${desktopHeaderBreakpoint}`}>
              {/* Pair Selector */}
              <div className="relative" ref={pairSelectorRef}>
                <button
                  onClick={() => setShowPairSelector(!showPairSelector)}
                  className={`flex items-center gap-2 rounded-md border border-white/[0.08] ${headerSurfaceBackgroundClass} px-2.5 py-1.5 text-sm transition-colors hover:border-white/[0.18] ${headerSurfaceHoverBackgroundClass} 2xl:px-3`}
                >
                  <span className="max-w-[132px] truncate font-semibold text-white 2xl:max-w-none">{formatPairDisplay(selectedPair)}</span>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {showPairSelector && (
                  <div className={`absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-700 ${headerDropdownBackgroundClass} shadow-2xl shadow-black/50`}>
                    {/* Search Input */}
                    <div className="border-b border-slate-700 p-2.5">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          placeholder="Search pairs..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className={`w-full rounded-lg border border-slate-600 ${headerSurfaceBackgroundClass} py-1.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500`}
                        />
                      </div>
                    </div>

                    {/* Pairs List */}
                    <div className="max-h-64 overflow-y-auto">
                      {getFilteredPairs().map((data) => {
                        const instrument = tradingMode === 'cfd' ? getCfdInstrument(data.symbol) : undefined;
                        const unavailable = instrument?.tradable === false;
                        return (
                        <button
                          key={data.symbol}
                          onClick={() => {
                            setSelectedPair(data.symbol);
                            setShowPairSelector(false);
                            setSearchTerm('');
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${headerSurfaceHoverBackgroundClass} ${unavailable ? 'opacity-65' : ''} ${selectedPair === data.symbol ? `${headerSelectedBackgroundClass} text-blue-400` : 'text-white'
                            }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Star size={13} className="text-slate-600" />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{formatPairDisplay(data.symbol)}</div>
                              {tradingMode === 'cfd' && (
                                <div className="truncate text-[10px] uppercase text-slate-500">
                                  {instrument?.type === 'stock' ? `${data.symbol} · ` : ''}{unavailable ? 'View only' : instrument?.category}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-xs text-slate-400">
                            {data.price && data.price > 0 ? formatDisplayPrice(data.symbol, data.price) : '—'}
                          </span>
                        </button>
                      );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Current Price */}
              <div className={`flex w-fit items-center justify-between rounded-md ${headerPanelBackgroundClass} px-2.5 py-2 text-white 2xl:px-3`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-medium">{t('header.price')}</span>
                </div>
                <span className="ml-2.5 text-[13px] font-mono">{formatDisplayPrice(selectedPair, currentPairPrice)}</span>
              </div>
            </div>
          )}

          {/* Right Section - Portfolio + User Menu */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5 lg:gap-3">
            {/* Portfolio value in the platform fiat currency */}
            <div className={`hidden min-w-0 items-center gap-2 2xl:gap-4 ${desktopHeaderBreakpoint}`}>
              <div className={`flex min-w-0 max-w-[220px] items-center justify-between rounded-md ${headerPanelBackgroundClass} px-3 py-1.5 text-white xl:max-w-none 2xl:px-3.5`}>
                <div className="flex min-w-0 items-center gap-2 xl:gap-2.5 2xl:gap-3">
                  <button
                    onClick={() => setShowBalances(!showBalances)}
                    className="text-slate-400 transition-colors hover:text-white"
                    aria-label={showBalances ? 'Hide portfolio value' : 'Show portfolio value'}
                  >
                    {showBalances ? <Eye size={17} /> : <EyeOff size={17} />}
                  </button>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 2xl:text-xs">{t('header.portfolioValue')}</div>
                    <div className="truncate font-mono text-sm font-semibold text-white">
                      {showBalances ? formatFiat(totalPortfolioValue) : '••••••'}
                    </div>
                  </div>
                </div>

                <span className={`ml-2 rounded border border-white/[0.08] ${headerSurfaceBackgroundClass} px-2 py-1 text-[11px] text-slate-300`}>
                  EUR
                </span>
              </div>

            </div>

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(current => !current)}
                aria-label="Account menu"
                aria-expanded={showUserMenu}
                aria-controls="account-menu"
                className={`flex items-center gap-1.5 rounded-lg border p-1.5 transition-colors ${showUserMenu ? 'border-violet-400/35 bg-violet-500/10 text-white' : `border-transparent text-slate-400 ${headerSurfaceHoverBackgroundClass} hover:text-white`}`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/15">
                  <User size={16} className="text-violet-200" />
                </div>
                <ChevronDown size={16} className="hidden sm:block" />
              </button>

              {showUserMenu && (
                <div id="account-menu" aria-label="Account options" className={`absolute right-0 top-full z-50 mt-2 max-h-[calc(100vh-5rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-white/[0.12] ${headerDropdownBackgroundClass} p-2 shadow-[0_24px_70px_rgba(0,0,0,0.55)]`}>
                  <div className="flex min-w-0 items-center gap-3 px-2 py-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/15 text-violet-200">
                      <User size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white" title={user.email || undefined}>{user.email}</div>
                      <div className="mt-0.5 text-xs text-slate-400">Trading account</div>
                    </div>
                    {isAdmin && <span className="shrink-0 rounded-md border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200">Admin</span>}
                  </div>

                  <div className="mt-1 rounded-xl border border-white/[0.08] bg-[#101720] px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                      <span>{t('header.portfolioValue')}</span><span className="font-semibold text-slate-500">EUR</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-lg font-semibold tracking-tight text-white" title={showBalances ? formatFiat(totalPortfolioValue) : undefined}>
                      {showBalances ? formatFiat(totalPortfolioValue) : '••••••'}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-2.5 text-xs">
                      <span className="text-slate-400">Cash balance</span>
                      <span className="truncate font-mono font-medium text-slate-200">{showBalances ? formatFiat(usdtBalance) : '••••••'}</span>
                    </div>
                  </div>

                  <div className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Account</div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTradingMode('wallet');
                        setShowUserMenu(false);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${tradingMode === 'wallet' ? 'bg-violet-500/10 text-white' : `text-slate-300 ${headerSurfaceHoverBackgroundClass} hover:text-white`}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-violet-300"><Wallet size={17} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('navigation.wallet')}</span><span className="block text-xs text-slate-500">Balances and funding</span></span>
                      <ChevronRight size={15} className="shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTradingMode('profile');
                        setShowUserMenu(false);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${tradingMode === 'profile' ? 'bg-violet-500/10 text-white' : `text-slate-300 ${headerSurfaceHoverBackgroundClass} hover:text-white`}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-violet-300"><User size={17} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('navigation.profile')}</span><span className="block text-xs text-slate-500">Account and verification</span></span>
                      <ChevronRight size={15} className="shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/admin');
                          setShowUserMenu(false);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-slate-300 transition-colors ${headerSurfaceHoverBackgroundClass} hover:text-white`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-violet-300"><ShieldCheck size={17} /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Administration CRM</span><span className="block text-xs text-slate-500">Customer management</span></span>
                        <ChevronRight size={15} className="shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 border-t border-white/[0.08] pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        setShowUserMenu(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-400 transition-colors hover:bg-red-500/[0.08] hover:text-red-300"
                    >
                      <LogOut size={17} />
                      <span>{t('navigation.signOut')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileMenuOpen}
              className={`${compactHeaderBreakpoint} rounded-md border border-white/[0.08] p-2 text-slate-400 transition-colors ${headerSurfaceHoverBackgroundClass} hover:text-white`}
            >
              {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className={`max-h-[calc(100vh-64px)] overflow-y-auto border-t border-white/[0.08] bg-[#0d1118] py-4 ${compactHeaderBreakpoint}`}>
          <div className={headerContainerClass}>
            {/* Mobile Portfolio Value */}
            <div className={`mb-4 rounded-lg ${headerPanelBackgroundClass} p-3.5`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-slate-400 text-xs">{t('header.portfolioValue')}</div>
                  <div className="truncate text-base font-mono text-white">
                    {showBalances ? formatFiat(totalPortfolioValue) : '••••••'}
                  </div>
                </div>
                <button
                  onClick={() => setShowBalances(!showBalances)}
                  aria-label={showBalances ? 'Hide portfolio value' : 'Show portfolio value'}
                  className="rounded-md p-2 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {showBalances ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>

            {/* Mobile Navigation */}
            <nav aria-label="Main navigation" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {navigationItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.key}>
                    {(index === 0 || index === 4) && (
                      <div className={`col-span-full text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${index === 4 ? 'mt-2 border-t border-white/[0.08] pt-4' : ''}`}>
                        {index === 0 ? 'Trading' : 'Products'}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setTradingMode(item.key as TradingMode);
                        setIsMobileMenuOpen(false);
                      }}
                      aria-current={tradingMode === item.key ? 'page' : undefined}
                      className={`flex min-w-0 items-center gap-2 rounded-md border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${tradingMode === item.key
                        ? 'border-violet-400/40 bg-violet-500/10 text-white'
                        : `border-white/[0.07] bg-[#141922] text-slate-400 hover:text-white ${headerSurfaceHoverBackgroundClass}`
                        }`}
                    >
                      <Icon size={15} className={tradingMode === item.key ? 'shrink-0 text-violet-300' : 'shrink-0 text-slate-500'} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>

            {/* Mobile Pair Selector */}
            {(tradingMode === 'futures' || tradingMode === 'cfd') && (
              <div className="mt-3 border-t border-slate-700/50 pt-3" ref={pairSelectorRef}>
                <div className="mb-2">
                  <div className="text-slate-400 text-xs mb-2">Current Pair</div>
                  <button
                    onClick={() => setShowPairSelector(!showPairSelector)}
                    className={`flex w-full items-center justify-between rounded-xl border border-slate-600/50 ${headerSurfaceBackgroundClass} px-3.5 py-2.5 text-sm transition-all ${headerSurfaceHoverBackgroundClass}`}
                  >
                    <span className="truncate pr-3 font-semibold text-white">{formatPairDisplay(selectedPair)}</span>
                    <ChevronDown size={14} className="text-slate-400" />
                  </button>

                  {showPairSelector && (
                    <div className={`mt-2 ${headerDropdownBackgroundClass} border border-slate-700 rounded-xl shadow-2xl shadow-black/50 z-50 w-full overflow-hidden`}>
                      {/* Search Input */}
                      <div className="border-b border-slate-700 p-2.5">
                        <div className="relative">
                          <Search
                            size={14}
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                          />
                          <input
                            type="text"
                            placeholder="Search pairs..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full rounded-lg border border-slate-600 ${headerSurfaceBackgroundClass} py-1.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500`}
                          />
                        </div>
                      </div>

                      {/* Pairs List */}
                      <div className="max-h-64 overflow-y-auto">
                        {getFilteredPairs().map((data) => {
                          const instrument = tradingMode === 'cfd' ? getCfdInstrument(data.symbol) : undefined;
                          const unavailable = instrument?.tradable === false;
                          return (
                          <button
                            key={data.symbol}
                            onClick={() => {
                              setSelectedPair(data.symbol);
                              setShowPairSelector(false);
                              setSearchTerm('');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${headerSurfaceHoverBackgroundClass} ${selectedPair === data.symbol ? `${headerSelectedBackgroundClass} text-blue-400` : 'text-white'
                              }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{formatPairDisplay(data.symbol)}</div>
                              {tradingMode === 'cfd' && (
                                <div className="truncate text-[10px] uppercase text-slate-500">
                                  {instrument?.type === 'stock' ? `${data.symbol} · ` : ''}{unavailable ? 'View only' : instrument?.category}
                                </div>
                              )}
                            </div>
                            <span className="shrink-0 text-xs font-mono text-slate-400">
                              {formatDisplayPrice(data.symbol, data.price || 0)}
                            </span>
                          </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>

  );
};


export default Header;
