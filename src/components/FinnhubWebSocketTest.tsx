import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, Wifi, WifiOff, Play, Square, RefreshCw, Database } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useMarketData } from '../contexts/MarketDataContext';

interface CommodityData {
  symbol: string;
  price: number;
  change: number;
  timestamp: number;
  volume: number;
}

const FinnhubWebSocketTest: React.FC = () => {
  const { marketData, isConnected: realtimeConnected } = useMarketData();
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const intervalRef = useRef<number | null>(null);

  const testCommodities = useMemo(() => [
    { symbol: "XAGUSD", display: "XAG/USD", name: "Silver/USD" },
    { symbol: "NATGASUSD", display: "Natural Gas", name: "Natural Gas" },
    { symbol: "BCOUSD", display: "Brent Crude", name: "Brent Crude" },
    { symbol: "WTICOUSD", display: "WTI/USD", name: "WTI Crude Oil" },
    { symbol: "XPTUSD", display: "XPT/USD", name: "Platinum/USD" },
    { symbol: "XAUUSD", display: "XAU/USD", name: "Gold/USD" },
    { symbol: "XPDUSD", display: "XPD/USD", name: "Palladium/USD" },
    { symbol: "CORNUSD", display: "Corn", name: "Corn" },
    { symbol: "WHEATUSD", display: "Wheat", name: "Wheat" },
    { symbol: "SOYBNUSD", display: "Soybean", name: "Soybean" },
    { symbol: "SUGARUSD", display: "Sugar", name: "Sugar" },
    { symbol: "COFFEEUSD", display: "Coffee", name: "Coffee" },
    { symbol: "COTTONUSD", display: "Cotton", name: "Cotton" },
    { symbol: "COCOAUSD", display: "Cocoa", name: "Cocoa" }
  ], []);

  const addMessage = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  const commodityData = useMemo(() => {
    const data: Record<string, CommodityData> = {};
    
    testCommodities.forEach(commodity => {
      // Find the market data for this symbol
      const marketDataItem = marketData.find(d => d.symbol === commodity.symbol);
      
      if (marketDataItem && marketDataItem.price > 0) {
        data[commodity.display] = {
          symbol: commodity.display,
          price: marketDataItem.price,
          change: marketDataItem.change_24h || 0,
          timestamp: new Date(marketDataItem.timestamp).getTime(),
          volume: marketDataItem.volume_24h || 0
        };
      }
    });
    
    return data;
  }, [marketData, testCommodities]);

  const startDataFetching = () => {
    if (intervalRef.current) {
      addMessage("Already monitoring data");
      return;
    }

    addMessage("🚀 Starting commodity data monitoring from Supabase market_data table...");
    addMessage(`📊 Found ${Object.keys(commodityData).length} commodities with current data`);
    
    // Set up interval to log updates every 30 seconds
    intervalRef.current = window.setInterval(() => {
      const currentData = Object.keys(commodityData).length;
      addMessage(`🔄 Monitoring ${currentData} commodities from market_data table`);
    }, 30000);
  };

  const stopDataFetching = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      addMessage("🛑 Stopped commodity data monitoring");
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  // Log when commodity data updates
  useEffect(() => {
    const commodityCount = Object.keys(commodityData).length;
    if (commodityCount > 0 && intervalRef.current) {
      // Only log when we have data and monitoring is active
      console.log(`📊 Commodity data updated: ${commodityCount} instruments with prices`);
    }
  }, [commodityData]);

  // Clean up interval when component unmounts
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen p-8 app-page-bg">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Activity size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                Commodity Data from Supabase
              </h1>
              <p className="text-slate-400">Real-time commodity data from Supabase market_data table</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
              realtimeConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {realtimeConnected ? <Database size={16} /> : <WifiOff size={16} />}
              <span className="text-sm font-medium">
                {realtimeConnected ? 'Supabase Connected' : 'Supabase Disconnected'}
              </span>
            </div>

            {!intervalRef.current ? (
              <button
                onClick={startDataFetching}
                disabled={isDataLoading}
                className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 disabled:from-slate-700 disabled:to-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-emerald-500/25 flex items-center gap-2"
              >
                {isDataLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Start Fetching
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={stopDataFetching}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center gap-2"
              >
                <Square size={18} />
                Stop Fetching
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
            <Database size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Commodity Data from Supabase */}
          <div className="app-surface-primary rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Database size={20} className="text-blue-400" />
                Commodity Prices from Supabase
              </h2>
              <div className="text-xs text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">
                {Object.keys(commodityData).length} active
              </div>
            </div>

            <div className="space-y-4">
              {testCommodities.map((commodity) => {
                const data = commodityData[commodity.display];
                const hasData = !!data;
                
                return (
                  <div 
                    key={commodity.symbol}
                    className={`bg-slate-900/40 rounded-xl p-4 border transition-all duration-300 ${
                      hasData ? 'border-slate-600/50 hover:border-slate-500/50' : 'border-slate-700/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          hasData ? 'bg-emerald-400' : 'bg-slate-600'
                        }`}></div>
                        <div>
                          <div className="font-medium text-white">{commodity.display}</div>
                          <div className="text-xs text-slate-400">{commodity.name}</div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        {hasData ? (
                          <>
                            <div className="text-white font-mono text-lg">
                              ${data.price.toFixed(4)}
                            </div>
                            <div className={`text-sm flex items-center gap-1 ${
                              data.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {data.change >= 0 ? '+' : ''}{data.change.toFixed(2)}%
                            </div>
                            <div className="text-xs text-slate-500">
                              {new Date(data.timestamp).toLocaleTimeString()}
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-500 text-sm">No data</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {Object.keys(commodityData).length === 0 && intervalRef.current && (
              <div className="text-center py-8 text-slate-500">
                <Database size={48} className="mx-auto mb-4 opacity-50" />
                <p>Waiting for commodity data from Supabase...</p>
                <p className="text-sm text-slate-600 mt-2">
                  Tracking {testCommodities.length} commodity symbols
                </p>
              </div>
            )}
          </div>

          {/* Data Fetching Messages Log */}
          <div className="app-surface-primary rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Data Fetching Log</h2>
              <button
                onClick={clearMessages}
                className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-700/50"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            <div className="app-surface-muted rounded-xl p-4 h-96 overflow-y-auto">
              <div className="space-y-2 font-mono text-sm">
                {messages.length > 0 ? (
                  messages.map((message, index) => (
                    <div 
                      key={index} 
                      className={`${
                        message.includes('✅') ? 'text-emerald-400' :
                        message.includes('❌') ? 'text-red-400' :
                        message.includes('💰') ? 'text-cyan-400' :
                        message.includes('📡') ? 'text-blue-400' :
                        message.includes('🔄') ? 'text-amber-400' :
                        'text-slate-300'
                      }`}
                    >
                      {message}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-center py-8">
                    No messages yet. Start fetching to see data updates.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Data Source Info */}
        <div className="mt-8 app-surface-primary rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Data Source Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-slate-400 mb-2">Data Source</div>
              <div className="app-surface-muted rounded-lg p-3 border border-slate-700/50">
                <code className="text-cyan-400 text-xs break-all">
                  Supabase market_data table (realtime updates)
                </code>
              </div>
            </div>
            
            <div>
              <div className="text-sm text-slate-400 mb-2">Status</div>
              <div className="app-surface-muted rounded-lg p-3 border border-slate-700/50">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Realtime:</span>
                    <span className={realtimeConnected ? 'text-emerald-400' : 'text-red-400'}>
                      {realtimeConnected ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Symbols:</span>
                    <span className="text-white">{testCommodities.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Data Available:</span>
                    <span className="text-white">{Object.keys(commodityData).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fetch Interval:</span>
                    <span className="text-white">{intervalRef.current ? '30s' : 'Stopped'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Supabase Data Format */}
        <div className="mt-8 app-surface-primary rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Supabase Data Format</h3>
          <div className="app-surface-muted rounded-lg p-4 border border-slate-700/50">
            <pre className="text-cyan-400 text-sm overflow-x-auto">
{`{
  "symbol": "XAUUSD",
  "price": 2350.50,
  "volume_24h": 1500000,
  "change_24h": 1.25,
  "timestamp": "2025-01-27T10:30:00Z",
  "high_price_24h": 2365.75,
  "low_price_24h": 2340.25,
  "bid_price": 2350.25,
  "ask_price": 2350.75
}`}
            </pre>
          </div>
        </div>

        {/* Tracked Symbols */}
        <div className="mt-8 app-surface-primary rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Tracked Commodity Symbols</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {testCommodities.map((commodity) => (
              <div key={commodity.symbol} className="app-surface-muted rounded-lg p-3 border border-slate-700/50">
                <div className="font-medium text-white text-sm">{commodity.display}</div>
                <div className="text-xs text-slate-400">{commodity.symbol}</div>
                <div className={`text-xs mt-1 ${
                  commodityData[commodity.display] ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {commodityData[commodity.display] ? '✅ Data Available' : '⏳ No Data'}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
            <Database size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-blue-400 text-sm font-medium">Data Source Information</p>
              <p className="text-slate-300 text-xs mt-1">
                All market data (crypto, forex, commodities, stocks) comes exclusively from the market_data table in Supabase. 
                Live updates are received through Supabase realtime subscriptions. No external APIs are used for price display.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinnhubWebSocketTest;

