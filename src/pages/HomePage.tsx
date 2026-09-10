import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  BarChart3, 
  ArrowRight, 
  Zap, 
  Repeat, 
  Layers, 
  Clock, 
  DollarSign, 
  ChevronRight, 
  Globe, 
  Star, 
  ArrowUpRight, 
  ArrowDownRight,
  ArrowDownLeft,
  Bitcoin,
  LineChart,
  PieChart,
  Activity,
  Newspaper,
  ExternalLink,
  ChevronLeft,
  Package
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { MarketData, NewsItem, PortfolioSnapshot, DatabaseUserAsset } from '../hooks/useDatabase';
import { FuturesPosition, Transaction, TradingMode } from '../App';
import { useDatabase } from '../hooks/useDatabase';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { TOP_CRYPTO_PAIRS } from '../constants/tradingPairs';
import GiveawayCampaignPopup from '../components/GiveawayCampaignPopup';
import GiveawayWinnerPopup from '../components/GiveawayWinnerPopup';
import GiveawayComingSoonPopup from '../components/GiveawayComingSoonPopup';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const MARKET_OVERVIEW_ICON_URLS: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  ADA: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  MATIC: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
  DOT: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
  APT: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png',
  ARB: 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
  OP: 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png',
  LTC: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png'
};

interface HomePageProps {
  usdtBalance: number;
  btcBalance: number;
  futuresPositions: FuturesPosition[];
  transactions: Transaction[];
  setTradingMode: (mode: TradingMode) => void;
  newsItems: NewsItem[];
  totalPortfolioValue?: number;
  userAssets?: DatabaseUserAsset[];
}

