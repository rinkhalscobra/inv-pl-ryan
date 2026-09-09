import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Repeat,
  TrendingUp,
  Bot,
  Target,
  Wallet,
  User,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Search,
  Star,
  Activity,
  BarChart3,
  Layers,
  Info,
  Globe,
  Bell,
  Shield,
  ShieldCheck,
  Zap,
  DollarSign,
  Bitcoin,
  Eye,
  EyeOff,
  Gift,
  CreditCard
} from 'lucide-react';
import { TradingMode, UserStatus } from '../App';
import { MarketData } from '../hooks/useDatabase';
import { User as UserType } from '@supabase/supabase-js';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { TOP_CRYPTO_PAIRS, CFD_INSTRUMENTS, getCfdInstrument } from '../constants/tradingPairs';



const convertBalance = (balance: number, targetCurrency: string): number => {
  if (targetCurrency === 'USD') return balance; // base case

  // market_data stores prices like EUR/USD, GBP/USD, BTC/USDT etc.



  const conversionSymbol = targetCurrency === 'BTC' || targetCurrency === 'ETH'
    ? `${targetCurrency}USDT`
    : `USD/${targetCurrency}`;

  const rate = getPriceBySymbol(conversionSymbol);

  if (!rate || rate <= 0) return balance; // fallback: no conversion
  // If we stored USD/XXX → multiply, if XXX/USD → divide
  if (conversionSymbol.startsWith('USD/')) {
    return balance * rate; // 1 USD = X target currency
  } else {
    return balance / rate; // target in USD, so invert
  }
};


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
  userStatus: UserStatus;
  isDemoAccount: boolean;
  isAdmin: boolean;
}

