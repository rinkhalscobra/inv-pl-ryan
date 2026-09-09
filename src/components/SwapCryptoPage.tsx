import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  RefreshCw,
  Info,
  DollarSign,
  Search,
  ChevronDown,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Zap,
  Shield,
  Smartphone,
  DollarSign as Dollar,
  Lock
} from 'lucide-react';
import { useDatabase } from '../hooks/useDatabase';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';

interface SwapCryptoPageProps {
  usdtBalance: number;
  btcBalance: number;
  currentBtcPrice: number;
  onSwap: (fromCurrency: string, toCurrency: string, amount: number, toAmountReceived?: number) => Promise<boolean>;
  availableBalance?: number;
  userAssets?: DatabaseUserAsset[];
  fetchTransactions?: () => Promise<void>;
}

interface CryptoCurrency {
  symbol: string;
  name: string;
  iconUrl: string;
  balance?: number;
  price?: number;
}

// Define icon URLs for swap symbols
const CRYPTO_ICON_URLS: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  USDC: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  ADA: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  MATIC: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
  TRX: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
  DOT: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
  SHIB: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png',
  TON: 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png',
  APT: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png',
  ARB: 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
  OP: 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png',
  LTC: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
  PEPE: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg'
};

// Define the allowed swap symbols
const ALLOWED_SWAP_SYMBOLS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDT', name: 'Tether' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'BNB', name: 'BNB' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'TRX', name: 'TRON' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'TON', name: 'Toncoin' },
  { symbol: 'APT', name: 'Aptos' },
  { symbol: 'ARB', name: 'Arbitrum' },
  { symbol: 'OP', name: 'Optimism' },
  { symbol: 'LTC', name: 'Litecoin' },
  { symbol: 'PEPE', name: 'PEPE' }
];

