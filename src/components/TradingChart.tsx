import React, { useEffect, useRef, useState } from 'react';
import { TOP_CRYPTO_PAIRS, CFD_INSTRUMENTS } from '../constants/tradingPairs';

interface TradingChartProps {
  selectedPair: string;
  backgroundVariant?: 'default' | 'futures' | 'cfd';
}

const TradingChart: React.FC<TradingChartProps> = ({ selectedPair, backgroundVariant = 'default' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const widgetRef = useRef<any>(null);
  const isFuturesBackground = backgroundVariant === 'futures';
  const isCfdBackground = backgroundVariant === 'cfd';
  const isThemedBackground = isFuturesBackground || isCfdBackground;
  const widgetBackgroundColor = isThemedBackground ? '#0f172a' : '#0f172a';
  const widgetGridColor = isThemedBackground ? '#334155' : '#334155';
  const wrapperBackgroundClass = isFuturesBackground
    ? 'app-surface-primary'
    : isCfdBackground
    ? 'app-surface-primary'
    : 'bg-slate-900';
  const overlayBackgroundClass = isFuturesBackground
    ? 'bg-slate-950/82 backdrop-blur-sm'
    : isCfdBackground
    ? 'bg-slate-950/82 backdrop-blur-sm'
    : 'bg-slate-900/80';

  
  // Format symbol for TradingView
  const formatSymbolForTradingView = (symbol: string) => {
    // For crypto pairs, always use BYBIT exchange as it has the most comprehensive coverage
    const cryptoPair = TOP_CRYPTO_PAIRS.find(pair => pair.symbol === symbol);
    if (cryptoPair) {
      // Use BYBIT for all crypto pairs as it has the most comprehensive symbol coverage
      return `BYBIT:${symbol}`;
    }
    
    // Handle crypto pairs that might not be in TOP_CRYPTO_PAIRS but end with USDT
    if (symbol.endsWith('USDT')) {
      return `BYBIT:${symbol}`;
    }

    const cfdInstrument = CFD_INSTRUMENTS.find(instrument => instrument.symbol === symbol);
    if (cfdInstrument) {
      // For CFD instruments, try different exchanges
      if (cfdInstrument.type === 'forex') {
        // Convert database format (EUR/USD) to TradingView format (EURUSD)
        const tvSymbol = symbol.replace('/', '');
        return tvSymbol; // Let TradingView auto-select the exchange
      } else if (cfdInstrument.type === 'stock' || cfdInstrument.type === 'index') {
        return cfdInstrument.tradingViewSymbol || symbol;
      } else if (cfdInstrument.type === 'commodity') {
        // Map commodity symbols to valid TradingView symbols
        switch (symbol) {
          case 'XAUUSD': 
  case 'XAU/USD': 
    return 'XAUUSD';

  case 'XAGUSD': 
  case 'XAG/USD': 
    return 'XAGUSD';

  case 'XPTUSD': 
  case 'XPT/USD': 
    return 'XPTUSD';

  case 'XPDUSD': 
  case 'XPD/USD': 
    return 'XPDUSD';

  case 'WTICOUSD': 
  case 'WTI/USD': 
  case 'WTICO/USD':
    return 'OANDA:WTICOUSD'; // West Texas Oil (OANDA)

case 'BCOUSD':
case 'Brent Crude':
case 'Brent Crude Oil':
case 'BCO/USD':
  return 'OANDA:BCOUSD'; // Exact CFD symbol on TradingView






  case 'NATGASUSD':
case 'NATGAS/USD':
case 'Natural Gas':
  return 'OANDA:NATGASUSD'; // US Natural Gas CFD (OANDA, correct scale)

            

  case 'CORNUSD': 
    return 'ZW1!'; // Wheat

  case 'SOYBNUSD': 
  case 'Soybean': 
    return 'CBOT:ZS1!'; // Soybean futures
              default: 
    return symbol;
        }
      }
    }
    
    // Handle crypto pairs that might not be in TOP_CRYPTO_PAIRS
    if (symbol.endsWith('USDT')) {
      return symbol; // Let TradingView auto-select the exchange
    }
    
    return symbol; // Let TradingView auto-select the exchange
  };

  useEffect(() => {
    if (!selectedPair) {
      setError('No trading pair selected');
      setIsLoading(false);
      return;
    }

    // Clear error immediately when pair changes
    setError(null);
    // Don't show loading state initially - let the chart load in background
    setIsLoading(false);

    // Clean up previous widget
    if (widgetRef.current) {
      try {
        widgetRef.current.remove();
      } catch (e) {
        console.warn('Error removing previous widget:', e);
      }
      widgetRef.current = null;
    }

    // Clear container
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    const loadTradingViewWidget = () => {
      if (!containerRef.current) {
        setError('Chart container not available');
        setIsLoading(false);
        return;
      }

      try {
        const tradingViewSymbol = formatSymbolForTradingView(selectedPair);
        console.log('Creating TradingView widget for symbol:', tradingViewSymbol);

        // Create the widget using TradingView constructor
        widgetRef.current = new (window as any).TradingView.widget({
          autosize: true,
          symbol: tradingViewSymbol,
          interval: "1",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          backgroundColor: widgetBackgroundColor,
          gridColor: widgetGridColor,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: containerRef.current.id,
          studies: ["Volume@tv-basicstudies"],
          overrides: {
            "paneProperties.background": widgetBackgroundColor,
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": widgetGridColor,
            "paneProperties.horzGridProperties.color": widgetGridColor,
            "symbolWatermarkProperties.transparency": 90,
            "scalesProperties.textColor": "#94a3b8",
            "mainSeriesProperties.candleStyle.upColor": "#10b981",
            "mainSeriesProperties.candleStyle.downColor": "#ef4444",
            "mainSeriesProperties.candleStyle.borderUpColor": "#10b981",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
            "mainSeriesProperties.candleStyle.wickUpColor": "#10b981",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444"
          },
          onChartReady: () => {
            console.log('TradingView chart ready for', selectedPair);
            setIsLoading(false);
          },
          onLoadError: (error: any) => {
            console.error('TradingView chart load error:', error);
            setError('Failed to load chart');
            setIsLoading(false);
          }
        });

        // Fallback timeout to hide loading state if onChartReady doesn't fire
        const fallbackTimeout = setTimeout(() => {
          console.log('TradingView chart fallback timeout - hiding loading state');
          setIsLoading(false);
        }, 2000);
        
        // Store timeout reference for cleanup
        widgetRef.current._fallbackTimeout = fallbackTimeout;

      } catch (err) {
        console.error('Error creating TradingView widget:', err);
        setError('Failed to create chart widget');
        setIsLoading(false);
      }
    };

    // Check if TradingView is already loaded
    if ((window as any).TradingView) {
      loadTradingViewWidget();
    } else {
      // Load TradingView script
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      
      script.onload = () => {
        console.log('TradingView library loaded');
        loadTradingViewWidget();
      };
      
      script.onerror = () => {
        console.error('Failed to load TradingView library');
        setError('Failed to load TradingView library');
        setIsLoading(false);
      };
      
      document.head.appendChild(script);
    }

    return () => {
      if (widgetRef.current) {
        try {
          // Clear fallback timeout if it exists
          if (widgetRef.current._fallbackTimeout) {
            clearTimeout(widgetRef.current._fallbackTimeout);
          }
          widgetRef.current.remove();
        } catch (e) {
          console.warn('Error cleaning up widget:', e);
        }
        widgetRef.current = null;
      }
    };
  }, [selectedPair, backgroundVariant, widgetBackgroundColor, widgetGridColor]);

  return (
    <div className={`relative h-full min-h-[280px] overflow-hidden rounded-xl ${wrapperBackgroundClass} sm:min-h-[340px] lg:min-h-[420px] xl:min-h-0`}>
      {error && (
        <div className={`absolute inset-0 z-10 flex items-center justify-center ${overlayBackgroundClass}`}>
          <div className="text-slate-400 text-center">
            <p className="mb-2">{error}</p>
            <p className="text-sm">Please select a valid trading pair</p>
          </div>
        </div>
      )}
      {isLoading && !error && (
        <div className={`absolute inset-0 z-10 flex items-center justify-center ${overlayBackgroundClass}`}>
          <div className="text-slate-400 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p>Loading TradingView Chart...</p>
          </div>
        </div>
      )}
      <div 
        ref={containerRef}
        id={`tradingview_${selectedPair.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`}
        className="h-full w-full"
      />
    </div>
  );
};

export default TradingChart;