const HomePage: React.FC<HomePageProps> = ({
  usdtBalance,
  btcBalance,
  futuresPositions,
  transactions,
  setTradingMode,
  newsItems,
  totalPortfolioValue = 0,
  userAssets = []
}) => {
  const { t } = useTranslation();
  const { formatFiat, formatFiatCompact } = useFiatCurrency();
  const { fetchPortfolioSnapshots, portfolioSnapshots, createPortfolioSnapshot, coingeckoMarketCapData } = useDatabase();
  const { marketData, isConnected: isRealtimeConnected, getPriceBySymbol } = useMarketData();
  const { getPriceBySymbol: getBybitPrice, getCryptoDataBySymbol } = useBybitData();
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'transactions'>('overview');
  const [filteredSnapshots, setFilteredSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [liveSnapshots, setLiveSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [showCampaignPopup, setShowCampaignPopup] = useState(false);
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);
  const [showComingSoonPopup, setShowComingSoonPopup] = useState(false);
  const lastPersistedSnapshotRef = useRef<{
    date: string;
    value: number;
    timestamp: number;
  } | null>(null);

  const getSnapshotTimestamp = useCallback((snapshot: PortfolioSnapshot) => {
    const createdAtTime = new Date(snapshot.created_at).getTime();
    if (!Number.isNaN(createdAtTime)) {
      return createdAtTime;
    }

    const snapshotDateTime = new Date(snapshot.snapshot_date).getTime();
    return Number.isNaN(snapshotDateTime) ? 0 : snapshotDateTime;
  }, []);

  // Helper function to format date safely
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    } catch (error) {
      return 'N/A';
    }
  };
  
  // News pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  
  // Chart period state
  const [chartPeriod, setChartPeriod] = useState<'1W' | '1M' | '3M' | '1Y' | 'All'>('1M');
  
  const currentBtcPrice = getBybitPrice('BTCUSDT') || getPriceBySymbol('BTCUSDT') || 0;
  
  // Calculate actual portfolio value if not provided or is zero
  const actualPortfolioValue = totalPortfolioValue > 0 ? totalPortfolioValue : (usdtBalance + (btcBalance * currentBtcPrice));
  
  // Check if data is still loading
  const isDataLoading = actualPortfolioValue === 0 && (usdtBalance === 0 && btcBalance === 0 && currentBtcPrice === 0);
  
  // Calculate total PnL from futures positions
  const totalPositionsPnl = futuresPositions.reduce((sum, position) => {
    // Calculate correct unrealized PnL without extra leverage multiplication
    const entryPrice = position.entryPrice || position.entry_price || 0;
    
    // Get live price from market data context first, then fallback to position data
    let currentPrice = 0;
    const livePrice = getPriceBySymbol(position.symbol);
    if (livePrice > 0) {
      currentPrice = livePrice;
    } else {
      currentPrice = position.currentPrice || position.current_price || 0;
    }
    
    const amount = position.amount || 0;
    const side = position.side || 'long';
    let unrealizedPnl = 0;
    if (position.side === 'long') {
      unrealizedPnl = (currentPrice - entryPrice) * amount;
    } else {
      unrealizedPnl = (entryPrice - currentPrice) * amount;
    }
    
    return sum + unrealizedPnl;
  }, 0);
  const portfolioPerformanceValue = actualPortfolioValue + totalPositionsPnl;

  // Fetch portfolio snapshots based on selected period
  useEffect(() => {
    const fetchSnapshotsForPeriod = async () => {
      let days = 30; // Default to 1 month
      
      switch (chartPeriod) {
        case '1W':
          days = 7;
          break;
        case '1M':
          days = 30;
          break;
        case '3M':
          days = 90;
          break;
        case '1Y':
          days = 365;
          break;
        case 'All':
          days = 9999; // Fetch all data
          break;
      }
      
      await fetchPortfolioSnapshots(days);
    };
    
    fetchSnapshotsForPeriod();
  }, [chartPeriod, fetchPortfolioSnapshots]);

  useEffect(() => {
    if (isDataLoading || portfolioPerformanceValue <= 0) {
      return;
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const todaySnapshotDate = nowIso.split('T')[0];
    const liveSnapshot: PortfolioSnapshot = {
      id: `live-${now}`,
      user_id: portfolioSnapshots[portfolioSnapshots.length - 1]?.user_id || '',
      snapshot_date: todaySnapshotDate,
      total_value: portfolioPerformanceValue,
      usdt_balance: usdtBalance,
      btc_balance: btcBalance,
      btc_price: currentBtcPrice,
      created_at: nowIso
    };

    setLiveSnapshots(prev => {
      const lastSnapshot = prev[prev.length - 1];
      if (!lastSnapshot) {
        return [liveSnapshot];
      }

      const lastTime = getSnapshotTimestamp(lastSnapshot);
      const valueDelta = Math.abs(lastSnapshot.total_value - portfolioPerformanceValue);
      const enoughTimePassed = now - lastTime >= 60 * 1000;

      if (valueDelta < 0.01 && !enoughTimePassed) {
        return prev;
      }

      if (!enoughTimePassed) {
        return [
          ...prev.slice(0, -1),
          {
            ...liveSnapshot,
            id: lastSnapshot.id
          }
        ];
      }

      return [...prev, liveSnapshot].slice(-240);
    });
  }, [
    btcBalance,
    currentBtcPrice,
    getSnapshotTimestamp,
    isDataLoading,
    portfolioPerformanceValue,
    portfolioSnapshots,
    usdtBalance
  ]);

  // Filter and format portfolio snapshots for the chart
  useEffect(() => {
    const allSnapshots = [...portfolioSnapshots, ...liveSnapshots]
      .filter(snapshot => Number.isFinite(snapshot.total_value) && snapshot.total_value > 0)
      .sort((a, b) => getSnapshotTimestamp(a) - getSnapshotTimestamp(b));

    if (allSnapshots.length === 0) {
      setFilteredSnapshots([]);
      return;
    }

    let cutoffTime = 0;
    const now = Date.now();
    switch (chartPeriod) {
      case '1W':
        cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case '1M':
        cutoffTime = now - (30 * 24 * 60 * 60 * 1000);
        break;
      case '3M':
        cutoffTime = now - (90 * 24 * 60 * 60 * 1000);
        break;
      case '1Y':
        cutoffTime = now - (365 * 24 * 60 * 60 * 1000);
        break;
      case 'All':
        cutoffTime = 0;
        break;
    }

    const filteredData = cutoffTime > 0
      ? allSnapshots.filter(snapshot => getSnapshotTimestamp(snapshot) >= cutoffTime)
      : allSnapshots;

    setFilteredSnapshots(filteredData.length > 0 ? filteredData : [allSnapshots[allSnapshots.length - 1]]);
  }, [chartPeriod, getSnapshotTimestamp, liveSnapshots, portfolioSnapshots]);

  useEffect(() => {
    if (isDataLoading || portfolioPerformanceValue <= 0 || currentBtcPrice <= 0) {
      return;
    }

    const todaySnapshotDate = new Date().toISOString().split('T')[0];
    const now = Date.now();
    const lastPersistedSnapshot = lastPersistedSnapshotRef.current;
    const valueDelta = lastPersistedSnapshot
      ? Math.abs(lastPersistedSnapshot.value - portfolioPerformanceValue)
      : Number.POSITIVE_INFINITY;
    const shouldPersist = !lastPersistedSnapshot ||
      lastPersistedSnapshot.date !== todaySnapshotDate ||
      (valueDelta >= 1 && now - lastPersistedSnapshot.timestamp >= 60 * 1000);

    if (!shouldPersist) {
      return;
    }

    lastPersistedSnapshotRef.current = {
      date: todaySnapshotDate,
      value: portfolioPerformanceValue,
      timestamp: now
    };
    void createPortfolioSnapshot(portfolioPerformanceValue, usdtBalance, btcBalance, currentBtcPrice);
  }, [btcBalance, createPortfolioSnapshot, currentBtcPrice, isDataLoading, portfolioPerformanceValue, usdtBalance]);
  
  // Get top performing assets
  const getTopPerformingAssets = () => {
    return marketData
      .filter(data => data.price > 0 && data.price !== 104325.3716)
      .sort((a, b) => (b.change_24h ?? 0) - (a.change_24h ?? 0))
      .slice(0, 5);
  };
  
  // Get recent transactions
  const getRecentTransactions = () => {
    return transactions.slice(0, 5);
  };

  // Pagination logic for news
  const indexOfLastNews = currentPage * itemsPerPage;
  const indexOfFirstNews = indexOfLastNews - itemsPerPage;
  const currentNews = newsItems.slice(indexOfFirstNews, indexOfLastNews);
  const totalPages = Math.ceil(newsItems.length / itemsPerPage);

  // Change page
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);
  const nextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));

  // Calculate high, low, and change values for the selected period
  const calculateStats = () => {
    if (filteredSnapshots.length === 0) {
      return {
        high: portfolioPerformanceValue,
        low: portfolioPerformanceValue,
        change: 0,
        changePercentage: 0
      };
    }
    
    const values = filteredSnapshots.map(snapshot => snapshot.total_value);
    const high = Math.max(...values);
    const low = Math.min(...values);
    
    // Calculate change from first to last snapshot
    const firstValue = filteredSnapshots[0].total_value;
    const lastValue = filteredSnapshots[filteredSnapshots.length - 1].total_value;
    const change = lastValue - firstValue;
    const changePercentage = firstValue > 0 ? (change / firstValue) * 100 : 0;
    
    return { high, low, change, changePercentage };
  };
  
  const { high, low, change, changePercentage } = calculateStats();

  const chartSnapshots = filteredSnapshots.length === 1
    ? [
        {
          ...filteredSnapshots[0],
          id: `${filteredSnapshots[0].id}-seed`,
          snapshot_date: new Date(
            new Date(filteredSnapshots[0].snapshot_date).getTime() - (24 * 60 * 60 * 1000)
          ).toISOString().split('T')[0],
          created_at: new Date(
            getSnapshotTimestamp(filteredSnapshots[0]) - (24 * 60 * 60 * 1000)
          ).toISOString()
        },
        filteredSnapshots[0]
      ]
    : filteredSnapshots;
  const xAxisTickStep = Math.max(1, Math.ceil(chartSnapshots.length / 7));
  const chartSnapshotDateCounts = chartSnapshots.reduce((counts, snapshot) => {
    counts.set(snapshot.snapshot_date, (counts.get(snapshot.snapshot_date) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  // Prepare chart data
  const chartData = {
    labels: chartSnapshots.map(snapshot => {
      const sameDayPointCount = chartSnapshotDateCounts.get(snapshot.snapshot_date) || 0;
      const date = new Date(getSnapshotTimestamp(snapshot) || snapshot.snapshot_date);

      if (snapshot.id.startsWith('live-') || sameDayPointCount > 1) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }

      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Portfolio Value',
        data: chartSnapshots.map(snapshot => snapshot.total_value),
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.16)',
        borderWidth: 2,
        pointRadius: chartSnapshots.length <= 2 ? 4 : 0,
        pointHoverRadius: chartSnapshots.length <= 2 ? 6 : 4,
        pointBackgroundColor: '#a855f7',
        pointBorderColor: '#e9d5ff',
        pointBorderWidth: chartSnapshots.length <= 2 ? 2 : 0,
        tension: 0.4,
        fill: true
      }
    ]
  };
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: 'rgba(255, 255, 255, 1)',
        bodyColor: 'rgba(255, 255, 255, 1)',
        borderColor: 'rgba(51, 65, 85, 0.5)',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            return formatFiat(Number(context.raw));
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: 'rgba(148, 163, 184, 1)',
          autoSkip: false,
          maxRotation: 0,
          callback: function(this: any, value: any) {
            const labelIndex = Number(value);
            const lastIndex = chartSnapshots.length - 1;

            if (
              labelIndex === 0 ||
              labelIndex === lastIndex ||
              labelIndex % xAxisTickStep === 0
            ) {
              return this.getLabelForValue(value);
            }

            return '';
          }
        }
      },
      y: {
        grid: {
          color: 'rgba(51, 65, 85, 0.1)'
        },
        ticks: {
          color: 'rgba(148, 163, 184, 1)',
          callback: function(value: any) {
            return formatFiatCompact(Number(value));
          }
        }
      }
    }
  };

  // Get period label for stats
  const getPeriodLabel = () => {
    switch (chartPeriod) {
      case '1W': return '1W';
      case '1M': return '1M';
      case '3M': return '3M';
      case '1Y': return '1Y';
      case 'All': return 'All Time';
      default: return '';
    }
  };

  // Sort market data by market cap for Market Overview section
  const getSortedMarketData = () => {
    // Create a map of market caps from coingeckoMarketCapData
    const marketCapMap = new Map<string, number>();
    const marketImageMap = new Map<string, string>();
    
    if (coingeckoMarketCapData && coingeckoMarketCapData.length > 0) {
      coingeckoMarketCapData.forEach(coin => {
        marketCapMap.set(coin.symbol.toUpperCase(), coin.market_cap);
        if (coin.image) {
          marketImageMap.set(coin.symbol.toUpperCase(), coin.image);
        }
      });
    }
    
    // Build the overview from live crypto pairs so the card works even when the CFD feed has no USDT rows.
    const validMarketData = TOP_CRYPTO_PAIRS.map((pair, index) => {
      const cryptoData = getCryptoDataBySymbol(pair.symbol);
      const price = cryptoData?.price || getBybitPrice(pair.symbol) || 0;
      const baseSymbol = pair.symbol.replace('USDT', '').toUpperCase();

      return {
        symbol: pair.symbol,
        price,
        change_24h: cryptoData?.change_24h ?? 0,
        sortIndex: index,
        iconUrl: marketImageMap.get(baseSymbol) || MARKET_OVERVIEW_ICON_URLS[baseSymbol] || ''
      };
    });
    
    // Sort by market cap (descending)
    return validMarketData.sort((a, b) => {
      // Extract base symbol (remove USDT)
      const aSymbol = a.symbol.replace('USDT', '').toLowerCase();
      const bSymbol = b.symbol.replace('USDT', '').toLowerCase();
      
      // Get market caps from map
      const aMarketCap = marketCapMap.get(aSymbol.toUpperCase()) || 0;
      const bMarketCap = marketCapMap.get(bSymbol.toUpperCase()) || 0;
      
      // Sort by market cap (descending)
      if (bMarketCap !== aMarketCap) {
        return bMarketCap - aMarketCap;
      }

      return a.sortIndex - b.sortIndex;
    }).slice(0, 5); // Take top 5 for display
  };

  const homeBackgroundClass = 'app-page-bg';
  const primaryCardClass = 'rounded-2xl app-surface-raised';
  const secondaryCardClass = 'rounded-2xl app-surface-primary';
  const secondaryItemCardClass = 'rounded-xl app-surface-muted';
  const quickActionCardClass = 'w-full rounded-xl app-surface-raised app-surface-hover p-4 text-white transition-all duration-200 hover:scale-[1.01]';
  const quickActionCtaClass = 'mx-auto flex w-full items-center justify-center gap-2 rounded-xl app-action-soft px-6 py-3 font-semibold transition-all duration-300 sm:w-auto';

  return (
    <div className={`mx-auto w-full px-4 py-4 sm:px-6 sm:py-6 lg:p-8 ${homeBackgroundClass}`}>
      {/* Giveaway Popups */}
      <GiveawayCampaignPopup forceShow={showCampaignPopup} />
      <GiveawayWinnerPopup forceShow={showWinnerPopup} />
      <GiveawayComingSoonPopup forceShow={showComingSoonPopup} />

      {/* Welcome Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="mb-1 text-2xl font-bold text-white sm:mb-2 sm:text-3xl">
            {t('home.welcomeTitle')}
          </h1>
        </div>
        <p className="text-sm text-slate-400 sm:text-base">
          {t('home.welcomeSubtitle')}
        </p>
      </div>
      
      {/* Quick Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        <div className={`${primaryCardClass} p-2.5 sm:p-3.5`}>
          <div className="mb-1 flex items-start gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-purple-500/25">
              <Wallet size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-purple-100">{getPeriodLabel()} {t('home.change')}</div>
              <div className="text-lg font-bold text-white sm:text-xl" translate="no">
                {isDataLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                    <span className="text-sm text-white sm:text-base">Loading...</span>
                  </div>
                ) : (
                  formatFiat(actualPortfolioValue)
                )}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="text-purple-100/80">{getPeriodLabel()} Change</div>
            <div className="text-white" translate="no">
              {isDataLoading ? (
                <span className="text-white">--</span>
              ) : (
                `${changePercentage >= 0 ? '+' : ''}${changePercentage.toFixed(2)}%`
              )}
            </div>
          </div>
        </div>
        
        <div className={`${primaryCardClass} p-2.5 sm:p-3.5`}>
          <div className="mb-1 flex items-start gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-purple-500/25">
              <TrendingUp size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-purple-100">Positions P&amp;L</div>
              <div className="text-lg font-bold text-white sm:text-xl" translate="no">
                {totalPositionsPnl >= 0 ? '+' : ''}{totalPositionsPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="text-purple-100/80">Open Positions</div>
            <div className="text-white" translate="no">{futuresPositions.length}</div>
          </div>
        </div>
        
        <div className={`${primaryCardClass} p-2.5 sm:p-3.5`}>
          <div className="mb-1 flex items-start gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-purple-500/25">
              <Bitcoin size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-purple-100">BTC Price</div>
              <div className="text-lg font-bold text-white sm:text-xl" translate="no">{formatFiat(currentBtcPrice)}</div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="text-purple-100/80">24h Change</div>
            <div className="text-white" translate="no">
              {(getCryptoDataBySymbol('BTCUSDT')?.change_24h ?? 0) >= 0 ? '+' : ''}
              {(getCryptoDataBySymbol('BTCUSDT')?.change_24h ?? 0).toFixed(2)}%
            </div>
          </div>
        </div>
        
        <div className={`${primaryCardClass} p-2.5 sm:p-3.5`}>
          <div className="mb-1 flex items-start gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-purple-500/25">
              <BarChart3 size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-purple-100">Trading Volume</div>
              <div className="text-lg font-bold text-white sm:text-xl" translate="no">{formatFiat(125430.50)}</div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="text-purple-100/80">{getPeriodLabel()} Change</div>
            <div className="text-white" translate="no">+12.5%</div>
          </div>
        </div>
      </div>

      {/* Portfolio Chart */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:mb-8 lg:grid-cols-3">
        <div className={`lg:col-span-2 ${secondaryCardClass} p-4 sm:p-6`}>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-white">Portfolio Performance</h2>
            <div className="flex flex-wrap gap-2">
              {(['1W', '1M', '3M', '1Y', 'All'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setChartPeriod(period)}
                  className={`rounded-lg px-3 py-1 text-sm transition-all ${
                    chartPeriod === period
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-purple-500/25'
                      : 'text-slate-400 hover:bg-blue-500/10 hover:text-white'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          
          <div className="mb-4 h-56 sm:h-64 md:h-72">
            <Line data={chartData} options={chartOptions} />
          </div>
          
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-slate-400">High ({getPeriodLabel()})</div>
              <div className="font-semibold text-white" translate="no">{formatFiat(high)}</div>
            </div>
            <div>
              <div className="text-slate-400">Low ({getPeriodLabel()})</div>
              <div className="font-semibold text-white" translate="no">{formatFiat(low)}</div>
            </div>
            <div>
              <div className="text-slate-400">Change ({getPeriodLabel()})</div>
              <div className={`font-semibold ${change >= 0 ? 'text-purple-400' : 'text-red-400'}`} translate="no">
                {change >= 0 ? '+' : ''}{formatFiat(change)}
              </div>
            </div>
          </div>
        </div>

        {/* Market Overview */}
        <div className={`${secondaryCardClass} p-4 sm:p-6`}>
          <h3 className="text-lg font-bold text-white mb-4">Market Overview</h3>
          <div className="space-y-3">
            {getSortedMarketData().map((data) => {
              const cryptoData = getCryptoDataBySymbol(data.symbol);
              const change24h = cryptoData?.change_24h ?? data.change_24h ?? 0;
              return (
                <div key={data.symbol} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500/16 to-purple-500/18">
                      {data.iconUrl ? (
                        <img
                          src={data.iconUrl}
                          alt={`${data.symbol.replace('USDT', '')} logo`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-white text-xs font-bold">
                          {data.symbol.replace('USDT', '').slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-white font-medium">{data.symbol.replace('USDT', '')}</div>
                      <div className="text-sm text-slate-400" translate="no">{formatFiat(data.price)}</div>
                    </div>
                  </div>
                  <div className={`shrink-0 text-sm font-medium ${change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`} translate="no">
                    {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <div className={`${secondaryCardClass}`}>
        <div className="flex overflow-x-auto border-b border-slate-700/50">
          {(['overview', 'positions', 'transactions'] as const).map((tab) => (
            <button
              key={tab}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium capitalize transition-all sm:px-6 sm:py-4 sm:text-base ${
                  activeTab === tab
                  ? 'border-b-2 border-purple-400 bg-gradient-to-r from-blue-500/18 to-purple-500/16 text-purple-300'
                  : 'text-slate-400 hover:bg-blue-500/10 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Quick Actions */}
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setTradingMode('spot')}
                    className={quickActionCardClass}
                  >
                    <div className="flex items-center gap-3">
                      <Repeat size={20} />
                      <div className="min-w-0 text-left">
                        <div className="font-semibold">Spot Trading</div>
                        <div className="text-sm opacity-80">Buy & Sell Crypto</div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setTradingMode('futures')}
                    className={quickActionCardClass}
                  >
                    <div className="flex items-center gap-3">
                      <TrendingUp size={20} />
                      <div className="min-w-0 text-left">
                        <div className="font-semibold">Futures</div>
                        <div className="text-sm opacity-80">Leverage Trading</div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setTradingMode('binary')}
                    className={quickActionCardClass}
                  >
                    <div className="flex items-center gap-3">
                      <Activity size={20} />
                      <div className="min-w-0 text-left">
                        <div className="font-semibold">Binary Options</div>
                        <div className="text-sm opacity-80">Quick Predictions</div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setTradingMode('wallet')}
                    className={quickActionCardClass}
                  >
                    <div className="flex items-center gap-3">
                      <Wallet size={20} />
                      <div className="min-w-0 text-left">
                        <div className="font-semibold">Wallet</div>
                        <div className="text-sm opacity-80">Manage Funds</div>
                      </div>
                    </div>
                  </button>
                </div>
                
                <div className="mt-6 text-center">
                  <p className="mb-4 text-sm text-slate-400">
                    {t('home.swapDescription')}
                  </p>
                  <button
                    onClick={() => setTradingMode('swap')}
                    className={quickActionCtaClass}
                  >
                    <ArrowRight size={18} />
                    {t('home.tradeNow')}
                  </button>
                </div>
              </div>
              
              {/* Recent Transactions */}
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white mb-4">{t('home.recentTransactions')}</h3>
                <div className="space-y-3">
                  {getRecentTransactions().length > 0 ? (
                    getRecentTransactions().slice(0, 4).map((transaction, index) => (
                      <div key={index} className={`flex flex-col gap-4 ${secondaryItemCardClass} p-4 sm:flex-row sm:items-center sm:justify-between`}>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            transaction.amount > 0 ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20' : 'bg-red-500/20'
                          }`}>
                            {transaction.amount > 0 ? (
                              <ArrowDownRight size={16} className="text-purple-400" />
                            ) : (
                              <ArrowUpRight size={16} className="text-red-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-white font-medium">{transaction.description}</div>
                            <div className="text-sm text-slate-400">
                              {formatDate(transaction.created_at || transaction.timestamp)}
                            </div>
                          </div>
                        </div>
                        <div className={`text-left font-bold sm:text-right ${transaction.amount > 0 ? 'text-purple-400' : 'text-red-400'}`}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)} USDT
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-slate-400">
                      <Package size={48} className="mx-auto mb-4 opacity-50" />
                      <p className="mb-2">{t('home.noTransactions')}</p>
                      <button
                        onClick={() => setTradingMode('wallet')}
                        className="text-purple-400 transition-colors hover:text-purple-300"
                      >
                        {t('home.goToWallet')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'positions' && (
            <div className="space-y-4">
              {futuresPositions.length > 0 ? (
                futuresPositions.map((position, index) => {
                  // Get live price from market data context first, then fallback to position data
                  let currentPrice = 0;
                  const livePrice = getPriceBySymbol(position.symbol);
                  if (livePrice > 0) {
                    currentPrice = livePrice;
                  } else {
                    currentPrice = position.currentPrice || position.current_price || 0;
                  }
                  
                  const entryPrice = position.entryPrice || position.entry_price || 0;
                  const amount = position.amount || 0;
                  const side = position.side || 'long';
                  
                  // Calculate unrealized PnL based on live price (WITHOUT leverage multiplier)
                  let unrealizedPnl = 0;
                  if (side === 'long') {
                    unrealizedPnl = (currentPrice - entryPrice) * amount;
                  } else {
                    unrealizedPnl = (entryPrice - currentPrice) * amount;
                  }
                  
                  return (
                    <div key={position.id || index} className={`flex flex-col gap-4 ${secondaryItemCardClass} p-4 sm:flex-row sm:items-center sm:justify-between`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          side === 'long' ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20' : 'bg-red-500/20'
                        }`}>
                          {side === 'long' ? (
                            <TrendingUp size={16} className="text-purple-400" />
                          ) : (
                            <TrendingDown size={16} className="text-red-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-white font-medium">{position.symbol}</div>
                          <div className="text-sm text-slate-400">
                            {side.toUpperCase()} • {position.leverage || 1}x
                          </div>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className={`font-bold ${unrealizedPnl >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                          {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)} USDT
                        </div>
                        <div className="text-sm text-slate-400">
                          ${entryPrice.toFixed(2)} → ${currentPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400">
                  <Package size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="mb-2">{t('home.noPositions')}</p>
                  <button
                    onClick={() => setTradingMode('futures')}
                    className="text-purple-400 transition-colors hover:text-purple-300"
                  >
                    {t('home.startTrading')}
                  </button>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              {getRecentTransactions().length > 0 ? (
                getRecentTransactions().map((transaction, index) => (
                  <div key={index} className={`flex flex-col gap-4 ${secondaryItemCardClass} p-4 sm:flex-row sm:items-center sm:justify-between`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        transaction.amount > 0 ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20' : 'bg-red-500/20'
                      }`}>
                        {transaction.amount > 0 ? (
                          <ArrowDownRight size={16} className="text-purple-400" />
                        ) : (
                          <ArrowUpRight size={16} className="text-red-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-white font-medium">{transaction.description}</div>
                        <div className="text-sm text-slate-400">
                          {formatDate(transaction.created_at || transaction.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className={`text-left font-bold sm:text-right ${transaction.amount > 0 ? 'text-purple-400' : 'text-red-400'}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)} USDT
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400">
                  <Package size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="mb-2">{t('home.noTransactions')}</p>
                  <button
                    onClick={() => setTradingMode('wallet')}
                    className="text-purple-400 transition-colors hover:text-purple-300"
                  >
                    {t('home.goToWallet')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* News Section */}
      <div className={`mt-8 ${secondaryCardClass} p-4 sm:p-6`}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-purple-500/25">
              <Newspaper size={20} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold text-white">{t('home.marketNews')}</h2>
          </div>
          <div className="w-fit rounded-full border border-purple-500/20 bg-gradient-to-r from-blue-500/12 to-purple-500/14 px-3 py-1 text-xs text-purple-200">
            {newsItems.length} articles
          </div>
        </div>
        
        <div className="space-y-6">
          {currentNews.length > 0 ? (
            currentNews.map((news, index) => (
              <div key={news.id || index} className={`${secondaryItemCardClass} p-4 transition-all duration-300 hover:border-purple-500/40 sm:p-6`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                  {news.image_url && (
                    <div className="h-40 w-full overflow-hidden rounded-lg sm:h-24 sm:w-24 sm:flex-shrink-0">
                      <img 
                        src={news.image_url} 
                        alt={news.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium uppercase tracking-wide ${
                        news.category === 'crypto' ? 'bg-gradient-to-r from-blue-500/18 to-purple-500/20 text-purple-400' :
                        news.category === 'markets' ? 'bg-blue-500/20 text-blue-400' :
                        news.category === 'economy' ? 'bg-green-500/20 text-green-400' :
                        news.category === 'technology' ? 'bg-gradient-to-r from-blue-500/18 to-purple-500/20 text-purple-400' :
                        'bg-indigo-500/20 text-indigo-400'
                      }`}>
                        {news.category}
                      </span>
                      <span className="text-xs text-slate-400">{news.source}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-400">
                        {new Date(news.published_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="mb-3 text-base font-semibold leading-relaxed text-white sm:text-lg">{news.title}</h3>
                    <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-slate-300">{news.summary}</p>
                    <a 
                      href={news.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-purple-400 transition-colors hover:text-purple-300"
                    >
                      {t('home.readMore')}
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-slate-400">
              <Newspaper size={64} className="mx-auto mb-6 opacity-50" />
              <p className="text-lg mb-2">{t('home.noNewsAvailable')}</p>
              <p className="text-sm text-slate-400">{t('home.checkBackLater')}</p>
            </div>
          )}
        </div>
        
        {/* News Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex flex-col gap-4 border-t border-slate-700/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              {t('home.pageInfo', { current: currentPage, total: totalPages })}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={prevPage}
                disabled={currentPage === 1}
                className="rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/12 p-2 text-slate-400 transition-all duration-200 hover:bg-gradient-to-r hover:from-blue-500/16 hover:to-purple-500/18 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-4 text-sm text-slate-300">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={nextPage}
                disabled={currentPage === totalPages}
                className="rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/12 p-2 text-slate-400 transition-all duration-200 hover:bg-gradient-to-r hover:from-blue-500/16 hover:to-purple-500/18 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
