import React, { useState, useEffect, useRef } from 'react';
import { ArrowDown, RefreshCw, Info, DollarSign, Bitcoin, AlertTriangle, Search, ChevronDown, X, CheckCircle } from 'lucide-react';
import { MarketData } from '../hooks/useDatabase';
import { useMarketData } from '../contexts/MarketDataContext';

interface SpotTradingFormsProps {
  usdtBalance: number;
  btcBalance: number;
  currentPrice: number;
  availableBalance: number;
  onOrder: (order: {
    side: 'buy' | 'sell';
    order_type: 'market' | 'limit';
    amount: number;
    price?: number;
    stop_loss?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number };
    take_profit?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number };
  }) => void;
  marketData?: MarketData[];
}

interface CryptoCurrency {
  symbol: string;
  name: string;
  iconUrl: string;
  balance?: number;
  price?: number;
}

interface CoinGeckoToken {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
}

const SpotTradingForms: React.FC<SpotTradingFormsProps> = ({
  usdtBalance,
  btcBalance,
  currentPrice,
  availableBalance,
  onOrder,
  marketData = []
}) => {
  const { getSnapshotPriceBySymbol, refreshSnapshot, lastSnapshotTime, isConnected: isRealtimeConnected } = useMarketData();
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const [buyPrice, setBuyPrice] = useState(() => {
    return currentPrice && typeof currentPrice === 'number' ? currentPrice.toString() : '';
  });
  const [sellPrice, setSellPrice] = useState(() => {
    return currentPrice && typeof currentPrice === 'number' ? currentPrice.toString() : '';
  });
  
  const [buyPercentage, setBuyPercentage] = useState(0);
  const [sellPercentage, setSellPercentage] = useState(0);

  // Get current BTC price from snapshot data (stable price)
  const snapshotPrice = getSnapshotPriceBySymbol('BTCUSDT');
  const displayPrice = snapshotPrice > 0 ? snapshotPrice : currentPrice;

  // Stop Loss / Take Profit states
  const [buyStopLoss, setBuyStopLoss] = useState({ enabled: false, price: '', type: 'market' as 'market' | 'limit', limitPrice: '' });
  const [buyTakeProfit, setBuyTakeProfit] = useState({ enabled: false, price: '', type: 'market' as 'market' | 'limit', limitPrice: '' });
  const [sellStopLoss, setSellStopLoss] = useState({ enabled: false, price: '', type: 'market' as 'market' | 'limit', limitPrice: '' });
  const [sellTakeProfit, setSellTakeProfit] = useState({ enabled: false, price: '', type: 'market' as 'market' | 'limit', limitPrice: '' });

  // Available cryptocurrencies for swap
  const [availableCurrencies, setAvailableCurrencies] = useState<CryptoCurrency[]>([]);
  // Token selection dropdowns
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Clear error and success messages after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Update price fields when displayPrice changes
  useEffect(() => {
    if (displayPrice && typeof displayPrice === 'number') {
      setBuyPrice(displayPrice.toString());
      setSellPrice(displayPrice.toString());
    }
  }, [displayPrice]);

  // Initialize available currencies
  useEffect(() => {
    setIsLoadingCurrencies(true);
    
    // Create initial currencies with USDT and BTC
    const initialCurrencies: CryptoCurrency[] = [];
    
    // Find USDT in market cap data
    const usdtData = (marketData || []).find(token => token.symbol.toLowerCase() === 'usdt');
    initialCurrencies.push({
      symbol: 'USDT',
      name: 'Tether',
      iconUrl: usdtData?.iconUrl || 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
      balance: usdtBalance,
      price: 1
    });
    
    // Find BTC in market cap data
    const btcData = (marketData || []).find(token => token.symbol.toLowerCase() === 'btc');
    initialCurrencies.push({
      symbol: 'BTC',
      name: 'Bitcoin',
      iconUrl: btcData?.iconUrl || 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      balance: btcBalance,
      price: displayPrice
    });
    
    // Add other cryptocurrencies from market data
    if (marketData && marketData.length > 0) {
      const validMarketData = marketData.filter(data => 
        data.symbol.endsWith('USDT') && 
        data.price > 0 && 
        data.price !== 104325.3716 // Filter out placeholder price
      );
      
      for (const data of validMarketData) {
        if (data.symbol !== 'BTCUSDT' && data.symbol !== 'USDTUSDT') {
          const symbol = data.symbol.replace('USDT', '');
          
          if (!initialCurrencies.some(c => c.symbol === symbol)) {
            // Find matching token in market cap data
            const tokenSymbol = symbol.toLowerCase();
            const geckoToken = (marketData || []).find(t => t.symbol && t.symbol.toLowerCase() === tokenSymbol);
            
            // Create URL for crypto logo
            const iconUrl = geckoToken?.iconUrl || `https://assets.coingecko.com/coins/images/missing-token.png`;
            
            initialCurrencies.push({
              symbol,
              name: geckoToken?.name || symbol,
              iconUrl,
              price: data.price
            });
          }
        }
      }
    }

    setAvailableCurrencies(initialCurrencies);
    setIsLoadingCurrencies(false);
  }, [marketData, usdtBalance, btcBalance, displayPrice]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTokenDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const buyFee = 0.001; // 0.1% fee
  const sellFee = 0.011; // 1.1% fee

  const percentageOptions = [25, 50, 75, 100];

  const handleBuyPercentage = (percentage: number) => {
    setBuyPercentage(percentage);
    const availableForBuy = usdtBalance;
    const price = orderType === 'market' ? displayPrice : parseFloat(buyPrice) || displayPrice;
    const maxBtcAmount = availableForBuy / price;
    const btcAmount = (maxBtcAmount * percentage) / 100;
    setBuyAmount(btcAmount.toFixed(6));
  };

  const handleSellPercentage = (percentage: number) => {
    setSellPercentage(percentage);
    const btcAmount = (btcBalance * percentage) / 100;
    setSellAmount(btcAmount.toFixed(6));
  };

  const getEstimatedFillPrice = (side: 'buy' | 'sell') => {
    if (orderType === 'market') {
      return displayPrice || 0;
    }
    return side === 'buy' ? parseFloat(buyPrice) || displayPrice || 0 : parseFloat(sellPrice) || displayPrice || 0;
  };

  const handleBuy = () => {
    const amount = parseFloat(buyAmount);
    if (!amount || amount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    const price = orderType === 'limit' ? parseFloat(buyPrice) : undefined;
    if (orderType === 'limit' && (!price || price <= 0)) {
      setErrorMessage('Please enter a valid price for limit order');
      return;
    }

    const estimatedPrice = getEstimatedFillPrice('buy');
    const total = amount * estimatedPrice;
    const feeAmount = total * buyFee;
    const totalWithFee = total + feeAmount;

    if (totalWithFee > availableBalance) {
      setErrorMessage(`Insufficient available balance. Required: ${totalWithFee.toFixed(2)} USDT, Available: ${availableBalance.toFixed(2)} USDT`);
      return;
    }

    const order: any = {
      side: 'buy' as const,
      order_type: orderType,
      amount,
      price: orderType === 'limit' ? price : undefined,
    };

    // Add stop loss if enabled
    if (buyStopLoss.enabled && buyStopLoss.price) {
      order.stop_loss = {
        trigger_price: parseFloat(buyStopLoss.price),
        execution_type: buyStopLoss.type,
        execution_price: buyStopLoss.type === 'limit' && buyStopLoss.limitPrice ? parseFloat(buyStopLoss.limitPrice) : undefined,
      };
    }

    // Add take profit if enabled
    if (buyTakeProfit.enabled && buyTakeProfit.price) {
      order.take_profit = {
        trigger_price: parseFloat(buyTakeProfit.price),
        execution_type: buyTakeProfit.type,
        execution_price: buyTakeProfit.type === 'limit' && buyTakeProfit.limitPrice ? parseFloat(buyTakeProfit.limitPrice) : undefined,
      };
    }

    onOrder(order);
    setSuccessMessage(`${orderType === 'market' ? 'Market' : 'Limit'} buy order placed successfully for ${amount} BTC`);
    setBuyAmount('');
    setBuyPercentage(0);
    setBuyStopLoss({ enabled: false, price: '', type: 'market', limitPrice: '' });
    setBuyTakeProfit({ enabled: false, price: '', type: 'market', limitPrice: '' });
  };

  const handleSell = () => {
    const amount = parseFloat(sellAmount);
    if (!amount || amount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    const price = orderType === 'limit' ? parseFloat(sellPrice) : undefined;
    if (orderType === 'limit' && (!price || price <= 0)) {
      setErrorMessage('Please enter a valid price for limit order');
      return;
    }

    if (amount > btcBalance) {
      setErrorMessage('Insufficient BTC balance');
      return;
    }

    const order: any = {
      side: 'sell' as const,
      order_type: orderType,
      amount,
      price: orderType === 'limit' ? price : undefined,
    };

    // Add stop loss if enabled
    if (sellStopLoss.enabled && sellStopLoss.price) {
      order.stop_loss = {
        trigger_price: parseFloat(sellStopLoss.price),
        execution_type: sellStopLoss.type,
        execution_price: sellStopLoss.type === 'limit' && sellStopLoss.limitPrice ? parseFloat(sellStopLoss.limitPrice) : undefined,
      };
    }

    // Add take profit if enabled
    if (sellTakeProfit.enabled && sellTakeProfit.price) {
      order.take_profit = {
        trigger_price: parseFloat(sellTakeProfit.price),
        execution_type: sellTakeProfit.type,
        execution_price: sellTakeProfit.type === 'limit' && sellTakeProfit.limitPrice ? parseFloat(sellTakeProfit.limitPrice) : undefined,
      };
    }

    onOrder(order);
    setSuccessMessage(`${orderType === 'market' ? 'Market' : 'Limit'} sell order placed successfully for ${amount} BTC`);
    setSellAmount('');
    setSellPercentage(0);
    setSellStopLoss({ enabled: false, price: '', type: 'market', limitPrice: '' });
    setSellTakeProfit({ enabled: false, price: '', type: 'market', limitPrice: '' });
  };

  const calculateBuyTotal = () => {
    const amount = parseFloat(buyAmount) || 0;
    const price = getEstimatedFillPrice('buy');
    const total = amount * price;
    const feeAmount = total * buyFee;
    return total + feeAmount;
  };

  const calculateSellTotal = () => {
    const amount = parseFloat(sellAmount) || 0;
    const price = getEstimatedFillPrice('sell');
    const total = amount * price;
    const feeAmount = total * sellFee;
    return total - feeAmount;
  };

  // Filter tokens based on search term
  const getFilteredTokens = (term: string) => {
    if (!term) return availableCurrencies;
    
    const lowerTerm = term.toLowerCase();
    return availableCurrencies.filter(currency => 
      currency.symbol.toLowerCase().includes(lowerTerm) || 
      currency.name.toLowerCase().includes(lowerTerm)
    );
  };

  // Render crypto icon with fallback
  const renderCryptoIcon = (currency: CryptoCurrency) => {
    return (
      <div className="relative w-6 h-6 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center">
        <img 
          src={currency.iconUrl} 
          alt={currency.symbol}
          className="w-full h-full object-contain"
          onError={(e) => {
            // On error, replace with text icon
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
        <div className="absolute inset-0 hidden flex items-center justify-center text-white font-bold text-xs">
          {currency.symbol.substring(0, 2)}
        </div>
      </div>
    );
  };

  if (!displayPrice || typeof displayPrice !== 'number') {
    return (
      <div className="app-surface-primary rounded-2xl p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-slate-400">Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-surface-primary rounded-2xl p-8">
      {/* Status Messages */}
      {errorMessage && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
          <span className="text-red-400">{errorMessage}</span>
        </div>
      )}
      
      {successMessage && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
          <span className="text-green-400">{successMessage}</span>
        </div>
      )}

      {/* Order Type Selector */}
      <div className="flex gap-6 mb-8">
        <button
          onClick={() => setOrderType('limit')}
          className={`text-sm font-medium px-4 py-2 rounded-lg transition-all duration-300 ${
            orderType === 'limit' 
              ? 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/30 shadow-lg shadow-cyan-400/20' 
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderType('market')}
          className={`text-sm font-medium px-4 py-2 rounded-lg transition-all duration-300 ${
            orderType === 'market' 
              ? 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/30 shadow-lg shadow-cyan-400/20' 
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          Market
        </button>
      </div>

      <div className="flex gap-8">
        {/* Buy Form */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-3">
              <span>Available</span>
              <span className="flex items-center gap-2 text-emerald-400 font-mono">
                {availableBalance.toFixed(4)} USDT
                <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></div>
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Price Input */}
            <div>
              <label className="block text-sm text-slate-400 mb-3">Price (USDT)</label>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  Snapshot Price
                </div>
                <button
                  onClick={refreshSnapshot}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Refresh
                </button>
              </div>
              <input
                type="text"
                value={orderType === 'market' ? displayPrice.toFixed(4) : buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                readOnly={orderType === 'market'}
                className={`w-full text-white px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-mono ${
                  orderType === 'market' 
                    ? 'bg-gradient-to-r from-emerald-500/10 to-green-500/10 border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10' 
                    : 'bg-slate-900/50 border-slate-600/50 hover:border-slate-500/50'
                }`}
              />
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm text-slate-400 mb-3">Amount (BTC)</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Minimum 0.0002"
                  value={buyAmount}
                  onChange={(e) => {
                    setBuyAmount(e.target.value);
                    setBuyPercentage(0);
                  }}
                  className="w-full app-input px-4 py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  {availableCurrencies.length > 0 && (
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                        className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                      >
                        {renderCryptoIcon(availableCurrencies.find(c => c.symbol === 'BTC') || {
                          symbol: 'BTC',
                          name: 'Bitcoin',
                          iconUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png'
                        })}
                        <span className="font-medium">BTC</span>
                        <ChevronDown size={14} />
                      </button>
                      
                      {showTokenDropdown && (
                        <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                          <div className="p-3 border-b border-slate-700">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Search tokens"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-700 text-white pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                          
                          <div className="max-h-60 overflow-y-auto">
                            {isLoadingCurrencies ? (
                              <div className="p-4 text-center text-slate-400">
                                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                Loading tokens...
                              </div>
                            ) : (
                              getFilteredTokens(searchTerm).map((currency) => (
                                <button
                                  key={currency.symbol}
                                  onClick={() => {
                                    // In a real implementation, this would change the trading pair
                                    setShowTokenDropdown(false);
                                    setSearchTerm('');
                                  }}
                                  className="w-full flex items-center justify-between p-3 hover:bg-slate-700 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    {renderCryptoIcon(currency)}
                                    <div className="text-left">
                                      <div className="font-medium text-white">{currency.name}</div>
                                      <div className="text-xs text-slate-400">{currency.symbol}</div>
                                    </div>
                                  </div>
                                  {currency.balance !== undefined && (
                                    <div className="text-right text-xs text-slate-400">
                                      {currency.balance.toFixed(currency.symbol === 'USDT' ? 2 : 6)}
                                    </div>
                                  )}
                                </button>
                              ))
                            )}
                            
                            {!isLoadingCurrencies && getFilteredTokens(searchTerm).length === 0 && (
                              <div className="p-4 text-center text-slate-400">
                                No tokens found
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Percentage Buttons */}
            <div className="flex gap-2">
              {percentageOptions.map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handleBuyPercentage(percentage)}
                  className={`flex-1 py-2 text-xs rounded-lg font-medium transition-all duration-300 ${
                    buyPercentage === percentage 
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25 transform scale-105' 
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white border border-slate-600/30'
                  }`}
                >
                  {percentage}%
                </button>
              ))}
            </div>

            {/* Stop Loss */}
            <div className="border-t border-slate-700/50 pt-6">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={buyStopLoss.enabled}
                  onChange={(e) => setBuyStopLoss(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                />
                <label className="text-sm text-slate-400">Stop Loss</label>
              </div>
              {buyStopLoss.enabled && (
                <div className="space-y-3 bg-red-500/5 rounded-xl p-4 border border-red-500/20">
                  <input
                    type="text"
                    placeholder="Stop price"
                    value={buyStopLoss.price}
                    onChange={(e) => setBuyStopLoss(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full app-input px-3 py-2 rounded-lg border border-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/50 text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <select
                      value={buyStopLoss.type}
                      onChange={(e) => setBuyStopLoss(prev => ({ ...prev, type: e.target.value as 'market' | 'limit' }))}
                      className="flex-1 app-input px-2 py-1 rounded-lg border border-red-500/30 text-sm"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                    </select>
                    {buyStopLoss.type === 'limit' && (
                      <input
                        type="text"
                        placeholder="Limit price"
                        value={buyStopLoss.limitPrice}
                        onChange={(e) => setBuyStopLoss(prev => ({ ...prev, limitPrice: e.target.value }))}
                        className="flex-1 app-input px-2 py-1 rounded-lg border border-red-500/30 text-sm font-mono"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Take Profit */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={buyTakeProfit.enabled}
                  onChange={(e) => setBuyTakeProfit(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/50"
                />
                <label className="text-sm text-slate-400">Take Profit</label>
              </div>
              {buyTakeProfit.enabled && (
                <div className="space-y-3 bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/20">
                  <input
                    type="text"
                    placeholder="Target price"
                    value={buyTakeProfit.price}
                    onChange={(e) => setBuyTakeProfit(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full app-input px-3 py-2 rounded-lg border border-emerald-500/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <select
                      value={buyTakeProfit.type}
                      onChange={(e) => setBuyTakeProfit(prev => ({ ...prev, type: e.target.value as 'market' | 'limit' }))}
                      className="flex-1 app-input px-2 py-1 rounded-lg border border-emerald-500/30 text-sm"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                    </select>
                    {buyTakeProfit.type === 'limit' && (
                      <input
                        type="text"
                        placeholder="Limit price"
                        value={buyTakeProfit.limitPrice}
                        onChange={(e) => setBuyTakeProfit(prev => ({ ...prev, limitPrice: e.target.value }))}
                        className="flex-1 app-input px-2 py-1 rounded-lg border border-emerald-500/30 text-sm font-mono"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex justify-between text-sm text-slate-400 mb-2">
                <span>Total</span>
                <span>Fee {(buyFee * 100).toFixed(1)}%</span>
              </div>
              <div className="text-slate-300 font-mono text-lg">{calculateBuyTotal().toFixed(2)} USDT</div>
            </div>

            <button 
              onClick={handleBuy}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-emerald-500/25 transform hover:scale-105"
            >
              BUY BTC
            </button>
          </div>
        </div>

        {/* Sell Form */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-3">
              <span>Available</span>
              <span className="flex items-center gap-2 text-orange-400 font-mono">
                {btcBalance.toFixed(6)} BTC
                <div className="w-1 h-1 bg-orange-400 rounded-full animate-pulse"></div>
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Price Input */}
            <div>
              <label className="block text-sm text-slate-400 mb-3">Price (USDT)</label>
              <input
                type="text"
                value={orderType === 'market' ? displayPrice.toFixed(4) : sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                readOnly={orderType === 'market'}
                className={`w-full text-white px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-mono ${
                  orderType === 'market' 
                    ? 'bg-gradient-to-r from-red-500/10 to-pink-500/10 border-red-500/30 text-red-400 shadow-lg shadow-red-500/10' 
                    : 'bg-slate-900/50 border-slate-600/50 hover:border-slate-500/50'
                }`}
              />
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm text-slate-400 mb-3">Amount (BTC)</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Minimum 0.0040"
                  value={sellAmount}
                  onChange={(e) => {
                    setSellAmount(e.target.value);
                    setSellPercentage(0);
                  }}
                  className="w-full app-input px-4 py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  {availableCurrencies.length > 0 && (
                    <div className="flex items-center gap-1 text-slate-400">
                      {renderCryptoIcon(availableCurrencies.find(c => c.symbol === 'BTC') || {
                        symbol: 'BTC',
                        name: 'Bitcoin',
                        iconUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png'
                      })}
                      <span className="font-medium">BTC</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Percentage Buttons */}
            <div className="flex gap-2">
              {percentageOptions.map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handleSellPercentage(percentage)}
                  className={`flex-1 py-2 text-xs rounded-lg font-medium transition-all duration-300 ${
                    sellPercentage === percentage 
                      ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/25 transform scale-105' 
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-white border border-slate-600/30'
                  }`}
                >
                  {percentage}%
                </button>
              ))}
            </div>

            {/* Stop Loss */}
            <div className="border-t border-slate-700/50 pt-6">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={sellStopLoss.enabled}
                  onChange={(e) => setSellStopLoss(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                />
                <label className="text-sm text-slate-400">Stop Loss</label>
              </div>
              {sellStopLoss.enabled && (
                <div className="space-y-3 bg-red-500/5 rounded-xl p-4 border border-red-500/20">
                  <input
                    type="text"
                    placeholder="Stop price"
                    value={sellStopLoss.price}
                    onChange={(e) => setSellStopLoss(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full app-input px-3 py-2 rounded-lg border border-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/50 text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <select
                      value={sellStopLoss.type}
                      onChange={(e) => setSellStopLoss(prev => ({ ...prev, type: e.target.value as 'market' | 'limit' }))}
                      className="flex-1 app-input px-2 py-1 rounded-lg border border-red-500/30 text-sm"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                    </select>
                    {sellStopLoss.type === 'limit' && (
                      <input
                        type="text"
                        placeholder="Limit price"
                        value={sellStopLoss.limitPrice}
                        onChange={(e) => setSellStopLoss(prev => ({ ...prev, limitPrice: e.target.value }))}
                        className="flex-1 app-input px-2 py-1 rounded-lg border border-red-500/30 text-sm font-mono"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Take Profit */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={sellTakeProfit.enabled}
                  onChange={(e) => setSellTakeProfit(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-emerald-500/50"
                />
                <label className="text-sm text-slate-400">Take Profit</label>
              </div>
              {sellTakeProfit.enabled && (
                <div className="space-y-3 bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/20">
                  <input
                    type="text"
                    placeholder="Target price"
                    value={sellTakeProfit.price}
                    onChange={(e) => setSellTakeProfit(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full app-input px-3 py-2 rounded-lg border border-emerald-500/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-sm font-mono"
                  />
                  <div className="flex gap-2">
                    <select
                      value={sellTakeProfit.type}
                      onChange={(e) => setSellTakeProfit(prev => ({ ...prev, type: e.target.value as 'market' | 'limit' }))}
                      className="flex-1 app-input px-2 py-1 rounded-lg border border-emerald-500/30 text-sm"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                    </select>
                    {sellTakeProfit.type === 'limit' && (
                      <input
                        type="text"
                        placeholder="Limit price"
                        value={sellTakeProfit.limitPrice}
                        onChange={(e) => setSellTakeProfit(prev => ({ ...prev, limitPrice: e.target.value }))}
                        className="flex-1 app-input px-2 py-1 rounded-lg border border-emerald-500/30 text-sm font-mono"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex justify-between text-sm text-slate-400 mb-2">
                <span>Total</span>
                <span>Fee {(sellFee * 100).toFixed(1)}%</span>
              </div>
              <div className="text-slate-300 font-mono text-lg">{calculateSellTotal().toFixed(2)} USDT</div>
            </div>

            <button 
              onClick={handleSell}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-red-500/25 transform hover:scale-105"
            >
              SELL BTC
            </button>
          </div>
        </div>
      </div>

      {/* Available Cryptocurrencies Section */}
      {availableCurrencies.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-700/50">
          <h4 className="text-lg font-semibold text-cyan-400 mb-4">Available Trading Pairs</h4>
          <div className="flex flex-wrap gap-2">
            {availableCurrencies.map((currency) => (
              <div key={currency.symbol} className="app-surface-muted px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                {renderCryptoIcon(currency)}
                <span className="text-white">{currency.symbol}/USDT</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SpotTradingForms;


