import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDatabase, DatabaseUserAsset } from '../hooks/useDatabase';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import SwapAboutPanel from './swap/SwapAboutPanel';
import SwapConfirmationDialog from './swap/SwapConfirmationDialog';
import SwapMarketOverview from './swap/SwapMarketOverview';
import SwapRecentSwaps from './swap/SwapRecentSwaps';
import SwapTradePanel from './swap/SwapTradePanel';
import SwapWorkspaceHeader from './swap/SwapWorkspaceHeader';
import type { SwapCurrency } from './swap/types';

interface SwapCryptoPageProps {
  usdtBalance: number;
  btcBalance: number;
  currentBtcPrice: number;
  onSwap: (fromCurrency: string, toCurrency: string, amount: number, toAmountReceived?: number) => Promise<boolean>;
  userAssets?: DatabaseUserAsset[];
  fetchTransactions?: () => Promise<void>;
}

type CryptoCurrency = SwapCurrency;

// Define icon URLs for swap symbols
const CRYPTO_ICON_URLS: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
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
  { symbol: 'EUR', name: 'Euro' },
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'BNB', name: 'BNB' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'TRX', name: 'TRON' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'SHIB', name: 'Shiba Inu' },
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
  userAssets = [],
  fetchTransactions
}) => {
  const { transactions } = useDatabase();
  const { convertUsdToEur, eurUsdRate, formatFiat, formatEur } = useFiatCurrency();
  const { marketData, snapshotData, getMarketDataBySymbol, refreshSnapshot, lastSnapshotTime } = useMarketData();
  const { getCryptoDataBySymbol, refreshQuote: refreshCryptoQuote, isConnected: isBybitConnected } = useBybitData();

  const [lockedPrices, setLockedPrices] = useState<{ from: number; to: number } | null>(null);
  const [priceLockedAt, setPriceLockedAt] = useState<number | null>(null);
  const [remainingLockTime, setRemainingLockTime] = useState<number>(0);
  const lockDurationRef = useRef<number>(15000);

  // Twelve Data spot prices are stored in Supabase in USD for swap valuation.
  const getPriceForSymbol = useCallback((symbol: string): number => {
    if (symbol === 'EUR') {
      const quote = getMarketDataBySymbol('EUR/USD');
      const age = Date.now() - Date.parse(quote?.timestamp || '');
      return quote && age >= 0 && age <= 5 * 60_000 ? quote.price : 0;
    }
    const quote = getCryptoDataBySymbol(`${symbol}USDT`);
    const age = Date.now() - Date.parse(quote?.timestamp || '');
    return quote && age >= 0 && age <= 5 * 60_000 ? quote.price_usd : 0;
  }, [getCryptoDataBySymbol, getMarketDataBySymbol]);

  // State for swap form
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [calculatedToAmountFullPrecision, setCalculatedToAmountFullPrecision] = useState<number | null>(null);
  const [, setCalculatedFromAmountFullPrecision] = useState<number | null>(null);
  const [fromCurrency, setFromCurrency] = useState<CryptoCurrency>(() => ({
    symbol: 'EUR',
    name: 'Euro',
    iconUrl: '',
    balance: convertUsdToEur(usdtBalance),
    price: eurUsdRate
  }));
  const [toCurrency, setToCurrency] = useState<CryptoCurrency>(() => ({
    symbol: 'BTC',
    name: 'Bitcoin',
    iconUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    balance: btcBalance,
    price: 0 // Will be set by useEffect
  }));
  const refreshSwapQuotes = useCallback(() => {
    void Promise.all([fromCurrency.symbol, toCurrency.symbol]
      .filter(symbol => symbol !== 'EUR')
      .map(symbol => refreshCryptoQuote(`${symbol}USDT`, true)));
    refreshSnapshot();
  }, [fromCurrency.symbol, toCurrency.symbol, refreshCryptoQuote, refreshSnapshot]);
  
  // State for token selection
  const [showFromTokens, setShowFromTokens] = useState(false);
  const [showToTokens, setShowToTokens] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableCurrencies, setAvailableCurrencies] = useState<CryptoCurrency[]>([]);
  const [, setIsLoadingCurrencies] = useState(false);
  
  // State for swap status
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);
  
  // State for confirmation modal
  const [showConfirmation, setShowConfirmation] = useState(false);
  
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
      if (getPriceForSymbol(symbol) <= 0) return 0;
      price = currencyType === 'from' ? lockedPrices.from : lockedPrices.to;
    } else {
      price = getPriceForSymbol(symbol);
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
          setToAmount(calculated.toFixed(getInputDecimals(toCurrency.symbol)));
        }
      }
    }
  }, [lockedPrices, fromCurrency.symbol, toCurrency.symbol, getPriceForSymbol, marketData, snapshotData, fromAmount]);

  // Set up interval to refresh market data every minute when on swap page
  useEffect(() => {
    // Refresh snapshot to get latest prices
    refreshSwapQuotes();

    // Set up interval to refresh snapshot every minute
    const intervalId = setInterval(() => {
      console.log('Refreshing market data for swap page...');
      refreshSwapQuotes();
    }, 60000); // 60 seconds = 1 minute

    // Clean up interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [refreshSwapQuotes]);

  const getCurrencyBalance = useCallback((symbol: string): number => {
    if (symbol === 'EUR') return convertUsdToEur(usdtBalance);
    if (symbol === 'BTC') return btcBalance;
    return userAssets.find(asset => asset.asset_symbol === symbol)?.balance || 0;
  }, [btcBalance, convertUsdToEur, userAssets, usdtBalance]);

  // Update currency balances and prices when market data changes (but not if prices are locked)
  useEffect(() => {
    // Don't update prices while they're locked
    if (lockedPrices) {
      return;
    }

    console.log('SwapPage: Updating currency prices...');

    setFromCurrency(prev => {
      const price = getPriceForSymbol(prev.symbol);
      console.log(`SwapPage: Updated fromCurrency ${prev.symbol} price to ${price}`);

      return { ...prev, balance: getCurrencyBalance(prev.symbol), price };
    });

    setToCurrency(prev => {
      const price = getPriceForSymbol(prev.symbol);
      console.log(`SwapPage: Updated toCurrency ${prev.symbol} price to ${price}`);

      return { ...prev, balance: getCurrencyBalance(prev.symbol), price };
    });

    // Also update in available currencies
    setAvailableCurrencies(prev =>
      prev.map(currency => {
        const price = getPriceForSymbol(currency.symbol);

        return { ...currency, balance: getCurrencyBalance(currency.symbol), price };
      })
    );
  }, [getCurrencyBalance, getPriceForSymbol, marketData, snapshotData, lastSnapshotTime, lockedPrices]);

  // Initialize available currencies
  useEffect(() => {
    setIsLoadingCurrencies(true);

    // Create initial currencies array based on ALLOWED_SWAP_SYMBOLS
    const initialCurrencies: CryptoCurrency[] = [];

    // Process each allowed symbol
    for (const allowedCrypto of ALLOWED_SWAP_SYMBOLS) {
      const symbol = allowedCrypto.symbol;
      const name = allowedCrypto.name;

      // Get icon URL from static mapping
      const iconUrl = symbol === 'EUR'
        ? ''
        : CRYPTO_ICON_URLS[symbol] || 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png';

      // Get price using the robust helper function
      const price = getPriceForSymbol(symbol);

      // Get balance from user assets or default balances
      // Add to available currencies
      initialCurrencies.push({
        symbol,
        name,
        iconUrl,
        price,
        balance: getCurrencyBalance(symbol)
      });
    }

    setAvailableCurrencies(initialCurrencies);
    console.log(`SwapPage: Initialized ${initialCurrencies.length} swap currencies with prices:`,
      initialCurrencies.map(c => `${c.symbol}:$${c.price}`).join(', '));
    setIsLoadingCurrencies(false);
  }, [marketData, snapshotData, getCurrencyBalance, getPriceForSymbol]);

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

  // Handle from amount change
  const handleFromAmountChange = (value: string) => {
    // Sanitize input - only allow numbers and decimal point
    const sanitizedValue = value.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const decimalCount = (sanitizedValue.match(/\./g) || []).length;
    if (decimalCount > 1) {
      return;
    }

    // Fiat is entered in cents; crypto retains higher precision.
    const parts = sanitizedValue.split('.');
    if (parts[1] && parts[1].length > getInputDecimals(fromCurrency.symbol)) {
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
        setToAmount(calculatedToAmount.toFixed(getInputDecimals(toCurrency.symbol)));
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

    // Fiat is entered in cents; crypto retains higher precision.
    const parts = sanitizedValue.split('.');
    if (parts[1] && parts[1].length > getInputDecimals(toCurrency.symbol)) {
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
        setFromAmount(calculatedFromAmount.toFixed(getInputDecimals(fromCurrency.symbol)));
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
      // For the max button, we want to use the full balance minus a small buffer
      // The fee is deducted from the output, not added to the input
      const buffer = fromCurrency.balance * 0.001; // 0.1% buffer for safety
      const maxSwappable = Math.max(0, fromCurrency.balance - buffer);
      
      // Round down to appropriate decimal places to prevent floating-point inaccuracies
      const decimals = fromCurrency.symbol === 'EUR' ? 2 : 6;
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
    const MIN_SWAP_VALUE_EUR = 0.01;
    const MAX_SWAP_VALUE_EUR = 1000000;
    const MAX_SLIPPAGE = 0.05; // 5% maximum slippage

    // Check value limits using the locked quote prices.
    const fromPrice = getEffectivePrice('from');
    const toPrice = getEffectivePrice('to');
    if (!fromPrice || !toPrice || fromPrice <= 0 || toPrice <= 0) {
      setSwapError('Currency prices unavailable. Please try again later.');
      return;
    }

    const fromUsdValue = amount * fromPrice;
    if (convertUsdToEur(fromUsdValue) < MIN_SWAP_VALUE_EUR) {
      setSwapError(`Minimum swap value is ${formatEur(MIN_SWAP_VALUE_EUR)}`);
      return;
    }

    if (convertUsdToEur(fromUsdValue) > MAX_SWAP_VALUE_EUR) {
      setSwapError(`Maximum swap value is ${formatEur(MAX_SWAP_VALUE_EUR)}`);
      return;
    }

    // Check balance
    if (amount > (fromCurrency.balance || 0)) {
      setSwapError(`Insufficient ${fromCurrency.symbol} balance`);
      return;
    }

    // Validate currencies are different
    if (fromCurrency.symbol === toCurrency.symbol) {
      setSwapError('Cannot swap to the same currency');
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
    const MIN_SWAP_VALUE_EUR = 0.01;
    const MAX_SWAP_VALUE_EUR = 1000000;

    const fromPrice = getEffectivePrice('from');
    const toPrice = getEffectivePrice('to');
    if (!fromPrice || !toPrice || fromPrice <= 0 || toPrice <= 0) {
      setSwapError('Invalid currency prices. Please try again later.');
      setShowConfirmation(false);
      return;
    }

    // Calculate the swap value using the locked prices.
    const fromUsdValue = amount * fromPrice;
    if (convertUsdToEur(fromUsdValue) < MIN_SWAP_VALUE_EUR) {
      setSwapError(`Minimum swap value is ${formatEur(MIN_SWAP_VALUE_EUR)}`);
      setShowConfirmation(false);
      return;
    }

    if (convertUsdToEur(fromUsdValue) > MAX_SWAP_VALUE_EUR) {
      setSwapError(`Maximum swap value is ${formatEur(MAX_SWAP_VALUE_EUR)}`);
      setShowConfirmation(false);
      return;
    }


    // Double-check balance before executing
    if (amount > (fromCurrency.balance || 0)) {
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
        setSwapSuccess(`Successfully swapped ${formatAssetAmount(amount, fromCurrency.symbol)} ${fromCurrency.symbol} to ${formatAssetAmount(toAmountNum, toCurrency.symbol)} ${toCurrency.symbol}`);
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
    } catch (error: unknown) {
      console.error('Swap error in component:', error);
      const errorMessage = error instanceof Error ? error.message : 'Swap failed. Please try again.';
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

  const getAmountDecimals = (symbol: string) => symbol === 'EUR' ? 2 : 6;
  const getInputDecimals = (symbol: string) => symbol === 'EUR' ? 2 : 8;
  const formatAssetAmount = (amount: number, symbol: string) =>
    amount.toFixed(getAmountDecimals(symbol));
  const formatBalance = (currency: CryptoCurrency) =>
    formatAssetAmount(currency.balance || 0, currency.symbol);
  const formatAssetValue = (amount: number, currencyType: 'from' | 'to') =>
    formatFiat(amount * getEffectivePrice(currencyType));

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
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });

  const filteredCurrencies = getFilteredTokens(searchTerm);
  const fromPrice = getEffectivePrice('from');
  const toPrice = getEffectivePrice('to');

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#0b0e11] text-slate-100">
      <SwapWorkspaceHeader fromSymbol={fromCurrency.symbol} toSymbol={toCurrency.symbol} />
      <div className="grid w-full items-start gap-4 px-4 py-5 sm:gap-5 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] lg:px-6">
        <main className="min-w-0">
          <SwapTradePanel
            fromField={{
              side: 'from', currency: fromCurrency, amount: fromAmount,
              onAmountChange: handleFromAmountChange,
              approximateValue: formatAssetValue(parseFloat(fromAmount) || 0, 'from'),
              currencies: filteredCurrencies, searchTerm, onSearchTermChange: setSearchTerm,
              isOpen: showFromTokens, onToggle: () => setShowFromTokens(!showFromTokens),
              onSelect: handleSelectFromCurrency, dropdownRef: fromDropdownRef,
              formatBalance, formatFiat, onMax: handleMaxClick
            }}
            toField={{
              side: 'to', currency: toCurrency, amount: toAmount,
              onAmountChange: handleToAmountChange,
              approximateValue: formatAssetValue(parseFloat(toAmount) || 0, 'to'),
              currencies: filteredCurrencies, searchTerm, onSearchTermChange: setSearchTerm,
              isOpen: showToTokens, onToggle: () => setShowToTokens(!showToTokens),
              onSelect: handleSelectToCurrency, dropdownRef: toDropdownRef,
              formatBalance, formatFiat
            }}
            fromCurrency={fromCurrency}
            toCurrency={toCurrency}
            fromAmount={fromAmount}
            toAmount={toAmount}
            isSwapping={isSwapping}
            isBybitConnected={isBybitConnected}
            lockedPrices={!!lockedPrices}
            remainingLockTime={remainingLockTime}
            swapError={swapError}
            swapSuccess={swapSuccess}
            onRefresh={refreshSwapQuotes}
            onUnlock={unlockPrices}
            onReverse={handleSwapCurrencies}
            onConfirm={handleShowConfirmation}
            getEffectivePrice={getEffectivePrice}
            calculateFee={calculateFee}
            formatAssetAmount={formatAssetAmount}
          />
        </main>
        <aside className="grid min-w-0 gap-4 sm:gap-5">
          <SwapMarketOverview prices={getSortedMarketPrices()} formatFiat={formatFiat} onRefresh={refreshSwapQuotes} />
          <SwapRecentSwaps transactions={swapTransactions} formatEur={formatEur} formatFiat={formatFiat} />
        </aside>
      </div>
      <SwapAboutPanel />
      {showConfirmation && (
        <SwapConfirmationDialog
          fromCurrency={fromCurrency}
          toCurrency={toCurrency}
          fromAmount={fromAmount}
          toAmount={toAmount}
          rate={fromPrice > 0 && toPrice > 0 ? fromPrice / toPrice : 0}
          fee={calculateFee()}
          isSwapping={isSwapping}
          formatAssetAmount={formatAssetAmount}
          formatAssetValue={formatAssetValue}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={executeSwap}
        />
      )}
    </div>
  );
};

export default SwapCryptoPage;