const SwapCryptoPage: React.FC<SwapCryptoPageProps> = ({
  usdtBalance,
  btcBalance,
  currentBtcPrice,
  onSwap,
  availableBalance,
  userAssets = [],
  fetchTransactions
}) => {
  const { t } = useTranslation();
  const { transactions } = useDatabase();
  const { marketData, snapshotData, isConnected: isLiveDataConnected, getSnapshotPriceBySymbol, refreshSnapshot, lastSnapshotTime } = useMarketData();
  const { getPriceBySymbol: getBybitPrice, isConnected: isBybitConnected } = useBybitData();

  const [lockedPrices, setLockedPrices] = useState<{ from: number; to: number } | null>(null);
  const [priceLockedAt, setPriceLockedAt] = useState<number | null>(null);
  const [remainingLockTime, setRemainingLockTime] = useState<number>(0);
  const lockDurationRef = useRef<number>(15000);

  const lastValidatedPricesRef = useRef<Record<string, { price: number; confidence: number }>>({});

  // Helper function to get price for any symbol with multiple fallback strategies
  const getPriceForSymbol = useCallback((symbol: string): number => {
    if (symbol === 'USDT' || symbol === 'USDC') {
      return 1;
    }

    const tradingPair = `${symbol}USDT`;

    const isBtcReasonable = (price: number): boolean => {
      if (symbol !== 'BTC' || currentBtcPrice <= 100) return true;
      const ratio = Math.max(price, currentBtcPrice) / Math.min(price, currentBtcPrice);
      return ratio < 3;
    };

    const bybitPrice = getBybitPrice(tradingPair);
    if (bybitPrice > 0 && isBtcReasonable(bybitPrice)) {
      return bybitPrice;
    }

    const snapshotPrice = getSnapshotPriceBySymbol(tradingPair);
    if (snapshotPrice > 0 && isBtcReasonable(snapshotPrice)) {
      return snapshotPrice;
    }

    const marketDataItem = marketData.find(item => item.symbol === tradingPair);
    if (marketDataItem && marketDataItem.price > 0 && isBtcReasonable(marketDataItem.price)) {
      return marketDataItem.price;
    }

    const snapshotItem = snapshotData.find(item => item.symbol === tradingPair);
    if (snapshotItem && snapshotItem.price > 0 && isBtcReasonable(snapshotItem.price)) {
      return snapshotItem.price;
    }

    if (symbol === 'BTC' && currentBtcPrice > 0) {
      return currentBtcPrice;
    }

    return 0;
  }, [getBybitPrice, getSnapshotPriceBySymbol, marketData, snapshotData, currentBtcPrice]);
  
  // State for swap form
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [calculatedToAmountFullPrecision, setCalculatedToAmountFullPrecision] = useState<number | null>(null);
  const [calculatedFromAmountFullPrecision, setCalculatedFromAmountFullPrecision] = useState<number | null>(null);
  const [fromCurrency, setFromCurrency] = useState<CryptoCurrency>(() => ({
    symbol: 'USDT',
    name: 'Tether',
    iconUrl: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
    balance: usdtBalance,
    price: 1
  }));
  const [toCurrency, setToCurrency] = useState<CryptoCurrency>(() => ({
    symbol: 'BTC',
    name: 'Bitcoin',
    iconUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    balance: btcBalance,
    price: 0 // Will be set by useEffect
  }));
  
  // State for token selection
  const [showFromTokens, setShowFromTokens] = useState(false);
  const [showToTokens, setShowToTokens] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableCurrencies, setAvailableCurrencies] = useState<CryptoCurrency[]>([]);
  const [isLoadingCurrencies, setIsLoadingCurrencies] = useState(false);
  
  // State for swap status
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);
  
  // State for confirmation modal
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // State for order history
  const [activeSubTab, setActiveSubTab] = useState<'markets' | 'my_orders'>('markets');
  
  // Refs for dropdown handling
  const fromDropdownRef = useRef<HTMLDivElement>(null);
  const toDropdownRef = useRef<HTMLDivElement>(null);

  // Lock prices for 15 seconds with validation
  const lockPrices = useCallback(() => {
    let fromPrice = getPriceForSymbol(fromCurrency.symbol);
    let toPrice = getPriceForSymbol(toCurrency.symbol);

    if (fromPrice <= 0 || toPrice <= 0) return;

    if (fromCurrency.symbol === 'BTC' && currentBtcPrice > 100) {
      const ratio = Math.max(fromPrice, currentBtcPrice) / Math.min(fromPrice, currentBtcPrice);
      if (ratio > 2) fromPrice = currentBtcPrice;
    }
    if (toCurrency.symbol === 'BTC' && currentBtcPrice > 100) {
      const ratio = Math.max(toPrice, currentBtcPrice) / Math.min(toPrice, currentBtcPrice);
      if (ratio > 2) toPrice = currentBtcPrice;
    }

    setLockedPrices({ from: fromPrice, to: toPrice });
    setPriceLockedAt(Date.now());
  }, [fromCurrency.symbol, toCurrency.symbol, getPriceForSymbol, currentBtcPrice]);

  // Unlock prices and fetch fresh ones
  const unlockPrices = useCallback(() => {
    setLockedPrices(null);
    setPriceLockedAt(null);
    setRemainingLockTime(0);
    console.log('SwapPage: Unlocked prices');
  }, []);

  // Get the effective price (locked or current) with validation
  const getEffectivePrice = useCallback((currencyType: 'from' | 'to') => {
    const symbol = currencyType === 'from' ? fromCurrency.symbol : toCurrency.symbol;

    let price;
    if (lockedPrices) {
      price = currencyType === 'from' ? lockedPrices.from : lockedPrices.to;
    } else {
      price = getPriceForSymbol(symbol);
    }

    if (symbol === 'USDT' || symbol === 'USDC') return price;

    if (price > 0) {
      const tracked = lastValidatedPricesRef.current[symbol];
      if (tracked && tracked.confidence >= 2) {
        const ratio = Math.max(price, tracked.price) / Math.min(price, tracked.price);
        if (ratio > 3) return tracked.price;
      }
    }

    return price;
  }, [lockedPrices, fromCurrency.symbol, toCurrency.symbol, getPriceForSymbol]);

  // Update countdown timer
  useEffect(() => {
    if (!priceLockedAt) {
      setRemainingLockTime(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - priceLockedAt;
      const remaining = Math.max(0, lockDurationRef.current - elapsed);
      setRemainingLockTime(remaining);

      if (remaining === 0) {
        unlockPrices();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [priceLockedAt, unlockPrices]);

  // Track price confidence - builds trust in prices over consecutive similar readings
  useEffect(() => {
    const trackSymbol = (symbol: string) => {
      if (symbol === 'USDT' || symbol === 'USDC') return;
      const price = getPriceForSymbol(symbol);
      if (price <= 0) return;
      const tracked = lastValidatedPricesRef.current[symbol];
      if (tracked && tracked.price > 0) {
        const ratio = Math.max(price, tracked.price) / Math.min(price, tracked.price);
        if (ratio < 2) {
          lastValidatedPricesRef.current[symbol] = {
            price,
            confidence: Math.min(tracked.confidence + 1, 5)
          };
        } else if (tracked.confidence < 2) {
          lastValidatedPricesRef.current[symbol] = { price, confidence: 1 };
        }
      } else {
        lastValidatedPricesRef.current[symbol] = { price, confidence: 1 };
      }
    };
    trackSymbol(fromCurrency.symbol);
    trackSymbol(toCurrency.symbol);
  }, [fromCurrency.symbol, toCurrency.symbol, getPriceForSymbol, marketData, snapshotData]);

  // Cross-validate locked prices against live data - re-lock if significantly wrong
  useEffect(() => {
    if (!lockedPrices) return;
    const liveFromPrice = getPriceForSymbol(fromCurrency.symbol);
    const liveToPrice = getPriceForSymbol(toCurrency.symbol);
    if (liveFromPrice <= 0 || liveToPrice <= 0) return;

    const fromRatio = Math.max(lockedPrices.from, liveFromPrice) / Math.min(lockedPrices.from, liveFromPrice);
    const toRatio = Math.max(lockedPrices.to, liveToPrice) / Math.min(lockedPrices.to, liveToPrice);

    if (fromRatio > 1.5 || toRatio > 1.5) {
      setLockedPrices({ from: liveFromPrice, to: liveToPrice });
      setPriceLockedAt(Date.now());
      const numValue = parseFloat(fromAmount);
      if (!isNaN(numValue) && numValue > 0) {
        const SWAP_FEE_RATE = 0.001;
        const exchangeRate = liveFromPrice / liveToPrice;
        const calculated = numValue * exchangeRate * (1 - SWAP_FEE_RATE);
        if (!isNaN(calculated) && isFinite(calculated)) {
          setCalculatedToAmountFullPrecision(calculated);
          setToAmount(calculated.toFixed(8));
        }
      }
    }
  }, [lockedPrices, fromCurrency.symbol, toCurrency.symbol, getPriceForSymbol, marketData, snapshotData, fromAmount]);

  // Set up interval to refresh market data every minute when on swap page
  useEffect(() => {
    // Refresh snapshot to get latest prices
    refreshSnapshot();

    // Set up interval to refresh snapshot every minute
    const intervalId = setInterval(() => {
      console.log('Refreshing market data for swap page...');
      refreshSnapshot();
    }, 60000); // 60 seconds = 1 minute

    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [refreshSnapshot]);

  // Update currency balances and prices when market data changes (but not if prices are locked)
  useEffect(() => {
    // Don't update prices while they're locked
    if (lockedPrices) {
      return;
    }

    console.log('SwapPage: Updating currency prices...');

    setFromCurrency(prev => {
      const userAsset = userAssets.find(asset => asset.asset_symbol === prev.symbol);
      const balance = userAsset ? userAsset.balance :
                     prev.symbol === 'USDT' ? usdtBalance :
                     prev.symbol === 'BTC' ? btcBalance :
                     prev.balance;

      const price = getPriceForSymbol(prev.symbol);
      console.log(`SwapPage: Updated fromCurrency ${prev.symbol} price to ${price}`);

      return { ...prev, balance, price };
    });

    setToCurrency(prev => {
      const userAsset = userAssets.find(asset => asset.asset_symbol === prev.symbol);
      const balance = userAsset ? userAsset.balance :
                     prev.symbol === 'USDT' ? usdtBalance :
                     prev.symbol === 'BTC' ? btcBalance :
                     prev.balance;

      const price = getPriceForSymbol(prev.symbol);
      console.log(`SwapPage: Updated toCurrency ${prev.symbol} price to ${price}`);

      return { ...prev, balance, price };
    });

    // Also update in available currencies
    setAvailableCurrencies(prev =>
      prev.map(currency => {
        const userAsset = userAssets.find(asset => asset.asset_symbol === currency.symbol);
        const balance = userAsset ? userAsset.balance :
                       currency.symbol === 'USDT' ? usdtBalance :
                       currency.symbol === 'BTC' ? btcBalance :
                       currency.balance;

        const price = getPriceForSymbol(currency.symbol);

        return { ...currency, balance, price };
      })
    );
  }, [usdtBalance, btcBalance, userAssets, getPriceForSymbol, marketData, snapshotData, lastSnapshotTime, lockedPrices]);

  // Initialize available currencies
  useEffect(() => {
    setIsLoadingCurrencies(true);

    // Create initial currencies array based on ALLOWED_SWAP_SYMBOLS
    let initialCurrencies: CryptoCurrency[] = [];

    // Process each allowed symbol
    for (const allowedCrypto of ALLOWED_SWAP_SYMBOLS) {
      const symbol = allowedCrypto.symbol;
      const name = allowedCrypto.name;

      // Get icon URL from static mapping
      const iconUrl = CRYPTO_ICON_URLS[symbol] || 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png';

      // Get price using the robust helper function
      const price = getPriceForSymbol(symbol);

      // Get balance from user assets or default balances
      let balance;
      const userAsset = userAssets.find(asset => asset.asset_symbol === symbol);
      if (userAsset) {
        balance = userAsset.balance;
      } else if (symbol === 'BTC') {
        balance = btcBalance;
      } else if (symbol === 'USDT') {
        balance = usdtBalance;
      }

      // Add to available currencies
      initialCurrencies.push({
        symbol,
        name,
        iconUrl,
        price,
        balance
      });
    }

    setAvailableCurrencies(initialCurrencies);
    console.log(`SwapPage: Initialized ${initialCurrencies.length} swap currencies with prices:`,
      initialCurrencies.map(c => `${c.symbol}:$${c.price}`).join(', '));
    setIsLoadingCurrencies(false);
  }, [marketData, snapshotData, usdtBalance, btcBalance, userAssets, getPriceForSymbol]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fromDropdownRef.current && !fromDropdownRef.current.contains(event.target as Node)) {
        setShowFromTokens(false);
      }
      if (toDropdownRef.current && !toDropdownRef.current.contains(event.target as Node)) {
        setShowToTokens(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Clear error/success messages after 5 seconds
  useEffect(() => {
    if (swapError || swapSuccess) {
      const timer = setTimeout(() => {
        setSwapError(null);
        setSwapSuccess(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [swapError, swapSuccess]);

  // Calculate exchange rate
  const getExchangeRate = () => {
    if (fromCurrency.symbol === 'USDT' && toCurrency.symbol === 'BTC') {
      return availableBalance !== undefined ? availableBalance : currentBtcPrice;
    }
    if (fromCurrency.symbol === 'BTC' && toCurrency.symbol === 'USDT') {
      return availableBalance || usdtBalance;
    }
    if (fromCurrency.price && toCurrency.price) {
      return fromCurrency.price / toCurrency.price;
    }
    return 0;
  };

  // Handle from amount change
  const handleFromAmountChange = (value: string) => {
    // Sanitize input - only allow numbers and decimal point
    const sanitizedValue = value.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const decimalCount = (sanitizedValue.match(/\./g) || []).length;
    if (decimalCount > 1) {
      return;
    }

    // Limit decimal places to 8
    const parts = sanitizedValue.split('.');
    if (parts[1] && parts[1].length > 8) {
      return;
    }

    setFromAmount(sanitizedValue);

    // Lock prices when user starts entering amount
    if (sanitizedValue && !lockedPrices) {
      lockPrices();
    }

    // Calculate to amount based on exchange rate
    const numValue = parseFloat(sanitizedValue);
    if (!isNaN(numValue) && numValue > 0) {
      const fromPrice = getEffectivePrice('from');
      const toPrice = getEffectivePrice('to');

      if (!fromPrice || fromPrice <= 0) {
        console.error(`SwapPage: Missing price for ${fromCurrency.symbol}`);
        setSwapError(`Unable to get current price for ${fromCurrency.symbol}. Please refresh prices.`);
        setCalculatedToAmountFullPrecision(null);
        setToAmount('');
        return;
      }

      if (!toPrice || toPrice <= 0) {
        console.error(`SwapPage: Missing price for ${toCurrency.symbol}`);
        setSwapError(`Unable to get current price for ${toCurrency.symbol}. Please refresh prices.`);
        setCalculatedToAmountFullPrecision(null);
        setToAmount('');
        return;
      }

      // Clear any previous errors
      setSwapError(null);

      const SWAP_FEE_RATE = 0.001; // 0.1% fee
      const exchangeRate = fromPrice / toPrice;
      const calculatedToAmount = numValue * exchangeRate * (1 - SWAP_FEE_RATE);

      // Validate the calculated amount is reasonable
      if (!isNaN(calculatedToAmount) && isFinite(calculatedToAmount)) {
        // Store full precision for slippage calculation
        setCalculatedToAmountFullPrecision(calculatedToAmount);
        // Store rounded version for display
        setToAmount(calculatedToAmount.toFixed(8));
      } else {
        setCalculatedToAmountFullPrecision(null);
        setToAmount('');
      }
    } else {
      setCalculatedToAmountFullPrecision(null);
      setToAmount('');
      // Unlock prices if amount is cleared
      if (!sanitizedValue && lockedPrices) {
        unlockPrices();
      }
    }
  };

  // Handle to amount change
  const handleToAmountChange = (value: string) => {
    // Sanitize input - only allow numbers and decimal point
    const sanitizedValue = value.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const decimalCount = (sanitizedValue.match(/\./g) || []).length;
    if (decimalCount > 1) {
      return;
    }

    // Limit decimal places to 8
    const parts = sanitizedValue.split('.');
    if (parts[1] && parts[1].length > 8) {
      return;
    }

    setToAmount(sanitizedValue);

    // Lock prices when user starts entering amount
    if (sanitizedValue && !lockedPrices) {
      lockPrices();
    }

    // Calculate from amount based on exchange rate
    const numValue = parseFloat(sanitizedValue);
    if (!isNaN(numValue) && numValue > 0) {
      const fromPrice = getEffectivePrice('from');
      const toPrice = getEffectivePrice('to');

      if (!fromPrice || fromPrice <= 0) {
        console.error(`SwapPage: Missing price for ${fromCurrency.symbol}`);
        setSwapError(`Unable to get current price for ${fromCurrency.symbol}. Please refresh prices.`);
        setCalculatedFromAmountFullPrecision(null);
        setFromAmount('');
        return;
      }

      if (!toPrice || toPrice <= 0) {
        console.error(`SwapPage: Missing price for ${toCurrency.symbol}`);
        setSwapError(`Unable to get current price for ${toCurrency.symbol}. Please refresh prices.`);
        setCalculatedFromAmountFullPrecision(null);
        setFromAmount('');
        return;
      }

      // Clear any previous errors
      setSwapError(null);

      const SWAP_FEE_RATE = 0.001; // 0.1% fee
      const exchangeRate = toPrice / fromPrice;
      const calculatedFromAmount = numValue * exchangeRate / (1 - SWAP_FEE_RATE);

      // Validate the calculated amount is reasonable
      if (!isNaN(calculatedFromAmount) && isFinite(calculatedFromAmount)) {
        // Store full precision for slippage calculation
        setCalculatedFromAmountFullPrecision(calculatedFromAmount);
        // Store rounded version for display
        setFromAmount(calculatedFromAmount.toFixed(8));
      } else {
        setCalculatedFromAmountFullPrecision(null);
        setFromAmount('');
      }
    } else {
      setCalculatedFromAmountFullPrecision(null);
      setFromAmount('');
      // Unlock prices if amount is cleared
      if (!sanitizedValue && lockedPrices) {
        unlockPrices();
      }
    }
  };

  // Swap the currencies
  const handleSwapCurrencies = () => {
    const tempCurrency = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(tempCurrency);
    
    // Also swap the amounts
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  // Select a currency for the "from" field
  const handleSelectFromCurrency = (currency: CryptoCurrency) => {
    if (currency.symbol === toCurrency.symbol) {
      // If selecting the same currency as "to", swap them
      setFromCurrency(toCurrency);
      setToCurrency(currency);
    } else {
      setFromCurrency(currency);
    }
    
    setShowFromTokens(false);
    setSearchTerm('');
    
    // Recalculate amounts
    if (fromAmount) {
      handleFromAmountChange(fromAmount);
    }
  };

  // Select a currency for the "to" field
  const handleSelectToCurrency = (currency: CryptoCurrency) => {
    if (currency.symbol === fromCurrency.symbol) {
      // If selecting the same currency as "from", swap them
      setToCurrency(fromCurrency);
      setFromCurrency(currency);
    } else {
      setToCurrency(currency);
    }
    
    setShowToTokens(false);
    setSearchTerm('');
    
    // Recalculate amounts
    if (toAmount) {
      handleToAmountChange(toAmount);
    }
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

  // Handle max button click
  const handleMaxClick = () => {
    if (fromCurrency.balance) {
      // Define swap fee rate as a constant
      const SWAP_FEE_RATE = 0.001; // 0.1% fee
      
      // For the max button, we want to use the full balance minus a small buffer
      // The fee is deducted from the output, not added to the input
      const buffer = fromCurrency.balance * 0.001; // 0.1% buffer for safety
      const maxSwappable = Math.max(0, fromCurrency.balance - buffer);
      
      // Round down to appropriate decimal places to prevent floating-point inaccuracies
      const decimals = fromCurrency.symbol === 'USDT' ? 2 : 6;
      const maxSwappableValue = Math.floor(maxSwappable * Math.pow(10, decimals)) / Math.pow(10, decimals);
      const maxSwappableString = maxSwappableValue.toFixed(decimals);
      
      // Additional validation
      if (maxSwappableValue <= 0) {
        setSwapError('Insufficient balance for swap');
        return;
      }
      
      setFromAmount(maxSwappableString);
      handleFromAmountChange(maxSwappableString);
    }
  };

  // Show confirmation modal
  const handleShowConfirmation = () => {
    // Validate input
    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      setSwapError('Please enter a valid amount');
      return;
    }
    
    // Additional pre-confirmation checks
    const MIN_SWAP_AMOUNT = 0.0001;
    const MAX_SWAP_AMOUNT_USD = 1000000;
    const MAX_SLIPPAGE = 0.05; // 5% maximum slippage
    
    if (amount < MIN_SWAP_AMOUNT) {
      setSwapError(`Minimum swap amount is ${MIN_SWAP_AMOUNT}`);
      return;
    }
    
    // Check USD value limit (use effective prices)
    const fromPrice = getEffectivePrice('from');
    const toPrice = getEffectivePrice('to');
    const fromUsdValue = amount * fromPrice;
    if (fromUsdValue > MAX_SWAP_AMOUNT_USD) {
      setSwapError(`Maximum swap amount is $${MAX_SWAP_AMOUNT_USD.toLocaleString()}`);
      return;
    }

    // Check balance
    if (fromCurrency.balance && amount > fromCurrency.balance) {
      setSwapError(`Insufficient ${fromCurrency.symbol} balance`);
      return;
    }

    // Validate currencies are different
    if (fromCurrency.symbol === toCurrency.symbol) {
      setSwapError('Cannot swap to the same currency');
      return;
    }

    // Validate prices are available and reasonable (use effective prices)
    if (!fromPrice || !toPrice || fromPrice <= 0 || toPrice <= 0) {
      setSwapError('Currency prices unavailable. Please try again later.');
      return;
    }
    
    // Validate the to amount is calculated and reasonable
    const toAmountNum = parseFloat(toAmount);
    if (isNaN(toAmountNum) || toAmountNum <= 0) {
      setSwapError('Invalid amount to receive. Please try again.');
      return;
    }
    
    // Enhanced slippage validation using full precision values (use locked prices)
    const SWAP_FEE_RATE = 0.001; // 0.1% fee
    const expectedExchangeRate = fromPrice / toPrice;
    const expectedToAmount = amount * expectedExchangeRate * (1 - SWAP_FEE_RATE);
    
    // Use full precision value if available, otherwise recalculate
    const actualToAmount = calculatedToAmountFullPrecision !== null ? calculatedToAmountFullPrecision : expectedToAmount;
    
    // Prevent division by zero or extremely small numbers
    if (expectedToAmount <= 0.00000001) { // Less than 1 satoshi equivalent
      setSwapError('Calculated output amount is too small. Please increase the input amount.');
      return;
    }
    
    // Calculate slippage with safeguards
    const slippage = Math.abs(actualToAmount - expectedToAmount) / expectedToAmount;
    
    // Additional sanity check: if slippage is unreasonably high, it's likely a calculation error
    if (slippage > 1.0) { // More than 100% slippage indicates a serious error
      setSwapError('Price calculation error detected. Please refresh the page and try again.');
      return;
    }
    
    if (slippage > MAX_SLIPPAGE) {
      setSwapError(`Price has changed too much (${(slippage * 100).toFixed(2)}% slippage). Please try again.`);
      return;
    }
    
    // Validate the swap ratio is reasonable (prevent extreme ratios)
    const swapRatio = actualToAmount / amount;
    const expectedRatio = expectedExchangeRate * (1 - SWAP_FEE_RATE);
    const ratioDifference = Math.abs(swapRatio - expectedRatio) / Math.max(expectedRatio, 0.00000001);
    
    if (ratioDifference > MAX_SLIPPAGE) {
      setSwapError('Swap calculation error detected. Please try again.');
      return;
    }
    
    // Additional security: ensure USD value of output doesn't exceed input (plus tolerance for rounding)
    const inputUsdValue = amount * fromPrice;
    const outputUsdValue = actualToAmount * toPrice;
    if (outputUsdValue > inputUsdValue * 1.05) {
      setSwapError('Calculated output amount is unreasonably high. Please check the swap parameters.');
      return;
    }
    
    setSwapError(null);
    setShowConfirmation(true);
  };

  // Execute the swap after confirmation
  const executeSwap = async () => {
    const amount = parseFloat(fromAmount);

    // Use full precision value for execution, or recalculate if not available
    let toAmountNum = calculatedToAmountFullPrecision;
    if (toAmountNum === null || isNaN(toAmountNum)) {
      // Recalculate with full precision using locked prices
      const SWAP_FEE_RATE = 0.001;
      const fromPrice = getEffectivePrice('from');
      const toPrice = getEffectivePrice('to');
      const exchangeRate = fromPrice / toPrice;
      toAmountNum = amount * exchangeRate * (1 - SWAP_FEE_RATE);
    }
    
    // Enhanced validation checks
    if (isNaN(amount) || amount <= 0) {
      setSwapError('Please enter a valid amount');
      setShowConfirmation(false);
      return;
    }
    
    if (isNaN(toAmountNum) || toAmountNum <= 0) {
      setSwapError('Invalid calculated amount to receive');
      setShowConfirmation(false);
      return;
    }

    // Additional security checks
    const SWAP_FEE_RATE = 0.001; // 0.1% fee
    const MAX_SLIPPAGE = 0.05; // 5% maximum slippage allowed
    const MIN_SWAP_AMOUNT = 0.0001; // Minimum swap amount
    const MAX_SWAP_AMOUNT = 1000000; // Maximum swap amount in USD value

    // Check minimum swap amount
    if (amount < MIN_SWAP_AMOUNT) {
      setSwapError(`Minimum swap amount is ${MIN_SWAP_AMOUNT}`);
      setShowConfirmation(false);
      return;
    }

    // Calculate USD value of the swap to check maximum (use locked prices)
    const fromUsdValue = amount * getEffectivePrice('from');
    if (fromUsdValue > MAX_SWAP_AMOUNT) {
      setSwapError(`Maximum swap amount is $${MAX_SWAP_AMOUNT.toLocaleString()}`);
      setShowConfirmation(false);
      return;
    }


    // Double-check balance before executing
    if (fromCurrency.balance && amount > fromCurrency.balance) {
      setSwapError(`Insufficient ${fromCurrency.symbol} balance`);
      setShowConfirmation(false);
      return;
    }

    // Prevent swapping to the same currency
    if (fromCurrency.symbol === toCurrency.symbol) {
      setSwapError('Cannot swap to the same currency');
      setShowConfirmation(false);
      return;
    }

    // Check if prices are valid and not zero (using effective/locked prices)
    const fromPrice = getEffectivePrice('from');
    const toPrice = getEffectivePrice('to');
    if (!fromPrice || !toPrice || fromPrice <= 0 || toPrice <= 0) {
      setSwapError('Invalid currency prices. Please try again later.');
      setShowConfirmation(false);
      return;
    }
    
    setIsSwapping(true);
    setSwapError(null);
    setSwapSuccess(null);
    
    try {
      console.log('Executing swap with params:', {
        fromCurrency: fromCurrency.symbol,
        toCurrency: toCurrency.symbol,
        amount,
        toAmountNum
      });

      // Call the swap function with the correct parameters
      const success = await onSwap(fromCurrency.symbol, toCurrency.symbol, amount, toAmountNum);

      console.log('Swap result:', success);

      if (success) {
        setSwapSuccess(`Successfully swapped ${amount} ${fromCurrency.symbol} to ${toAmountNum.toFixed(6)} ${toCurrency.symbol}`);
        // Reset form
        setFromAmount('');
        setToAmount('');
        setCalculatedToAmountFullPrecision(null);
        setCalculatedFromAmountFullPrecision(null);

        // Unlock prices after successful swap
        unlockPrices();

        // Refresh transactions to update the UI
        if (fetchTransactions) {
          await fetchTransactions();
        }
      } else {
        throw new Error('Swap returned false without throwing an error');
      }
    } catch (error: any) {
      console.error('Swap error in component:', error);
      const errorMessage = error?.message || 'Swap failed. Please try again.';
      setSwapError(errorMessage);
    } finally {
      setIsSwapping(false);
      setShowConfirmation(false);
    }
  };

  // Calculate fees
  const calculateFee = () => {
    const amount = parseFloat(fromAmount) || 0;
    return amount * 0.001; // 0.1% fee
  };

  // Render crypto icon with fallback
  const renderCryptoIcon = (currency: CryptoCurrency) => {
    return (
      <div className="relative w-8 h-8 rounded-full overflow-hidden app-icon-tile flex items-center justify-center">
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
        <div className="absolute inset-0 hidden flex items-center justify-center text-white font-bold text-sm">
          {currency.symbol.substring(0, 2)}
        </div>
      </div>
    );
  };

  // Get market prices for supported swap assets
  const getSortedMarketPrices = () => {
    return ALLOWED_SWAP_SYMBOLS
      .map((item, index) => ({
        symbol: `${item.symbol}USDT`,
        baseSymbol: item.symbol,
        name: item.name,
        iconUrl: CRYPTO_ICON_URLS[item.symbol] || '',
        price: getPriceForSymbol(item.symbol),
        sortIndex: index
      }))
      .filter((item) => item.price > 0)
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .slice(0, 5);
  };

  // Filter transactions to only show swaps
  const swapTransactions = transactions
    .filter(tx =>
      tx.type === 'trade' &&
      tx.description.toLowerCase().includes('swap')
    )
    .sort((a, b) => {
      const aTime = new Date(a.created_at || a.timestamp).getTime();
      const bTime = new Date(b.created_at || b.timestamp).getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });

  return (
    <div className="mx-auto w-full space-y-6 app-page-bg px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <div className="relative z-20 min-w-0 lg:w-2/3">
        {/* Swap Card */}
        <div className="mb-8 rounded-2xl app-surface-primary p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent sm:text-2xl">
              {t('swap.title')}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 sm:gap-3 sm:text-sm">
              {lockedPrices ? (
                <div className="flex w-fit items-center gap-2 rounded-lg app-action-soft px-3 py-1.5">
                  <Lock size={14} className="text-white" />
                  <span className="text-white font-medium">
                    Price Locked: {Math.ceil(remainingLockTime / 1000)}s
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${isBybitConnected ? 'bg-green-400' : 'bg-blue-400'}`}></div>
                    <span>{isBybitConnected ? 'Live Prices' : 'Snapshot Prices'}</span>
                  </div>
                  {!isBybitConnected && (
                    <button
                      onClick={() => {
                        refreshSnapshot();
                      }}
                      className="flex items-center gap-1 text-blue-400 transition-colors hover:text-blue-300"
                      title="Refresh prices now"
                    >
                      <RefreshCw size={14} />
                      <span>Refresh</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Status Messages */}
          {swapError && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400">{swapError}</span>
            </div>
          )}
          
          {swapSuccess && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
              <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
              <span className="text-green-400">{swapSuccess}</span>
            </div>
          )}

          {/* From Section */}
          <div className="mb-2">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-slate-400">{t('swap.from')}</span>
              <span className="text-sm text-slate-400 sm:text-right">
                {t('common.balance')}: {fromCurrency.balance?.toFixed(fromCurrency.symbol === 'USDT' ? 2 : 6)} {fromCurrency.symbol}
              </span>
            </div>
            <div className="rounded-xl app-surface-muted p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => handleFromAmountChange(e.target.value)}
                  placeholder={t('swap.enterAmount')}
                  className="w-full bg-transparent text-2xl font-medium text-white focus:outline-none sm:text-3xl"
                />
                <div className="relative w-full sm:w-auto" ref={fromDropdownRef}>
                  <button
                    onClick={() => setShowFromTokens(!showFromTokens)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl app-action-soft px-4 py-2 transition-colors sm:w-auto"
                  >
                    {renderCryptoIcon(fromCurrency)}
                    <span className="text-white font-medium">{fromCurrency.symbol}</span>
                    <ChevronDown size={16} className="text-slate-400" />
                  </button>
                  
                  {/* From Token Dropdown */}
                  {showFromTokens && (
                    <div className="absolute top-full right-0 z-50 mt-2 max-h-96 w-full overflow-hidden rounded-xl app-dropdown sm:w-80">
                      <div className="p-4 border-b border-slate-700">
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search tokens..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full app-input pl-10 pr-4 py-2 rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto [scrollbar-color:#a855f7_#312e81] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-indigo-950/80 [&::-webkit-scrollbar-thumb]:bg-purple-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-indigo-950/80">
                        {getFilteredTokens(searchTerm).map((currency) => (
                          <button
                            key={currency.symbol}
                            onClick={() => handleSelectFromCurrency(currency)}
                            className="flex w-full items-center justify-between gap-3 p-4 transition-colors hover:bg-purple-500/10"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {renderCryptoIcon(currency)}
                              <div className="min-w-0 text-left">
                                <div className="text-white font-medium">{currency.symbol}</div>
                                <div className="truncate text-sm text-slate-400">{currency.name}</div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-white">{currency.balance?.toFixed(currency.symbol === 'USDT' ? 2 : 6) || '0'}</div>
                              <div className="text-slate-400 text-sm">${(currency.price || 0).toFixed(2)}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-slate-400 text-sm">
                  ≈ ${((parseFloat(fromAmount) || 0) * getEffectivePrice('from')).toFixed(2)}
                </span>
                <button
                  onClick={handleMaxClick}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center my-4">
            <button
              onClick={handleSwapCurrencies}
              className="app-action-soft rounded-full p-3 transition-colors"
            >
              <ArrowDown size={20} className="text-slate-400" />
            </button>
          </div>

          {/* To Section */}
          <div className="mb-6">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-slate-400">{t('swap.to')}</span>
              <span className="text-sm text-slate-400 sm:text-right">
                {t('common.balance')}: {toCurrency.balance?.toFixed(toCurrency.symbol === 'USDT' ? 2 : 6)} {toCurrency.symbol}
              </span>
            </div>
            <div className="rounded-xl app-surface-muted p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="text"
                  value={toAmount}
                  onChange={(e) => handleToAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-2xl font-medium text-white focus:outline-none sm:text-3xl"
                />
                <div className="relative w-full sm:w-auto" ref={toDropdownRef}>
                  <button
                    onClick={() => setShowToTokens(!showToTokens)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl app-action-soft px-4 py-2 transition-colors sm:w-auto"
                  >
                    {renderCryptoIcon(toCurrency)}
                    <span className="text-white font-medium">{toCurrency.symbol}</span>
                    <ChevronDown size={16} className="text-slate-400" />
                  </button>
                  
                  {/* To Token Dropdown */}
                  {showToTokens && (
                    <div className="absolute top-full right-0 z-50 mt-2 max-h-96 w-full overflow-hidden rounded-xl app-dropdown sm:w-80">
                      <div className="p-4 border-b border-slate-700">
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search tokens..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full app-input pl-10 pr-4 py-2 rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto [scrollbar-color:#a855f7_#312e81] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-indigo-950/80 [&::-webkit-scrollbar-thumb]:bg-purple-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-indigo-950/80">
                        {getFilteredTokens(searchTerm).map((currency) => (
                          <button
                            key={currency.symbol}
                            onClick={() => handleSelectToCurrency(currency)}
                            className="flex w-full items-center justify-between gap-3 p-4 transition-colors hover:bg-purple-500/10"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {renderCryptoIcon(currency)}
                              <div className="min-w-0 text-left">
                                <div className="text-white font-medium">{currency.symbol}</div>
                                <div className="truncate text-sm text-slate-400">{currency.name}</div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-white">{currency.balance?.toFixed(currency.symbol === 'USDT' ? 2 : 6) || '0'}</div>
                              <div className="text-slate-400 text-sm">${(currency.price || 0).toFixed(2)}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-slate-400 text-sm">
                  ≈ ${((parseFloat(toAmount) || 0) * getEffectivePrice('to')).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Swap Details */}
          {fromAmount && toAmount && (
            <div className="mb-6 space-y-2 rounded-xl app-surface-muted p-4">
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Exchange Rate</span>
                  {lockedPrices ? (
                    <button
                      onClick={unlockPrices}
                      className="text-xs text-purple-400 hover:text-purple-300 underline flex items-center gap-1"
                      title="Unlock and refresh prices"
                    >
                      <RefreshCw size={12} />
                      Unlock & Refresh
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        refreshSnapshot();
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                      title="Refresh prices"
                    >
                      <RefreshCw size={12} />
                      Refresh
                    </button>
                  )}
                </div>
                <span className="break-all text-white sm:text-right">
                  1 {fromCurrency.symbol} = {(getEffectivePrice('from') / getEffectivePrice('to')).toFixed(8)} {toCurrency.symbol}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-slate-400">Fee (0.1%)</span>
                <span className="text-white sm:text-right">{calculateFee().toFixed(6)} {fromCurrency.symbol}</span>
              </div>
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-slate-400">Minimum Received</span>
                <span className="text-white sm:text-right">{(parseFloat(toAmount) * 0.995).toFixed(6)} {toCurrency.symbol}</span>
              </div>
            </div>
          )}

          {/* Price Status Indicator */}
          {fromAmount && (!getEffectivePrice('from') || !getEffectivePrice('to')) && (
            <div className="mb-4 flex items-start gap-2 rounded-xl app-status-warning p-3 text-sm">
              <AlertTriangle size={16} className="text-purple-400 flex-shrink-0" />
              <span className="text-purple-400">
                Price data unavailable. Click the Refresh button to update prices.
              </span>
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={handleShowConfirmation}
            disabled={!fromAmount || !toAmount || isSwapping || parseFloat(fromAmount) <= 0 || !getEffectivePrice('from') || !getEffectivePrice('to')}
            className="w-full app-action-primary font-medium py-4 rounded-xl transition-all disabled:cursor-not-allowed"
          >
            {isSwapping ? 'Swapping...' : !getEffectivePrice('from') || !getEffectivePrice('to') ? 'Price Unavailable' : 'Swap'}
          </button>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="min-w-0 lg:w-1/3">
        {/* Market Overview */}
        <div className="mb-6 min-h-[280px] rounded-2xl app-surface-primary p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Market Overview</h3>
            <button
              onClick={refreshSnapshot}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          
          <div className="space-y-3">
            {getSortedMarketPrices().map((data) => {
              const symbol = data.symbol.replace('USDT', '');

              return (
                <div key={data.symbol} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full app-icon-tile">
                      {data.iconUrl ? (
                        <img
                          src={data.iconUrl}
                          alt={`${symbol} logo`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`absolute inset-0 flex items-center justify-center text-xs font-bold text-white ${data.iconUrl ? 'hidden' : ''}`}>
                        {symbol.substring(0, 2)}
                      </div>
                    </div>
                    <span className="truncate font-medium text-white">{symbol}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-white">${data.price.toFixed(2)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order History */}
        <div className="min-h-[240px] rounded-2xl app-surface-primary p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Swaps</h3>
            <Clock size={16} className="text-slate-400" />
          </div>
          
          <div className="space-y-3 max-h-64 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {swapTransactions.length > 0 ? (
              swapTransactions.map((tx) => (
                <div key={tx.id} className="rounded-lg app-surface-muted p-3">
                  <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="break-words text-sm font-medium text-white">
                      {tx.description}
                    </span>
                    <span className={`shrink-0 text-xs ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(6)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(tx.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-400 py-8">
                <Package size={32} className="mx-auto mb-2 opacity-50" />
                <p>No swap history yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* About Crypto Swaps */}
      <div className="w-full rounded-2xl app-surface-primary p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 app-icon-tile rounded-lg flex items-center justify-center">
            <Info size={16} className="text-white" />
          </div>
          <h3 className="text-lg font-semibold text-white">{t('swap.aboutCryptoSwaps')}</h3>
        </div>
        
        <p className="text-slate-300 text-sm mb-4 leading-relaxed">
          {t('swap.aboutDescription')}
        </p>
        
        {/* Advantages */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-400" />
            {t('swap.advantages')}
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-emerald-400" />
              <span className="text-slate-300 text-sm">{t('swap.instantExecution')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-blue-400" />
              <span className="text-slate-300 text-sm">{t('swap.noOrderBookWaiting')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone size={12} className="text-purple-400" />
              <span className="text-slate-300 text-sm">{t('swap.simpleInterface')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400 font-medium text-sm">0.1%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">{t('swap.noGasFees')}</span>
              <CheckCircle size={12} className="text-green-400" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">{t('swap.noNetworkFees')}</span>
              <CheckCircle size={12} className="text-green-400" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">{t('swap.noHiddenCosts')}</span>
              <CheckCircle size={12} className="text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/76 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl app-auth-card app-modal-opaque p-4 sm:p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Confirm Swap</h3>
              <button
                onClick={() => setShowConfirmation(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6 space-y-4">
              <div className="app-surface-muted rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">You Pay</div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    {renderCryptoIcon(fromCurrency)}
                    <span className="text-white font-medium">{fromCurrency.symbol}</span>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-white font-bold">{parseFloat(fromAmount).toFixed(6)}</div>
                    <div className="text-slate-400 text-sm">
                      ≈ ${((parseFloat(fromAmount) || 0) * getEffectivePrice('from')).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowDown size={20} className="text-slate-400" />
              </div>

              <div className="app-surface-muted rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">You Receive</div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    {renderCryptoIcon(toCurrency)}
                    <span className="text-white font-medium">{toCurrency.symbol}</span>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-white font-bold">{parseFloat(toAmount).toFixed(6)}</div>
                    <div className="text-slate-400 text-sm">
                      ≈ ${((parseFloat(toAmount) || 0) * getEffectivePrice('to')).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-xl app-surface-muted p-4">
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-slate-400">Exchange Rate</span>
                  <span className="break-all text-white sm:text-right">
                    1 {fromCurrency.symbol} = {(getEffectivePrice('from') / getEffectivePrice('to')).toFixed(8)} {toCurrency.symbol}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-slate-400">Fee (0.1%)</span>
                  <span className="text-white sm:text-right">{calculateFee().toFixed(6)} {fromCurrency.symbol}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 app-action-soft text-white font-medium py-3 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeSwap}
                disabled={isSwapping}
                className="flex-1 app-action-primary text-white font-medium py-3 rounded-xl transition-all disabled:cursor-not-allowed"
              >
                {isSwapping ? 'Swapping...' : 'Confirm Swap'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SwapCryptoPage;