const Header: React.FC<HeaderProps> = ({
  tradingMode,
  setTradingMode,
  selectedPair,
  setSelectedPair,
  currentPrice,
  marketData: selectedMarketData,
  usdtBalance,
  btcBalance,
  totalPortfolioValue,
  user,
  signOut,
  marketDataList,
  userStatus,
  isDemoAccount,
  isAdmin
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { marketData: cfdMarketData, isConnected: cfdConnected, getPriceBySymbol: getCfdPrice } = useMarketData();
  const { getPriceBySymbol: getCryptoPrice, isConnected: cryptoConnected } = useBybitData();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getPriceBySymbol = (symbol: string): number => {
    if (tradingMode === 'futures') {
      return getCryptoPrice(symbol);
    }
    return getCfdPrice(symbol);
  };

  // Smart price lookup that uses the correct data source regardless of trading mode
  const getConversionRate = (symbol: string): number => {
    // For crypto pairs (BTCUSDT, ETHUSDT, etc.), always use Bybit
    if (symbol.includes('USDT') && !symbol.includes('/')) {
      return getCryptoPrice(symbol);
    }
    // For forex pairs (USD/EUR, EUR/USD, etc.), always use CFD
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // --- Currency Dropdown State ---
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [selectedDisplayCurrency, setSelectedDisplayCurrency] = useState('USD');
  const currencyRef = useRef<HTMLDivElement>(null);

  // Available currencies
  const currencyOptions = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
    { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
    { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
    { code: 'BTC', symbol: '₿', name: 'Bitcoin' },
    { code: 'ETH', symbol: 'Ξ', name: 'Ethereum' },
  ];

  // Get symbol for currently selected currency
  const selectedCurrencySymbol = React.useMemo(() => {
    const option = currencyOptions.find(opt => opt.code === selectedDisplayCurrency);
    return option ? option.symbol : '$';
  }, [selectedDisplayCurrency]);

  const convertBalance = (balance: number, targetCurrency: string): number => {
    if (targetCurrency === 'USD') return balance;

    // For crypto, use direct USDT pairs from Bybit
    if (targetCurrency === 'BTC' || targetCurrency === 'ETH') {
      const cryptoSymbol = `${targetCurrency}USDT`;
      const rate = getConversionRate(cryptoSymbol);
      if (rate && rate > 0) {
        return balance / rate; // Convert USD to crypto (e.g., $100 / $60000 = 0.00166 BTC)
      }
      return balance; // Fallback
    }

    // For fiat currencies, try both USD/XXX and XXX/USD formats from CFD
    const directSymbol = `USD/${targetCurrency}`; // e.g., USD/EUR
    const invertedSymbol = `${targetCurrency}/USD`; // e.g., EUR/USD

    // Try direct symbol first
    let rate = getConversionRate(directSymbol);
    if (rate && rate > 0) {
      return balance * rate; // If USD/EUR = 0.93, then $100 = €93
    }

    // Try inverted symbol
    rate = getConversionRate(invertedSymbol);
    if (rate && rate > 0) {
      return balance / rate; // If EUR/USD = 1.08, then $100 = €92.59 (100/1.08)
    }

    // Fallback: no conversion available
    return balance;
  };
  // Refs for dropdown handling
  const notificationsRef = useRef<HTMLDivElement>(null);
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
  const currentBtcPrice = getPriceBySymbol('BTCUSDT') || 0;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
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

  // Navigation items
  const navigationItems = [
    { key: 'home', label: t('navigation.home'), icon: Home },
    { key: 'swap', label: t('trading.swap'), icon: Repeat },
    { key: 'futures', label: t('trading.futures'), icon: TrendingUp },
    { key: 'cfd', label: t('trading.cfd'), icon: BarChart3 },
    { key: 'prop_firm', label: t('propFirm.prop'), icon: Target },
    { key: 'robot', label: t('trading.robot'), icon: Bot },
    { key: 'events', label: t('trading.events'), icon: Activity },
    { key: 'staking', label: t('trading.staking'), icon: Layers },
    { key: 'wheel', label: 'Spin Wheel', icon: Gift }
  ];

  // Get status color based on user tier
  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'No-Coiner': return 'text-slate-500';
      case 'Shrimp': return 'text-gray-400';
      case 'Crab': return 'text-purple-400';
      case 'Octopus': return 'text-purple-400';
      case 'Dolphin': return 'text-blue-400';
      case 'Shark': return 'text-red-400';
      case 'Whale': return 'text-green-400';
      case 'Humpback': return 'text-cyan-400';
      default: return 'text-slate-400';
    }
  };

  // Get status icon based on user tier
  const getStatusIcon = (status: UserStatus) => {
    switch (status) {
      case 'No-Coiner': return '🚫';
      case 'Shrimp': return '🦐';
      case 'Crab': return '🦀';
      case 'Octopus': return '🐙';
      case 'Dolphin': return '🐬';
      case 'Shark': return '🦈';
      case 'Whale': return '🐋';
      case 'Humpback': return '🐳';
      default: return '📊';
    }
  };

  // Format pair display
  const formatPairDisplay = (symbol: string) => {
    const cfdInstrument = getCfdInstrument(symbol);
    if (cfdInstrument && (cfdInstrument.type === 'stock' || cfdInstrument.type === 'index')) {
      return cfdInstrument.name;
    }
    if (symbol.endsWith('USDT')) {
      return symbol.replace('USDT', '/USDT');
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
  const headerContainerClass = 'w-full px-3 sm:px-4 lg:px-8';
  const headerShellBackgroundClass = 'app-shell-bg';
  const headerPanelBackgroundClass = 'app-surface-secondary';
  const headerDropdownBackgroundClass = 'app-dropdown';
  const headerSurfaceBackgroundClass = 'app-control';
  const headerSurfaceHoverBackgroundClass = 'app-surface-hover';
  const headerSelectedBackgroundClass = 'app-action-soft';

  return (
    <header className={`sticky top-0 z-40 border-b border-slate-700/50 ${headerShellBackgroundClass} shadow-xl backdrop-blur-md`}>
      <div className={headerContainerClass}>
        <div className="flex min-h-16 items-center justify-between gap-3 py-2 sm:h-16 sm:py-0">

          {/* Left Section - Logo and Navigation */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3 lg:gap-5">
            {/* Logo */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              <span className="hidden whitespace-nowrap bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-xl font-bold text-transparent min-[420px]:block sm:text-2xl">
                Atlas Market
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className={`hidden min-w-0 flex-1 items-center justify-center gap-1 2xl:gap-2 ${desktopHeaderBreakpoint}`}>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => setTradingMode(item.key as TradingMode)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium transition-all duration-300 2xl:gap-2 2xl:px-2.5 2xl:text-sm ${tradingMode === item.key
                      ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg shadow-purple-500/25'
                      : `text-slate-400 hover:text-white ${headerSurfaceHoverBackgroundClass}`
                      }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Center Section - Pair Selector and Price */}
          {(tradingMode === 'futures' || tradingMode === 'cfd' || tradingMode === 'prop_firm') && (
            <div className={`hidden items-center gap-2.5 2xl:gap-3 ${desktopHeaderBreakpoint}`}>
              {/* Pair Selector */}
              <div className="relative" ref={pairSelectorRef}>
                <button
                  onClick={() => setShowPairSelector(!showPairSelector)}
                  className={`flex items-center gap-2 rounded-xl border border-slate-600/50 ${headerSurfaceBackgroundClass} px-2.5 py-1.5 text-sm transition-all hover:border-slate-500/50 ${headerSurfaceHoverBackgroundClass} 2xl:px-3.5`}
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
                            {data.price && data.price > 0 ? `$${formatPrice(data.symbol, data.price)}` : '—'}
                          </span>
                        </button>
                      );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Current Price */}
              <div className={`flex w-fit items-center justify-between rounded-xl border border-slate-600/50 ${headerPanelBackgroundClass} px-2.5 py-2.5 text-white 2xl:px-3.5`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-medium">{t('header.price')}</span>
                </div>
                <span className="ml-2.5 text-[13px] font-mono">${formatPrice(selectedPair, currentPairPrice)}</span>
              </div>
            </div>
          )}

          {/* Right Section - Portfolio + User Status + Menu */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5 lg:gap-3 2xl:gap-5">
            {/* Portfolio Value + Currency Dropdown */}
            <div className={`hidden min-w-0 items-center gap-2 2xl:gap-4 ${desktopHeaderBreakpoint}`}>
              <div className={`flex min-w-0 max-w-[220px] items-center justify-between rounded-xl ${headerPanelBackgroundClass} px-3 py-2.5 text-white xl:max-w-none xl:px-3.5 2xl:px-4 2xl:py-3`}>
                <div className="flex min-w-0 items-center gap-2 xl:gap-2.5 2xl:gap-3">
                  <button
                    onClick={() => setShowBalances(!showBalances)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {showBalances ? <Eye size={17} /> : <EyeOff size={17} />}
                  </button>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400 2xl:text-[13px]">{t('header.portfolioValue')}</div>
                    <div className="truncate text-[13px] font-mono text-white 2xl:text-sm">
                      {showBalances
                        ? `${selectedCurrencySymbol}${convertBalance(
                          totalPortfolioValue,
                          selectedDisplayCurrency
                        ).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                        : '••••••'}
                    </div>
                  </div>
                </div>

                {/* Currency Dropdown */}
                <div className="relative ml-2 xl:ml-2.5" ref={currencyRef}>
                  <button
                    onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                    className={`flex items-center gap-1 rounded-lg ${headerSurfaceBackgroundClass} px-2 py-1 text-xs text-white 2xl:gap-1.5 2xl:px-2.5 2xl:py-1.5 2xl:text-sm`}
                  >
                    {selectedCurrencySymbol} <ChevronDown size={14} />
                  </button>
                  {isCurrencyDropdownOpen && (
                    <div className={`absolute right-0 mt-2 w-44 ${headerDropdownBackgroundClass} border border-slate-700 rounded-lg shadow-2xl shadow-black/50 z-50 max-h-80 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`}>
                      {currencyOptions.map((option) => (
                        <button
                          key={option.code}
                          onClick={() => {
                            setSelectedDisplayCurrency(option.code);
                            setIsCurrencyDropdownOpen(false);
                          }}
                          className={`flex w-full items-center px-3 py-2 text-xs ${headerSurfaceHoverBackgroundClass} ${selectedDisplayCurrency === option.code
                            ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white'
                            : 'text-white'
                            }`}
                        >
                          {option.symbol} {option.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Account Type Indicator */}
              <div className={`hidden rounded-xl border px-2.5 py-1.5 md:block 2xl:px-3.5 2xl:py-2.5 ${isDemoAccount
                ? 'bg-purple-500/10 border-purple-500/30'
                : 'bg-gradient-to-r from-purple-500/20 to-violet-500/10 border-purple-500/30'
                }`}>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full 2xl:h-2.5 2xl:w-2.5 ${isDemoAccount ? 'bg-purple-400' : 'bg-white'
                    }`} />
                  <span className={`text-xs font-semibold 2xl:text-sm ${isDemoAccount ? 'text-purple-400' : 'text-white'
                    }`}>
                    {isDemoAccount ? 'DEMO' : 'LIVE'}
                  </span>
                </div>
              </div>
            </div>

            {/* User Status Badge */}
            <div
              className={`flex min-w-0 items-center gap-1.5 rounded-xl border px-2 py-1.5 sm:px-2.5 2xl:gap-2 2xl:px-3.5 2xl:py-2.5 ${userStatus === 'Whale' || userStatus === 'Humpback'
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30'
                : userStatus === 'Shark'
                  ? 'bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-500/30'
                  : userStatus === 'Dolphin'
                    ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30'
                    : userStatus === 'Octopus'
                      ? 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border-purple-500/30'
                      : userStatus === 'Crab'
                        ? 'bg-gradient-to-r from-purple-500/20 to-violet-500/20 border-purple-500/30'
                        : `${headerSurfaceBackgroundClass} border-slate-600/50`
                }`}
            >
              <span className="text-base 2xl:text-lg">{getStatusIcon(userStatus)}</span>
              <span className={`hidden truncate text-[11px] font-medium min-[420px]:block sm:text-xs 2xl:text-sm ${getStatusColor(userStatus)}`}>
                {t(`header.tiers.${userStatus.toLowerCase()}`)}
              </span>
            </div>

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={`flex items-center gap-1.5 rounded-lg p-1.5 text-slate-400 transition-colors 2xl:p-2 ${headerSurfaceHoverBackgroundClass} hover:text-white`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-violet-500 2xl:h-9 2xl:w-9">
                  <User size={16} className="text-white" />
                </div>
                <ChevronDown size={16} className="hidden sm:block" />
              </button>

              {showUserMenu && (
                <div className={`absolute right-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-700 ${headerDropdownBackgroundClass} shadow-2xl shadow-black/50 sm:max-w-[calc(100vw-2rem)]`}>
                  <div className="border-b border-slate-700 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{user.email}</div>
                        <div className={`text-xs ${getStatusColor(userStatus)}`}>
                          {getStatusIcon(userStatus)} {userStatus}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    <button
                      onClick={() => {
                        setTradingMode('wallet');
                        setShowUserMenu(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 transition-colors ${headerSurfaceHoverBackgroundClass} hover:text-white`}
                    >
                      <Wallet size={15} />
                      <span>{t('navigation.wallet')}</span>
                    </button>

                    <button
                      onClick={() => {
                        setTradingMode('profile');
                        setShowUserMenu(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 transition-colors ${headerSurfaceHoverBackgroundClass} hover:text-white`}
                    >
                      <User size={15} />
                      <span>{t('navigation.profile')}</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          navigate('/admin');
                          setShowUserMenu(false);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-purple-300 transition-colors ${headerSurfaceHoverBackgroundClass} hover:text-white`}
                      >
                        <ShieldCheck size={15} />
                        <span>Administration CRM</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        signOut();
                        setShowUserMenu(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-300 transition-colors ${headerSurfaceHoverBackgroundClass} hover:text-white`}
                    >
                      <LogOut size={15} />
                      <span>{t('navigation.signOut')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`${compactHeaderBreakpoint} rounded-lg p-1.5 text-slate-400 transition-colors ${headerSurfaceHoverBackgroundClass} hover:text-white`}
            >
              {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className={`border-t border-slate-700/50 py-3 ${compactHeaderBreakpoint}`}>
          <div className={headerContainerClass}>
            {/* Mobile Portfolio Value */}
            <div className={`mb-4 rounded-xl border border-slate-600/50 ${headerPanelBackgroundClass} p-3.5`}>
              <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-slate-400 text-xs">{t('header.portfolioValue')}</div>
                  <div className="truncate text-base font-mono text-white">
                    {showBalances
                      ? `$${totalPortfolioValue.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                      : '••••••'}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <button
                    onClick={() => setShowBalances(!showBalances)}
                    className="p-1 text-slate-400 transition-colors hover:text-white"
                  >
                    {showBalances ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <div className={`flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 ${getStatusColor(userStatus)}`}>
                    <span>{getStatusIcon(userStatus)}</span>
                    <span className="truncate text-xs font-medium">{userStatus}</span>
                  </div>
                </div>
              </div>

              {/* Account Type Indicator - Mobile */}
              <div className="flex items-center justify-center">
                <div className={`rounded-lg border px-3 py-1.5 ${isDemoAccount
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-gradient-to-r from-purple-500/20 to-violet-500/10 border-purple-500/30'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isDemoAccount ? 'bg-purple-400' : 'bg-white'
                      }`} />
                    <span className={`text-xs font-semibold ${isDemoAccount ? 'text-purple-400' : 'text-white'
                      }`}>
                      {isDemoAccount ? 'DEMO ACCOUNT' : 'LIVE ACCOUNT'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Navigation */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setTradingMode(item.key as TradingMode);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-300 ${tradingMode === item.key
                      ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg shadow-purple-500/25'
                      : `text-slate-400 hover:text-white ${headerSurfaceHoverBackgroundClass} border border-slate-600/30`
                      }`}
                  >
                    <Icon size={15} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile Pair Selector */}
            {(tradingMode === 'futures' || tradingMode === 'cfd' || tradingMode === 'prop_firm') && (
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
                              ${formatPrice(data.symbol, data.price || 0)}
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
