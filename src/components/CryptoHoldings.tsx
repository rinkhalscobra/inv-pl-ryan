import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, Bitcoin, Eye, EyeOff, TrendingUp, TrendingDown, Info, Search, Euro } from 'lucide-react';
import { useDatabase, DatabaseUserAsset } from '../hooks/useDatabase';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface CryptoHoldingsProps {
  usdtBalance: number;
  btcBalance: number;
  currentBtcPrice: number;
  userAssets?: DatabaseUserAsset[];
}

interface CryptoAsset {
  symbol: string;
  name: string;
  icon: React.ReactNode;
  balance: number;
  usdValue: number;
  change24h?: number;
  color: string;
}

const CryptoHoldings: React.FC<CryptoHoldingsProps> = ({
  usdtBalance,
  btcBalance,
  currentBtcPrice,
  userAssets = []
}) => {
  const { t } = useTranslation();
  const { formatFiat } = useFiatCurrency();
  const { assets } = useDatabase();
  const { marketData, snapshotData, getSnapshotPriceBySymbol } = useMarketData();
  const { getPriceBySymbol: getBybitPrice } = useBybitData();
  const [showBalances, setShowBalances] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [totalChange, setTotalChange] = useState(0);

  // Helper function to get price for any symbol with multiple fallback strategies
  const getPriceForSymbol = useCallback((symbol: string): number => {
    // Stablecoins always return 1
    if (symbol === 'USDT' || symbol === 'USDC') {
      return 1;
    }

    const tradingPair = `${symbol}USDT`;

    // Strategy 1: Try websocket data first (most real-time)
    const bybitPrice = getBybitPrice(tradingPair);
    if (bybitPrice > 0) {
      return bybitPrice;
    }

    // Strategy 2: Try snapshot data (stable fallback)
    const snapshotPrice = getSnapshotPriceBySymbol(tradingPair);
    if (snapshotPrice > 0) {
      return snapshotPrice;
    }

    // Strategy 3: Try direct marketData lookup
    const marketDataItem = marketData.find(item => item.symbol === tradingPair);
    if (marketDataItem && marketDataItem.price > 0) {
      return marketDataItem.price;
    }

    // Strategy 4: Try snapshotData direct lookup
    const snapshotItem = snapshotData.find(item => item.symbol === tradingPair);
    if (snapshotItem && snapshotItem.price > 0) {
      return snapshotItem.price;
    }

    // Strategy 5: For BTC, use the prop price as final fallback
    if (symbol === 'BTC' && currentBtcPrice > 0) {
      return currentBtcPrice;
    }

    console.warn(`CryptoHoldings: No price found for ${symbol}`);
    return 0;
  }, [getBybitPrice, getSnapshotPriceBySymbol, marketData, snapshotData, currentBtcPrice]);

  // Initialize assets with all holdings
  useEffect(() => {
    const assetList: CryptoAsset[] = [];
    let portfolioValue = 0;
    let weightedChange = 0;
    
    // Add USDT if balance > 0
    if (usdtBalance > 0) {
      assetList.push({
        symbol: 'USDT',
        name: 'Tether',
        icon: <DollarSign size={20} className="text-green-400" />,
        balance: usdtBalance,
        usdValue: usdtBalance,
        change24h: 0, // Stablecoin, no change
        color: 'green'
      });
      portfolioValue += usdtBalance;
    }
    
    // Add BTC if balance > 0
    if (btcBalance > 0) {
      const btcPrice = getPriceForSymbol('BTC');
      const btcValue = btcBalance * btcPrice;
      const btcMarketData = marketData.find(data => data.symbol === 'BTCUSDT');
      const btcChangePercentage = btcMarketData?.change_24h || 0;
      const btcValueChange = btcValue * (btcChangePercentage / 100);

      assetList.push({
        symbol: 'BTC',
        name: 'Bitcoin',
        icon: <Bitcoin size={20} className="text-orange-400" />,
        balance: btcBalance,
        usdValue: btcValue,
        change24h: btcChangePercentage,
        color: 'orange'
      });

      portfolioValue += btcValue;
      weightedChange += btcValueChange;
    }
    
    // Add other assets if they have a balance > 0
    // Combine userAssets from props with assets from useDatabase hook
    const allAssets = [...userAssets, ...(assets || [])];
    // Create a Map to deduplicate assets by symbol
    const assetMap = new Map();
    allAssets.forEach(asset => {
      // Skip BTC and USDT as they're already handled above
      if (asset.asset_symbol === 'BTC' || asset.asset_symbol === 'USDT') return;
      
      // If we already have this asset, use the one with higher balance
      if (assetMap.has(asset.asset_symbol)) {
        const existing = assetMap.get(asset.asset_symbol);
        if (asset.balance > existing.balance) {
          assetMap.set(asset.asset_symbol, asset);
        }
      } else {
        assetMap.set(asset.asset_symbol, asset);
      }
    });
    
    // Process the deduplicated assets
    Array.from(assetMap.values()).forEach(asset => {
      if (asset.balance > 0) {
        // Get price using multi-strategy lookup
        const price = getPriceForSymbol(asset.asset_symbol);
        const assetMarketData = marketData.find(data => data.symbol === `${asset.asset_symbol}USDT`);
        const changePercentage = assetMarketData?.change_24h || 0;

        if (price > 0) {
          const usdValue = asset.balance * price;
          const valueChange = usdValue * (changePercentage / 100);

          // Get a color based on the asset symbol (for visual variety)
          const colors = ['blue', 'purple', 'indigo', 'pink', 'red', 'yellow', 'emerald', 'teal', 'cyan'];
          const colorIndex = asset.asset_symbol.charCodeAt(0) % colors.length;

          assetList.push({
            symbol: asset.asset_symbol,
            name: asset.asset_symbol, // We could improve this with a name lookup
            icon: <div className={`flex items-center justify-center w-5 h-5 rounded-full bg-${colors[colorIndex]}-500/20 text-${colors[colorIndex]}-400 text-xs font-bold`}>
              {asset.asset_symbol.substring(0, 2)}
            </div>,
            balance: asset.balance,
            usdValue,
            change24h: changePercentage,
            color: colors[colorIndex]
          });

          portfolioValue += usdValue;
          weightedChange += valueChange;
        }
      }
    });
    
    // Calculate total change percentage
    const totalChangePercentage = portfolioValue > 0 ? (weightedChange / portfolioValue) * 100 : 0;
    
    setCryptoAssets(assetList);
    setTotalValue(portfolioValue);
    setTotalChange(totalChangePercentage);
  }, [usdtBalance, btcBalance, marketData, userAssets, assets, getPriceForSymbol]);

  // Filter assets based on search term
  const filteredAssets = cryptoAssets.filter(asset => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      asset.symbol.toLowerCase().includes(term) ||
      asset.name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Total Portfolio Value */}
      <div className="app-surface-primary rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Euro size={20} className="text-green-400" />
            {t('wallet.totalPortfolioValue')}
          </h3>
          <button
            onClick={() => setShowBalances(!showBalances)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {showBalances ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="text-3xl font-bold text-white mb-2">
          {showBalances 
            ? formatFiat(totalValue)
            : '••••••'}
        </div>
        <div className={`text-sm flex items-center gap-1 ${totalChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {totalChange >= 0 ? (
            <TrendingUp size={14} />
          ) : (
            <TrendingDown size={14} />
          )}
          {totalChange >= 0 ? '+' : ''}{totalChange.toFixed(2)}% ({t('wallet.24h')})
        </div>
      </div>

      {/* Crypto Holdings */}
      <div className="app-surface-primary rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{t('wallet.cryptoHoldings')}</h3>
          <div className="text-xs text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">
            {cryptoAssets.length} {t('wallet.assets')}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('wallet.searchAssets')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-700/50 text-white pl-10 pr-4 py-2 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-sm"
          />
        </div>

        <div className="space-y-4">
          {filteredAssets.map((asset) => (
            <div 
              key={asset.symbol}
              className="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl hover:bg-slate-700/50 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 bg-${asset.color}-500/20 rounded-full flex items-center justify-center`}>
                  {asset.icon}
                </div>
                <div>
                  <div className="font-medium text-white">{asset.name}</div>
                  <div className="text-sm text-slate-400">{asset.symbol}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-white">
                  {showBalances ? asset.balance.toFixed(asset.symbol === 'USDT' ? 2 : 6) : '••••••'}
                </div>
                <div className="flex items-center justify-end gap-1 text-sm">
                  <span className="text-slate-400">
                    {showBalances ? formatFiat(asset.usdValue) : '••••••'}
                  </span>
                  {asset.change24h !== undefined && asset.change24h !== 0 && (
                    <span className={`flex items-center ${asset.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {asset.change24h >= 0 ? (
                        <TrendingUp size={12} className="mr-1" />
                      ) : (
                        <TrendingDown size={12} className="mr-1" />
                      )}
                      {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredAssets.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              {t('wallet.noAssetsFound', { searchTerm })}
            </div>
          )}
        </div>

        {/* Info Message */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
          <Info size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-blue-400 text-sm font-medium">{t('wallet.aboutCryptoHoldings')}</p>
            <p className="text-slate-300 text-xs mt-1">
              {t('wallet.aboutCryptoHoldingsDescription')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoHoldings;
