import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Users, 
  DollarSign, 
  Clock, 
  Filter,
  Search,
  Star,
  BarChart3,
  Target,
  Zap,
  Award,
  Globe,
  Briefcase,
  Gamepad2,
  Bitcoin,
  Cpu,
  Plus,
  Minus,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  TrendingUp as Trending,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Info
} from 'lucide-react';
import { DatabaseEvent, DatabaseEventOutcome, DatabaseEventBet } from '../hooks/useDatabase';

interface EventBettingPageProps {
  events: DatabaseEvent[];
  eventOutcomes: DatabaseEventOutcome[];
  eventBets: DatabaseEventBet[];
  usdtBalance: number;
  onEventBet: (outcomeId: string, side: 'buy' | 'sell', amount: number, price: number, leverage?: number) => void;
  realtimeConnected?: boolean;
}

const EventBettingPage: React.FC<EventBettingPageProps> = ({
  events,
  eventOutcomes,
  eventBets,
  usdtBalance,
  onEventBet,
  realtimeConnected = false
}) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'markets' | 'my_bets'>('markets');
  const [leverage, setLeverage] = useState(1);
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const marketsPerPage = 30;

  const categories = [
    { id: 'all', name: t('events.categories.all'), icon: Globe },
    { id: 'politics', name: t('events.categories.politics'), icon: Briefcase },
    { id: 'sports', name: t('events.categories.sports'), icon: Award },
    { id: 'crypto', name: t('events.categories.crypto'), icon: Bitcoin },
    { id: 'economy', name: t('events.categories.economy'), icon: BarChart3 },
    { id: 'tech', name: t('events.categories.tech'), icon: Cpu },
    { id: 'general', name: t('events.categories.general'), icon: Gamepad2 }
  ];

  const leverageOptions = [1, 2, 3, 5, 10];

  // Purple theme classes like Home component
  const homeBackgroundClass = 'app-page-bg';
  const primaryCardClass = 'rounded-2xl app-surface-raised';
  const secondaryCardClass = 'rounded-2xl app-surface-primary';
  const secondaryItemCardClass = 'rounded-xl app-surface-muted';
  const quickActionCardClass = 'w-full rounded-xl app-surface-raised app-surface-hover p-4 text-white transition-all duration-200 hover:scale-[1.01]';
  const quickActionCtaClass = 'mx-auto flex w-full items-center justify-center gap-2 rounded-xl app-action-soft px-6 py-3 font-semibold transition-all duration-300 sm:w-auto';
  const primarySurfaceBackgroundClass = 'app-surface-raised';
  const secondarySurfaceBackgroundClass = 'app-surface-primary';
  const itemSurfaceBackgroundClass = 'app-surface-muted';
  const itemSurfaceHoverBackgroundClass = 'app-surface-hover';
  const actionBackgroundClass = 'app-action-soft';
  const actionHoverBackgroundClass = '';
  const activeControlBackgroundClass = 'app-action-primary';
  const activeTabBackgroundClass = 'app-action-soft';
  const hoverControlBackgroundClass = 'hover:bg-sky-500/10';
  const iconBackgroundClass = 'app-icon-tile';
  const softIconBackgroundClass = 'app-surface-muted';

  // Filter events based on category and search
  const filteredEvents = events.filter(event => {
    const matchesCategory = selectedCategory === 'all' || event.category === selectedCategory;
    const matchesSearch = event.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (event.description && event.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredEvents.length / marketsPerPage);
  const indexOfLastMarket = currentPage * marketsPerPage;
  const indexOfFirstMarket = indexOfLastMarket - marketsPerPage;
  const currentMarkets = filteredEvents.slice(indexOfFirstMarket, indexOfLastMarket);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, searchTerm]);

  // Pagination handlers
  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  // Get outcomes for a specific event
  const getEventOutcomes = (eventId: string) => {
    return eventOutcomes.filter(outcome => outcome.event_id === eventId);
  };

  // Get user's bets for a specific outcome
  const getUserBetsForOutcome = (outcomeId: string) => {
    return eventBets.filter(bet => bet.outcome_id === outcomeId);
  };

  // Calculate total volume for an event
  const getEventVolume = (eventId: string) => {
    const outcomes = getEventOutcomes(eventId);
    return outcomes.reduce((total, outcome) => total + outcome.total_volume, 0);
  };

  // Check if an event is open for betting
  const isEventOpen = (event: DatabaseEvent) => {
    // Check if the event status is 'open'
    if (event.status !== 'open') return false;
    
    // Check if the event has an end date and if it's in the future
    if (event.end_date) {
      const endDate = new Date(event.end_date);
      const now = new Date();
      if (endDate <= now) return false;
    }
    
    return true;
  };

  // Format time remaining
  const getTimeRemaining = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return 'Ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  // Calculate leveraged exposure
  const calculateLeveragedExposure = (amount: number, price: number, leverage: number) => {
    const baseShares = amount / price;
    const leveragedShares = baseShares * leverage;
    const totalCost = amount; // User only pays the base amount
    const potentialPayout = leveragedShares * 1; // Max payout per share is $1
    const potentialProfit = potentialPayout - totalCost;
    
    return {
      shares: leveragedShares,
      cost: totalCost,
      potentialPayout,
      potentialProfit,
      roi: (potentialProfit / totalCost) * 100
    };
  };

  // Handle leveraged bet placement
  const handleLeveragedBet = async (outcomeId: string, side: 'buy' | 'sell') => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const amount = parseFloat(betAmount);
      if (!amount || amount <= 0) {
        alert('Please enter a valid bet amount');
        return;
      }

      const outcome = eventOutcomes.find(o => o.id === outcomeId);
      if (!outcome) return;

      const price = outcome.current_price;
      const leveragedCost = amount * leverage;

      if (leveragedCost > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
        alert('Insufficient balance for leveraged position');
        return;
      }

      await onEventBet(outcomeId, side, amount, price, leverage);
      setBetAmount('');
      setSelectedOutcome(null);
      setLeverage(1);
      setShowLeverageModal(false);
    } catch (error) {
      console.error('Error placing bet:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle bet placement
  const handleBet = async (outcomeId: string, side: 'buy' | 'sell') => {
    if (isSubmitting) return;
    
    if (leverage > 1) {
      setShowLeverageModal(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const amount = parseFloat(betAmount);
      if (!amount || amount <= 0) {
        alert('Please enter a valid bet amount');
        return;
      }

      const outcome = eventOutcomes.find(o => o.id === outcomeId);
      if (!outcome) return;

      const price = outcome.current_price;
      const totalCost = amount * price;

      if (totalCost > (availableBalance || usdtBalance)) {
        alert('Insufficient balance');
        return;
      }

      await onEventBet(outcomeId, side, amount, price);
      setBetAmount('');
      setSelectedOutcome(null);
    } catch (error) {
      console.error('Error placing bet:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    const categoryData = categories.find(c => c.id === category);
    return categoryData?.icon || Globe;
  };

  // Format probability display for Manifold Markets
  const formatProbability = (outcome: DatabaseEventOutcome) => {
    const percentage = (outcome.current_price * 100).toFixed(1);
    
    // For Yes/No outcomes from Manifold Markets
    if (outcome.outcome_name === 'Yes') {
      return `${percentage}% Yes`;
    } else if (outcome.outcome_name === 'No') {
      return `${percentage}% No`;
    }
    
    // Fallback for other outcome types
    return `${percentage}%`;
  };

  // Get event details for a bet
  const getEventForBet = (bet: DatabaseEventBet) => {
    const outcome = eventOutcomes.find(o => o.id === bet.outcome_id);
    if (!outcome) return null;
    
    const event = events.find(e => e.id === outcome.event_id);
    return { event, outcome };
  };

  // Calculate current bet value
  const calculateBetValue = (bet: DatabaseEventBet) => {
    const outcome = eventOutcomes.find(o => o.id === bet.outcome_id);
    if (!outcome) return { currentValue: 0, pnl: 0, pnlPercentage: 0 };
    
    const currentValue = bet.shares * outcome.current_price;
    const pnl = currentValue - bet.amount;
    const pnlPercentage = (pnl / bet.amount) * 100;
    
    return { currentValue, pnl, pnlPercentage };
  };

  return (
    <div className={`min-h-screen ${homeBackgroundClass} text-white relative overflow-hidden`}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 ${iconBackgroundClass} rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25`}>
              <Target size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent">
                {t('events.title')}
              </h1>
              <p className="text-slate-400 text-sm md:text-lg">{t('events.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`${primarySurfaceBackgroundClass} backdrop-blur-sm px-4 py-3 rounded-xl border border-purple-500/35 shadow-lg w-full md:w-auto`}>
              <div className="text-slate-400 text-xs">{t('wallet.availableBalance')}</div>
              <div className="text-white font-mono text-lg">${usdtBalance.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Main Navigation */}
        <div className="flex flex-col space-y-4 mb-6">
          {/* Markets/My Bets Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveSubTab('markets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeSubTab === 'markets'
                  ? `${activeControlBackgroundClass} text-white shadow-lg shadow-purple-500/25 transform scale-105`
                  : `text-slate-400 ${hoverControlBackgroundClass} hover:text-white border border-purple-500/25`
              }`}
            >
              <BarChart3 size={16} />
              {t('events.markets')}
            </button>
            <button
              onClick={() => setActiveSubTab('my_bets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeSubTab === 'my_bets'
                  ? `${activeControlBackgroundClass} text-white shadow-lg shadow-purple-500/25 transform scale-105`
                  : `text-slate-400 ${hoverControlBackgroundClass} hover:text-white border border-purple-500/25`
              }`}
            >
              <Activity size={16} />
              {t('events.myBets')} ({eventBets.length})
            </button>
          </div>

          {/* Category Filter (only show for markets) */}
          {activeSubTab === 'markets' && (
            <>
              {/* Category filters in a scrollable container */}
              <div className="overflow-x-auto pb-2 hide-scrollbar">
                <div className="flex gap-2 whitespace-nowrap">
                  {categories.map((category) => {
                    const Icon = category.icon;
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                          selectedCategory === category.id
                            ? `${activeControlBackgroundClass} text-white shadow-lg shadow-purple-500/25 transform scale-105`
                            : `text-slate-400 ${hoverControlBackgroundClass} hover:text-white border border-purple-500/25`
                        }`}
                      >
                        <Icon size={16} />
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search */}
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder={t('events.searchEvents')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full bg-purple-950/70 ${itemSurfaceBackgroundClass} text-white pl-10 pr-4 py-3 rounded-xl border border-purple-500/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/55 transition-all ${itemSurfaceHoverBackgroundClass} hover:border-purple-400/50`}
                />
              </div>
            </>
          )}
        </div>

        {/* Content */}
        {activeSubTab === 'markets' ? (
          <>
            {/* Market Stats */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
              <div className="text-slate-400 text-xs">
                {t('events.showingResults', { 
                  start: indexOfFirstMarket + 1, 
                  end: Math.min(indexOfLastMarket, filteredEvents.length), 
                  total: filteredEvents.length 
                })}
              </div>
              <div className="text-slate-400 text-xs">
                {t('events.pageInfo', { current: currentPage, total: totalPages })}
              </div>
            </div>

            {/* Events Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
              {currentMarkets.map((event) => {
                const outcomes = getEventOutcomes(event.id);
                const volume = getEventVolume(event.id);
                const timeRemaining = event.end_date ? getTimeRemaining(event.end_date) : 'No deadline';
                const CategoryIcon = getCategoryIcon(event.category);
                const eventOpen = isEventOpen(event);

                return (
                  <div
                    key={event.id}
                    className={`${secondarySurfaceBackgroundClass} backdrop-blur-sm rounded-xl p-4 md:p-6 border ${
                      eventOpen 
                        ? `${itemSurfaceHoverBackgroundClass} border-purple-500/35 shadow-2xl hover:border-purple-400/55 transition-all duration-300 hover:transform hover:scale-105` 
                        : 'border-red-700/30 shadow-2xl opacity-80'
                    }`}
                  >
                    {/* Event Header */}
                    <div className="flex items-start justify-between mb-3 md:mb-4">
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className={`w-7 h-7 md:w-8 md:h-8 ${iconBackgroundClass} rounded-lg flex items-center justify-center`}>
                          <CategoryIcon size={16} className="text-white" />
                        </div>
                        <span className="text-xs text-purple-400 font-medium uppercase tracking-wide">
                          {event.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 md:gap-2 text-xs">
                        <Clock size={12} />
                        <span className={eventOpen ? 'text-slate-400' : 'text-red-400'}>
                          {timeRemaining}
                        </span>
                      </div>
                    </div>

                    {/* Event Question */}
                    <h3 className="text-base md:text-lg font-semibold text-white mb-2 md:mb-3 line-clamp-2">
                      {event.question}
                    </h3>

                    {/* Event Description */}
                    {event.description && (
                      <p className="text-slate-400 text-xs md:text-sm mb-3 md:mb-4 line-clamp-2">
                        {event.description}
                      </p>
                    )}

                    {/* Event Stats */}
                    <div className="flex items-center justify-between mb-4 md:mb-6 text-xs">
                      <div className="flex items-center gap-1 text-slate-400">
                        <DollarSign size={12} />
                        <span>${volume.toFixed(0)} {t('events.volume')}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Users size={12} />
                        <span>{eventBets.filter(bet => outcomes.some(o => o.id === bet.outcome_id)).length} {t('events.bets')}</span>
                      </div>
                      {!eventOpen && (
                        <div className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">
                          {t('events.closed')}
                        </div>
                      )}
                    </div>

                    {/* Outcomes */}
                    <div className="space-y-2 md:space-y-3">
                      {outcomes.map((outcome) => {
                        const userBets = getUserBetsForOutcome(outcome.id);
                        const isSelected = selectedOutcome === outcome.id;

                        return (
                          <div
                            key={outcome.id}
                            className={`${itemSurfaceBackgroundClass} rounded-lg md:rounded-xl p-3 md:p-4 border transition-all duration-300 ${
                              isSelected ? 'border-purple-400/60 shadow-lg shadow-purple-500/20' : 'border-purple-500/25 hover:border-purple-400/50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2 md:mb-3">
                              <span className="font-medium text-white text-sm md:text-base">{outcome.outcome_name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-purple-400 font-bold text-sm md:text-base">{formatProbability(outcome)}</span>
                                <span className="text-slate-400 text-xs md:text-sm">${outcome.current_price.toFixed(3)}</span>
                              </div>
                            </div>

                            {/* Betting Interface */}
                            {isSelected ? (
                              <div className="space-y-3">
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    placeholder={`${t('common.amount')} ($)`}
                                    value={betAmount}
                                    onChange={(e) => setBetAmount(e.target.value)}
                                    className={`flex-1 ${itemSurfaceBackgroundClass} text-white px-3 py-2 rounded-lg border border-purple-500/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm`}
                                  />
                                  <div className="text-slate-400 text-sm py-2">
                                    ≈ {(parseFloat(betAmount) / outcome.current_price || 0).toFixed(2)} {t('events.shares')}
                                  </div>
                                </div>

                                {/* Leverage Selector */}
                                <div className={`${itemSurfaceBackgroundClass} rounded-lg p-3 border border-purple-500/25`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-slate-400 text-sm">{t('events.leverage')}</span>
                                    <span className="text-orange-400 font-bold">{leverage}x</span>
                                  </div>
                                  <div className="flex gap-1">
                                    {leverageOptions.map((lev) => (
                                      <button
                                        key={lev}
                                        onClick={() => setLeverage(lev)}
                                        className={`flex-1 py-1 text-xs rounded font-medium transition-all duration-300 ${
                                          leverage === lev
                                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25'
                                            : `${itemSurfaceBackgroundClass} text-slate-400 ${itemSurfaceHoverBackgroundClass} hover:text-white`
                                        }`}
                                      >
                                        {lev}x
                                      </button>
                                    ))}
                                  </div>
                                  {leverage > 1 && (
                                    <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                                      <AlertTriangle size={12} />
                                      <span>{t('events.leveragedPosition', { leverage })}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleBet(outcome.id, 'buy')}
                                    disabled={isSubmitting || !eventOpen}
                                    className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-slate-700 disabled:to-slate-800 text-white py-2 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1"
                                  >
                                    {isSubmitting ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <>
                                        <ArrowUpRight size={14} />
                                        {eventOpen ? t('events.buyOutcome', { outcome: outcome.outcome_name }) : t('events.bettingClosed')}
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleBet(outcome.id, 'sell')}
                                    disabled={isSubmitting || !eventOpen}
                                    className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-slate-700 disabled:to-slate-800 text-white py-2 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center gap-1"
                                  >
                                    {isSubmitting ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <>
                                        <ArrowDownRight size={14} />
                                        {eventOpen ? t('events.sellOutcome', { outcome: outcome.outcome_name }) : t('events.bettingClosed')}
                                      </>
                                    )}
                                  </button>
                                </div>
                                <button
                                  onClick={() => setSelectedOutcome(null)}
                                  className="w-full text-slate-400 hover:text-white text-xs md:text-sm py-1 transition-colors"
                                >
                                  {t('events.cancel')}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setSelectedOutcome(outcome.id)}
                                disabled={!eventOpen}
                                className={`w-full ${
                                  eventOpen 
                                    ? `${actionBackgroundClass} ${actionHoverBackgroundClass} text-purple-200 border-purple-500/40 hover:border-purple-400/55` 
                                    : `${activeTabBackgroundClass} text-slate-500 border-purple-500/20 cursor-not-allowed opacity-60`
                                } py-2 px-3 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 border`}
                              >
                                {eventOpen ? t('events.placeBet') : t('events.bettingClosed')}
                              </button>
                            )}

                            {/* User's Position */}
                            {userBets.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-purple-500/20">
                                <div className="text-xs text-slate-400 mb-1">{t('events.position')}:</div>
                                {userBets.map((bet, index) => (
                                  <div key={index} className="flex justify-between text-xs">
                                    <span className="text-slate-300">{bet.shares.toFixed(2)} {t('events.shares')} @ ${bet.price_at_bet.toFixed(3)}</span>
                                    <span className={`font-medium ${bet.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {bet.side === 'buy' ? t('events.long') : t('events.short')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Empty State */}
              {currentMarkets.length === 0 && (
                <div className="col-span-full text-center py-16">
                  <div className={`w-16 h-16 md:w-24 md:h-24 ${softIconBackgroundClass} rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6`}>
                    <Target size={24} md:size={32} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold text-white mb-2">{t('events.noEventsFound')}</h3>
                  <p className="text-slate-400 text-sm md:text-base">
                    {searchTerm ? t('events.adjustSearchTerms') : t('events.checkBackLater')}
                  </p>
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6 md:mt-8">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-medium transition-all duration-300 ${
                    currentPage === 1
                      ? `${activeTabBackgroundClass} text-slate-500 border border-purple-500/20 cursor-not-allowed opacity-60`
                      : `${itemSurfaceBackgroundClass} text-slate-300 ${itemSurfaceHoverBackgroundClass} hover:text-white border border-purple-500/25 hover:border-purple-400/45`
                  }`}
                >
                  <ChevronLeft size={16} />
                  {t('events.previous')}
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs md:text-sm">
                    {t('events.pageInfo', { current: currentPage, total: totalPages })}
                  </span>
                </div>

                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-medium transition-all duration-300 ${
                    currentPage === totalPages
                      ? `${activeTabBackgroundClass} text-slate-500 border border-purple-500/20 cursor-not-allowed opacity-60`
                      : `${itemSurfaceBackgroundClass} text-slate-300 ${itemSurfaceHoverBackgroundClass} hover:text-white border border-purple-500/25 hover:border-purple-400/45`
                  }`}
                >
                  {t('events.next')}
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        ) : (
          /* My Bets Section */
          <div className="space-y-6">
            {/* Portfolio Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
              <div className={`${primarySurfaceBackgroundClass} backdrop-blur-sm rounded-xl p-4 md:p-6 border border-purple-500/35 shadow-lg`}>
                <div className="flex items-center gap-2 md:gap-3 mb-2">
                  <Activity size={18} md:size={20} className="text-purple-400" />
                  <span className="text-slate-400 text-xs md:text-sm">{t('events.activeBets')}</span>
                </div>
                <div className="text-xl md:text-2xl font-bold text-white">{eventBets.length}</div>
              </div>
              
              <div className={`${primarySurfaceBackgroundClass} backdrop-blur-sm rounded-xl p-4 md:p-6 border border-purple-500/35 shadow-lg`}>
                <div className="flex items-center gap-2 md:gap-3 mb-2">
                  <DollarSign size={18} md:size={20} className="text-emerald-400" />
                  <span className="text-slate-400 text-xs md:text-sm">{t('events.totalInvested')}</span>
                </div>
                <div className="text-xl md:text-2xl font-bold text-white">
                  ${eventBets.reduce((sum, bet) => sum + bet.amount, 0).toFixed(2)}
                </div>
              </div>
              
              <div className={`${primarySurfaceBackgroundClass} backdrop-blur-sm rounded-xl p-4 md:p-6 border border-purple-500/35 shadow-lg`}>
                <div className="flex items-center gap-2 md:gap-3 mb-2">
                  <Trending size={18} md:size={20} className="text-cyan-400" />
                  <span className="text-slate-400 text-xs md:text-sm">{t('events.currentValue')}</span>
                </div>
                <div className="text-xl md:text-2xl font-bold text-white">
                  ${eventBets.reduce((sum, bet) => {
                    const { currentValue } = calculateBetValue(bet);
                    return sum + currentValue;
                  }, 0).toFixed(2)}
                </div>
              </div>
              
              <div className={`${primarySurfaceBackgroundClass} backdrop-blur-sm rounded-xl p-4 md:p-6 border border-purple-500/35 shadow-lg`}>
                <div className="flex items-center gap-2 md:gap-3 mb-2">
                  <BarChart3 size={18} md:size={20} className="text-amber-400" />
                  <span className="text-slate-400 text-xs md:text-sm">{t('events.totalPnl')}</span>
                </div>
                <div className={`text-xl md:text-2xl font-bold ${
                  eventBets.reduce((sum, bet) => {
                    const { pnl } = calculateBetValue(bet);
                    return sum + pnl;
                  }, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  ${eventBets.reduce((sum, bet) => {
                    const { pnl } = calculateBetValue(bet);
                    return sum + pnl;
                  }, 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Active Bets List */}
            {eventBets.length > 0 ? (
              <div className="space-y-4">
                {eventBets.map((bet) => {
                  const eventData = getEventForBet(bet);
                  if (!eventData) return null;
                  
                  const { event, outcome } = eventData;
                  const { currentValue, pnl, pnlPercentage } = calculateBetValue(bet);
                  const CategoryIcon = getCategoryIcon(event.category);

                  return (
                    <div key={bet.id} className={`${itemSurfaceBackgroundClass} backdrop-blur-sm rounded-xl p-4 md:p-6 border border-purple-500/30 shadow-lg ${itemSurfaceHoverBackgroundClass} hover:border-purple-400/50 transition-all duration-300`}>
                      <div className="flex flex-col md:flex-row md:items-start justify-between mb-4 gap-3">
                        <div className="flex items-start gap-3 md:gap-4 flex-1">
                          <div className={`w-10 h-10 ${iconBackgroundClass} rounded-lg flex items-center justify-center`}>
                            <CategoryIcon size={20} className="text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs text-purple-400 font-medium uppercase tracking-wide">
                                {event.category}
                              </span>
                              <span className={`text-xs font-bold px-2 py-1 rounded ${
                                bet.side === 'buy' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
                              }`}>
                                {bet.side === 'buy' ? t('events.long') : t('events.short')}
                              </span>
                              {bet.leverage && bet.leverage > 1 && (
                                <span className="text-xs font-bold px-2 py-1 rounded bg-orange-400/10 text-orange-400">
                                  {bet.leverage}x
                                </span>
                              )}
                            </div>
                            <h4 className="font-semibold text-white mb-1 line-clamp-2 text-sm md:text-base">{event.question}</h4>
                            <div className="text-slate-400 text-xs md:text-sm">
                              {t('events.outcome')}: <span className="text-white font-medium">{outcome.outcome_name}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-slate-400 text-xs mb-1">{t('events.currentValue')}</div>
                          <div className="text-white font-bold text-base md:text-lg">${currentValue.toFixed(2)}</div>
                          <div className={`text-xs md:text-sm font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(1)}%)
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-xs md:text-sm">
                        <div>
                          <span className="text-slate-400">{t('events.shares')}</span>
                          <div className="text-white font-mono">{bet.shares.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-slate-400">{t('events.entryPrice')}</span>
                          <div className="text-white font-mono">${bet.price_at_bet.toFixed(3)}</div>
                        </div>
                        <div>
                          <span className="text-slate-400">{t('events.currentPrice')}</span>
                          <div className="text-white font-mono">${outcome.current_price.toFixed(3)}</div>
                        </div>
                        <div>
                          <span className="text-slate-400">{t('events.invested')}</span>
                          <div className="text-white font-mono">${bet.amount.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className={`w-16 h-16 md:w-24 md:h-24 ${softIconBackgroundClass} rounded-full flex items-center justify-center mx-auto mb-6`}>
                  <Activity size={24} md:size={32} className="text-slate-400" />
                </div>
                <h3 className="text-lg md:text-xl font-semibold text-white mb-2">{t('events.noActiveBets')}</h3>
                <p className="text-slate-400 mb-6">{t('events.predictFuture')}</p>
                <button
                  onClick={() => setActiveSubTab('markets')}
                  className={`${actionBackgroundClass} ${actionHoverBackgroundClass} text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-purple-500/25 transform hover:scale-105`}
                >
                  {t('events.browseMarkets')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leverage Confirmation Modal */}
      {showLeverageModal && selectedOutcome && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className={`${secondarySurfaceBackgroundClass} rounded-xl max-w-md w-full p-6 border border-purple-500/35 shadow-2xl`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
                <Layers size={20} className="text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white">{t('events.confirmPosition', { leverage })}</h3>
            </div>
            
            <div className="space-y-4">
              <div className={`${itemSurfaceBackgroundClass} rounded-lg p-4`}>
                <div className="text-slate-400 text-sm mb-2">{t('events.positionDetails')}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('common.amount')}:</span>
                    <span className="text-white">${betAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('events.leverage')}:</span>
                    <span className="text-orange-400 font-bold">{leverage}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('events.effectiveExposure')}:</span>
                    <span className="text-white">${(parseFloat(betAmount) * leverage).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-400 mb-2">
                  <AlertTriangle size={16} />
                  <span className="font-medium">{t('events.leverageWarning')}</span>
                </div>
                <p className="text-amber-300 text-sm">
                  {t('events.leveragedPositions')}
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeverageModal(false)}
                  disabled={isSubmitting}
                  className={`flex-1 ${itemSurfaceBackgroundClass} ${itemSurfaceHoverBackgroundClass} text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50`}
                >
                  {t('events.cancel')}
                </button>
                <button
                  onClick={() => handleLeveragedBet(selectedOutcome, 'buy')}
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-slate-700 disabled:to-slate-800 text-white py-3 rounded-lg font-medium transition-all duration-300 shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    t('events.confirmPosition', { leverage })
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventBettingPage;
