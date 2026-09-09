export interface CryptoPairConfig {
  symbol: string;
  name: string;
  type: 'crypto';
  active: boolean;
  priority: 'high' | 'normal';
}

export type CfdInstrumentType = 'forex' | 'commodity' | 'stock' | 'index';

export type MarketCategory =
  | 'indices'
  | 'forex'
  | 'commodities'
  | 'technology'
  | 'fintech'
  | 'finance'
  | 'automotive'
  | 'energy-materials'
  | 'private'
  | 'other';

export interface CfdInstrumentConfig {
  symbol: string;
  name: string;
  type: CfdInstrumentType;
  active: boolean;
  category?: MarketCategory;
  providerSymbol?: string;
  tradingViewSymbol?: string;
  tradable?: boolean;
  searchAliases?: string[];
}

export const TOP_CRYPTO_PAIRS: CryptoPairConfig[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', type: 'crypto', active: true, priority: 'high' },
  { symbol: 'ETHUSDT', name: 'Ethereum', type: 'crypto', active: true, priority: 'high' },
  { symbol: 'SOLUSDT', name: 'Solana', type: 'crypto', active: true, priority: 'high' },
  { symbol: 'BNBUSDT', name: 'BNB', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'XRPUSDT', name: 'XRP', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'ADAUSDT', name: 'Cardano', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'LINKUSDT', name: 'Chainlink', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'DOTUSDT', name: 'Polkadot', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'NEARUSDT', name: 'NEAR Protocol', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'LTCUSDT', name: 'Litecoin', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'UNIUSDT', name: 'Uniswap', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'SUIUSDT', name: 'Sui', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'APTUSDT', name: 'Aptos', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'ARBUSDT', name: 'Arbitrum', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'OPUSDT', name: 'Optimism', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'INJUSDT', name: 'Injective', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'POLUSDT', name: 'Polygon (POL)', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'ATOMUSDT', name: 'Cosmos', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'TRXUSDT', name: 'TRON', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'BCHUSDT', name: 'Bitcoin Cash', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'XLMUSDT', name: 'Stellar', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'XMRUSDT', name: 'Monero', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'HBARUSDT', name: 'Hedera', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'VETUSDT', name: 'VeChain', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'FILUSDT', name: 'Filecoin', type: 'crypto', active: true, priority: 'normal' },
  { symbol: '1000PEPEUSDT', name: 'Pepe (1000 contract)', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'SHIB1000USDT', name: 'Shiba Inu (1000 contract)', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'AAVEUSDT', name: 'Aave', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'SKYUSDT', name: 'Sky (formerly Maker)', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'ALGOUSDT', name: 'Algorand', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'XTZUSDT', name: 'Tezos', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'AUSDT', name: 'Vaulta (formerly EOS)', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'RENDERUSDT', name: 'Render', type: 'crypto', active: true, priority: 'normal' },
  { symbol: 'KASUSDT', name: 'Kaspa', type: 'crypto', active: true, priority: 'normal' },
];

const CFD_INSTRUMENTS_BASE: CfdInstrumentConfig[] = [
  // Forex Pairs - Majors
  { symbol: 'EUR/USD', name: 'Euro/US Dollar', type: 'forex', active: true },
  { symbol: 'GBP/USD', name: 'British Pound/US Dollar', type: 'forex', active: true },
  { symbol: 'AUD/USD', name: 'Australian Dollar/US Dollar', type: 'forex', active: true },
  { symbol: 'NZD/USD', name: 'New Zealand Dollar/US Dollar', type: 'forex', active: true },
  { symbol: 'USD/JPY', name: 'US Dollar/Japanese Yen', type: 'forex', active: true },
  { symbol: 'USD/CHF', name: 'US Dollar/Swiss Franc', type: 'forex', active: true },
  { symbol: 'USD/CAD', name: 'US Dollar/Canadian Dollar', type: 'forex', active: true },

  // Forex Pairs - Crosses (Minors)
  { symbol: 'EUR/JPY', name: 'Euro/Japanese Yen', type: 'forex', active: true },
  { symbol: 'EUR/GBP', name: 'Euro/British Pound', type: 'forex', active: true },
  { symbol: 'EUR/AUD', name: 'Euro/Australian Dollar', type: 'forex', active: true },
  { symbol: 'EUR/CHF', name: 'Euro/Swiss Franc', type: 'forex', active: true },
  { symbol: 'EUR/CAD', name: 'Euro/Canadian Dollar', type: 'forex', active: true },
  { symbol: 'EUR/NZD', name: 'Euro/New Zealand Dollar', type: 'forex', active: true },
  { symbol: 'GBP/JPY', name: 'British Pound/Japanese Yen', type: 'forex', active: true },
  { symbol: 'GBP/AUD', name: 'British Pound/Australian Dollar', type: 'forex', active: true },
  { symbol: 'GBP/CHF', name: 'British Pound/Swiss Franc', type: 'forex', active: true },
  { symbol: 'GBP/CAD', name: 'British Pound/Canadian Dollar', type: 'forex', active: true },
  { symbol: 'GBP/NZD', name: 'British Pound/New Zealand Dollar', type: 'forex', active: true },
  { symbol: 'AUD/CAD', name: 'Australian Dollar/Canadian Dollar', type: 'forex', active: true },
  { symbol: 'AUD/CHF', name: 'Australian Dollar/Swiss Franc', type: 'forex', active: true },
  { symbol: 'AUD/JPY', name: 'Australian Dollar/Japanese Yen', type: 'forex', active: true },
  { symbol: 'AUD/NZD', name: 'Australian Dollar/New Zealand Dollar', type: 'forex', active: true },
  { symbol: 'NZD/JPY', name: 'New Zealand Dollar/Japanese Yen', type: 'forex', active: true },
  { symbol: 'NZD/CHF', name: 'New Zealand Dollar/Swiss Franc', type: 'forex', active: true },
  { symbol: 'NZD/CAD', name: 'New Zealand Dollar/Canadian Dollar', type: 'forex', active: true },
  { symbol: 'CAD/JPY', name: 'Canadian Dollar/Japanese Yen', type: 'forex', active: true },
  { symbol: 'CAD/CHF', name: 'Canadian Dollar/Swiss Franc', type: 'forex', active: true },
  { symbol: 'CHF/JPY', name: 'Swiss Franc/Japanese Yen', type: 'forex', active: true },

  // Forex Pairs - Popular Exotics
  { symbol: 'USD/TRY', name: 'US Dollar/Turkish Lira', type: 'forex', active: true },
  { symbol: 'EUR/TRY', name: 'Euro/Turkish Lira', type: 'forex', active: true },
  { symbol: 'USD/ZAR', name: 'US Dollar/South African Rand', type: 'forex', active: true },
  { symbol: 'USD/HKD', name: 'US Dollar/Hong Kong Dollar', type: 'forex', active: true },
  { symbol: 'USD/SGD', name: 'US Dollar/Singapore Dollar', type: 'forex', active: true },
  { symbol: 'USD/DKK', name: 'US Dollar/Danish Krone', type: 'forex', active: true },
  { symbol: 'USD/NOK', name: 'US Dollar/Norwegian Krone', type: 'forex', active: true },
  { symbol: 'USD/SEK', name: 'US Dollar/Swedish Krona', type: 'forex', active: true },
  { symbol: 'USD/PLN', name: 'US Dollar/Polish Zloty', type: 'forex', active: true },
  { symbol: 'USD/HUF', name: 'US Dollar/Hungarian Forint', type: 'forex', active: true },
  { symbol: 'USD/CZK', name: 'US Dollar/Czech Koruna', type: 'forex', active: true },
  { symbol: 'USD/MXN', name: 'US Dollar/Mexican Peso', type: 'forex', active: true },
  { symbol: 'USD/BRL', name: 'US Dollar/Brazilian Real', type: 'forex', active: true },
  { symbol: 'USD/CNH', name: 'US Dollar/Chinese Yuan Offshore', type: 'forex', active: true },
  { symbol: 'USD/THB', name: 'US Dollar/Thai Baht', type: 'forex', active: true },
  { symbol: 'USD/IDR', name: 'US Dollar/Indonesian Rupiah', type: 'forex', active: true },

  // Forex Pairs - Asian & Pacific
  { symbol: 'AUD/SGD', name: 'Australian Dollar/Singapore Dollar', type: 'forex', active: true },
  { symbol: 'AUD/HKD', name: 'Australian Dollar/Hong Kong Dollar', type: 'forex', active: true },
  { symbol: 'NZD/SGD', name: 'New Zealand Dollar/Singapore Dollar', type: 'forex', active: true },
  { symbol: 'SGD/JPY', name: 'Singapore Dollar/Japanese Yen', type: 'forex', active: true },
  { symbol: 'HKD/JPY', name: 'Hong Kong Dollar/Japanese Yen', type: 'forex', active: true },
  { symbol: 'USD/TWD', name: 'US Dollar/Taiwan Dollar', type: 'forex', active: true },
  { symbol: 'USD/KRW', name: 'US Dollar/South Korean Won', type: 'forex', active: true },
  { symbol: 'USD/INR', name: 'US Dollar/Indian Rupee', type: 'forex', active: true },
  { symbol: 'USD/PHP', name: 'US Dollar/Philippine Peso', type: 'forex', active: true },
  { symbol: 'USD/MYR', name: 'US Dollar/Malaysian Ringgit', type: 'forex', active: true },

  // Forex Pairs - Scandinavian & Europe
  { symbol: 'EUR/SEK', name: 'Euro/Swedish Krona', type: 'forex', active: true },
  { symbol: 'EUR/NOK', name: 'Euro/Norwegian Krone', type: 'forex', active: true },
  { symbol: 'EUR/DKK', name: 'Euro/Danish Krone', type: 'forex', active: true },
  { symbol: 'EUR/PLN', name: 'Euro/Polish Zloty', type: 'forex', active: true },
  { symbol: 'EUR/HUF', name: 'Euro/Hungarian Forint', type: 'forex', active: true },
  { symbol: 'EUR/CZK', name: 'Euro/Czech Koruna', type: 'forex', active: true },

  // Forex Pairs - Middle East
  { symbol: 'USD/SAR', name: 'US Dollar/Saudi Riyal', type: 'forex', active: true },
  { symbol: 'USD/AED', name: 'US Dollar/UAE Dirham', type: 'forex', active: true },
  { symbol: 'USD/QAR', name: 'US Dollar/Qatari Riyal', type: 'forex', active: true },
  { symbol: 'USD/ILS', name: 'US Dollar/Israeli Shekel', type: 'forex', active: true },
  { symbol: 'EUR/ILS', name: 'Euro/Israeli Shekel', type: 'forex', active: true },

  // Forex Pairs - Latin America
  { symbol: 'USD/CLP', name: 'US Dollar/Chilean Peso', type: 'forex', active: true },
  { symbol: 'USD/COP', name: 'US Dollar/Colombian Peso', type: 'forex', active: true },
  { symbol: 'USD/PEN', name: 'US Dollar/Peruvian Sol', type: 'forex', active: true },

  // Forex Pairs - Africa
  { symbol: 'EUR/ZAR', name: 'Euro/South African Rand', type: 'forex', active: true },
  { symbol: 'GBP/ZAR', name: 'British Pound/South African Rand', type: 'forex', active: true },
  { symbol: 'AUD/ZAR', name: 'Australian Dollar/South African Rand', type: 'forex', active: true },

  // Approved Commodities Only
  // Working Commodities (from your WebSocket test)
  { symbol: 'XAG/USD', name: 'Silver/USD', type: 'commodity', active: true },
  { symbol: 'NATGAS/USD', name: 'Natural Gas', type: 'commodity', active: true },
  { symbol: 'BCO/USD', name: 'Brent Crude', type: 'commodity', active: true },
  { symbol: 'WTICO/USD', name: 'WTI Crude Oil', type: 'commodity', active: true },
  { symbol: 'XPT/USD', name: 'Platinum/USD', type: 'commodity', active: true },
  { symbol: 'XAU/USD', name: 'Gold/USD', type: 'commodity', active: true },
  { symbol: 'XPD/USD', name: 'Palladium/USD', type: 'commodity', active: true },
  { symbol: 'CORN/USD', name: 'Corn', type: 'commodity', active: true },
  { symbol: 'WHEAT/USD', name: 'Wheat', type: 'commodity', active: true },
  { symbol: 'SUGAR/USD', name: 'Sugar', type: 'commodity', active: true },

  // Major US Stocks
  { symbol: 'BA', name: 'Boeing Company', type: 'stock', active: true },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'stock', active: true },
  { symbol: 'GS', name: 'Goldman Sachs', type: 'stock', active: true },
  { symbol: 'BAC', name: 'Bank of America', type: 'stock', active: true },
  { symbol: 'WMT', name: 'Walmart', type: 'stock', active: true },
  { symbol: 'DIS', name: 'Disney', type: 'stock', active: true },
  { symbol: 'CVX', name: 'Chevron', type: 'stock', active: true },

  // More US Stocks
  { symbol: 'UBER', name: 'Uber Technologies Inc.', type: 'stock', active: true },
  { symbol: 'LYFT', name: 'Lyft Inc.', type: 'stock', active: true },
  { symbol: 'PFE', name: 'Pfizer Inc.', type: 'stock', active: true },
  { symbol: 'MRNA', name: 'Moderna Inc.', type: 'stock', active: true },
  { symbol: 'KO', name: 'Coca-Cola Company', type: 'stock', active: true },
  { symbol: 'PEP', name: 'PepsiCo Inc.', type: 'stock', active: true },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', type: 'stock', active: true },
  { symbol: 'T', name: 'AT&T', type: 'stock', active: true },
  { symbol: 'V', name: 'Visa Inc.', type: 'stock', active: true },
  { symbol: 'MA', name: 'Mastercard Inc.', type: 'stock', active: true },

  // Additional US Stocks
  { symbol: 'COST', name: 'Costco Wholesale Corporation', type: 'stock', active: true },
  { symbol: 'INTU', name: 'Intuit Inc.', type: 'stock', active: true },
  { symbol: 'SBUX', name: 'Starbucks Corporation', type: 'stock', active: true },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', type: 'stock', active: true },
  { symbol: 'LOW', name: 'Lowe\'s Companies Inc.', type: 'stock', active: true },
  { symbol: 'HD', name: 'Home Depot Inc.', type: 'stock', active: true },
  { symbol: 'CAT', name: 'Caterpillar Inc.', type: 'stock', active: true },
  { symbol: 'HON', name: 'Honeywell International Inc.', type: 'stock', active: true },
  { symbol: 'AMGN', name: 'Amgen Inc.', type: 'stock', active: true },
  { symbol: 'LLY', name: 'Eli Lilly and Company', type: 'stock', active: true },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', type: 'stock', active: true },
  { symbol: 'ABT', name: 'Abbott Laboratories', type: 'stock', active: true },
  { symbol: 'CVS', name: 'CVS Health Corporation', type: 'stock', active: true },
  { symbol: 'WFC', name: 'Wells Fargo & Company', type: 'stock', active: true },
  { symbol: 'MS', name: 'Morgan Stanley', type: 'stock', active: true },
  { symbol: 'AXP', name: 'American Express Company', type: 'stock', active: true },
  { symbol: 'BLK', name: 'BlackRock Inc.', type: 'stock', active: true },
  { symbol: 'C', name: 'Citigroup Inc.', type: 'stock', active: true },
  { symbol: 'BK', name: 'Bank of New York Mellon Corp', type: 'stock', active: true },
  { symbol: 'TGT', name: 'Target Corporation', type: 'stock', active: true },
  { symbol: 'NKE', name: 'Nike Inc.', type: 'stock', active: true },

  // Global Indices & ETFs
  { symbol: 'CAC', name: 'France CAC 40', type: 'index', active: true },
  { symbol: 'ASX', name: 'Australia ASX 200', type: 'index', active: true },
  { symbol: 'SPY', name: 'S&P 500 (SPY proxy)', type: 'index', active: true },
  { symbol: 'QQQ', name: 'Nasdaq 100 (QQQ proxy)', type: 'index', active: true },
  { symbol: 'DIA', name: 'Dow Jones Industrial Average', type: 'index', active: false },
  { symbol: 'IWM', name: 'Russell 2000 (IWM proxy)', type: 'index', active: true },
  { symbol: 'VTI', name: 'Total US Stock Market ETF', type: 'index', active: true },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', type: 'index', active: true },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', type: 'index', active: true },
  { symbol: 'IYR', name: 'iShares US Real Estate ETF', type: 'index', active: true },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', type: 'index', active: true },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', type: 'index', active: true },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', type: 'index', active: true },
  { symbol: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', type: 'index', active: true },
  { symbol: 'GLD', name: 'SPDR Gold Trust', type: 'index', active: true },
  { symbol: 'SLV', name: 'iShares Silver Trust', type: 'index', active: true },
  { symbol: 'BITO', name: 'ProShares Bitcoin Strategy ETF', type: 'index', active: true },
  { symbol: 'SPYD', name: 'SPDR Portfolio S&P 500 High Dividend ETF', type: 'index', active: true },
  { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', type: 'index', active: true },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'index', active: true },

  // Requested global indices. Proxy-backed markets are labelled explicitly.
  { symbol: 'UKX', name: 'FTSE 100', type: 'index', active: false, category: 'indices' },
  { symbol: 'DAX', name: 'DAX', type: 'index', active: false, category: 'indices' },
  { symbol: 'FTSEMIB', name: 'FTSE MIB', type: 'index', active: false, category: 'indices' },
  { symbol: 'NI225', name: 'Nikkei 225 (EWJ proxy)', type: 'index', active: true, category: 'indices', providerSymbol: 'EWJUSDT' },
  { symbol: 'HSI', name: 'Hang Seng', type: 'index', active: false, category: 'indices' },
  { symbol: 'STOXX50', name: 'Euro Stoxx 50 (STXX proxy)', type: 'index', active: true, category: 'indices', providerSymbol: 'STXXUSDT' },
  { symbol: 'IBEX35', name: 'IBEX 35', type: 'index', active: false, category: 'indices' },
  { symbol: 'SMI', name: 'Swiss Market Index', type: 'index', active: false, category: 'indices' },
  { symbol: 'AEX', name: 'AEX', type: 'index', active: false, category: 'indices' },
  { symbol: 'KOSPI', name: 'KOSPI (EWY proxy)', type: 'index', active: true, category: 'indices', providerSymbol: 'EWYUSDT' },
  { symbol: 'NIFTY50', name: 'Nifty 50', type: 'index', active: false, category: 'indices' },
  { symbol: 'SENSEX', name: 'Sensex', type: 'index', active: false, category: 'indices' },
  { symbol: 'TSX60', name: 'S&P/TSX 60', type: 'index', active: false, category: 'indices' },
  { symbol: 'IBOV', name: 'Bovespa', type: 'index', active: false, category: 'indices' },
  { symbol: 'MSCIWORLD', name: 'MSCI World', type: 'index', active: false, category: 'indices' },

  // Additional requested commodities awaiting a verified live quote source.
  { symbol: 'COPPER/USD', name: 'Copper', type: 'commodity', active: false, category: 'commodities' },
  { symbol: 'SOYBN/USD', name: 'Soybeans', type: 'commodity', active: false, category: 'commodities' },
  { symbol: 'COFFEE/USD', name: 'Coffee', type: 'commodity', active: false, category: 'commodities' },
  { symbol: 'COCOA/USD', name: 'Cocoa', type: 'commodity', active: false, category: 'commodities' },
  { symbol: 'COTTON/USD', name: 'Cotton', type: 'commodity', active: false, category: 'commodities' },

  // Requested technology, growth, mobility, media, and fintech equities.
  // `active` is true only when the existing Atlas price feed has been verified.
  { symbol: 'AAPL', name: 'Apple', type: 'stock', active: true, category: 'technology' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock', active: true, category: 'technology' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock', active: true, category: 'technology' },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock', active: true, category: 'technology' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', type: 'stock', active: true, category: 'technology' },
  { symbol: 'META', name: 'Meta Platforms', type: 'stock', active: true, category: 'technology' },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock', active: true, category: 'technology' },
  { symbol: 'NFLX', name: 'Netflix', type: 'stock', active: true, category: 'technology' },
  { symbol: 'AMD', name: 'Advanced Micro Devices (AMD)', type: 'stock', active: true, category: 'technology' },
  { symbol: 'INTC', name: 'Intel', type: 'stock', active: true, category: 'technology' },
  { symbol: 'ORCL', name: 'Oracle', type: 'stock', active: true, category: 'technology' },
  { symbol: 'IBM', name: 'IBM', type: 'stock', active: true, category: 'technology' },
  { symbol: 'ADBE', name: 'Adobe', type: 'stock', active: true, category: 'technology' },
  { symbol: 'CRM', name: 'Salesforce', type: 'stock', active: true, category: 'technology' },
  { symbol: 'NOW', name: 'ServiceNow', type: 'stock', active: true, category: 'technology' },
  { symbol: 'PLTR', name: 'Palantir Technologies', type: 'stock', active: true, category: 'technology' },
  { symbol: 'AVGO', name: 'Broadcom', type: 'stock', active: true, category: 'technology' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor (TSMC)', type: 'stock', active: true, category: 'technology' },
  { symbol: 'ASML', name: 'ASML Holding', type: 'stock', active: true, category: 'technology' },
  { symbol: 'ARM', name: 'Arm Holdings', type: 'stock', active: true, category: 'technology' },
  { symbol: 'QCOM', name: 'Qualcomm', type: 'stock', active: true, category: 'technology' },
  { symbol: 'MU', name: 'Micron Technology', type: 'stock', active: true, category: 'technology' },
  { symbol: 'MRVL', name: 'Marvell Technology', type: 'stock', active: true, category: 'technology' },
  { symbol: 'TXN', name: 'Texas Instruments', type: 'stock', active: true, category: 'technology' },
  { symbol: 'AMAT', name: 'Applied Materials', type: 'stock', active: true, category: 'technology' },
  { symbol: 'LRCX', name: 'Lam Research', type: 'stock', active: true, category: 'technology' },
  { symbol: 'KLAC', name: 'KLA Corporation', type: 'stock', active: true, category: 'technology' },
  { symbol: 'SNPS', name: 'Synopsys', type: 'stock', active: false, category: 'technology' },
  { symbol: 'CDNS', name: 'Cadence Design Systems', type: 'stock', active: false, category: 'technology' },
  { symbol: 'GFS', name: 'GlobalFoundries', type: 'stock', active: false, category: 'technology' },
  { symbol: 'ON', name: 'ON Semiconductor', type: 'stock', active: false, category: 'technology' },
  { symbol: 'NXPI', name: 'NXP Semiconductors', type: 'stock', active: false, category: 'technology' },
  { symbol: 'CSCO', name: 'Cisco Systems', type: 'stock', active: true, category: 'technology' },
  { symbol: 'ANET', name: 'Arista Networks', type: 'stock', active: false, category: 'technology' },
  { symbol: 'DELL', name: 'Dell Technologies', type: 'stock', active: true, category: 'technology' },
  { symbol: 'HPE', name: 'Hewlett Packard Enterprise', type: 'stock', active: true, category: 'technology' },
  { symbol: 'SMCI', name: 'Super Micro Computer', type: 'stock', active: true, category: 'technology' },
  { symbol: 'NTAP', name: 'NetApp', type: 'stock', active: false, category: 'technology' },
  { symbol: 'PSTG', name: 'Pure Storage', type: 'stock', active: false, category: 'technology' },
  { symbol: 'SNOW', name: 'Snowflake', type: 'stock', active: true, category: 'technology' },
  { symbol: 'DDOG', name: 'Datadog', type: 'stock', active: false, category: 'technology' },
  { symbol: 'MDB', name: 'MongoDB', type: 'stock', active: false, category: 'technology' },
  { symbol: 'NET', name: 'Cloudflare', type: 'stock', active: false, category: 'technology' },
  { symbol: 'CRWD', name: 'CrowdStrike', type: 'stock', active: true, category: 'technology' },
  { symbol: 'PANW', name: 'Palo Alto Networks', type: 'stock', active: false, category: 'technology' },
  { symbol: 'FTNT', name: 'Fortinet', type: 'stock', active: false, category: 'technology' },
  { symbol: 'CHKP', name: 'Check Point Software', type: 'stock', active: false, category: 'technology' },
  { symbol: 'OKTA', name: 'Okta', type: 'stock', active: false, category: 'technology' },
  { symbol: 'ZS', name: 'Zscaler', type: 'stock', active: false, category: 'technology' },
  { symbol: 'CYBR', name: 'CyberArk (acquired by Palo Alto Networks)', type: 'stock', active: false, category: 'technology', tradable: false },
  { symbol: 'S', name: 'SentinelOne', type: 'stock', active: false, category: 'technology' },
  { symbol: 'SHOP', name: 'Shopify', type: 'stock', active: true, category: 'technology' },
  { symbol: 'PATH', name: 'UiPath', type: 'stock', active: false, category: 'technology' },
  { symbol: 'AI', name: 'C3.ai', type: 'stock', active: false, category: 'technology' },
  { symbol: 'BIDU', name: 'Baidu', type: 'stock', active: false, category: 'technology' },
  { symbol: 'BABA', name: 'Alibaba', type: 'stock', active: false, category: 'technology' },
  { symbol: '0700.HK', name: 'Tencent', type: 'stock', active: false, category: 'technology' },
  { symbol: 'DOCN', name: 'DigitalOcean', type: 'stock', active: false, category: 'technology' },
  { symbol: 'AKAM', name: 'Akamai Technologies', type: 'stock', active: false, category: 'technology' },
  { symbol: 'FSLY', name: 'Fastly', type: 'stock', active: false, category: 'technology' },
  { symbol: 'ADI', name: 'Analog Devices', type: 'stock', active: false, category: 'technology' },
  { symbol: 'MCHP', name: 'Microchip Technology', type: 'stock', active: false, category: 'technology' },
  { symbol: 'SWKS', name: 'Skyworks Solutions', type: 'stock', active: false, category: 'technology' },
  { symbol: 'COHR', name: 'Coherent', type: 'stock', active: false, category: 'technology' },
  { symbol: 'ALAB', name: 'Astera Labs', type: 'stock', active: false, category: 'technology' },
  { symbol: 'RMBS', name: 'Rambus', type: 'stock', active: false, category: 'technology' },
  { symbol: 'WOLF', name: 'Wolfspeed', type: 'stock', active: false, category: 'technology' },
  { symbol: 'IONQ', name: 'IonQ', type: 'stock', active: false, category: 'technology' },
  { symbol: 'RGTI', name: 'Rigetti Computing', type: 'stock', active: false, category: 'technology' },
  { symbol: 'QBTS', name: 'D-Wave Quantum', type: 'stock', active: false, category: 'technology' },
  { symbol: 'QUBT', name: 'Quantum Computing Inc.', type: 'stock', active: false, category: 'technology' },
  { symbol: 'GEN', name: 'Gen Digital', type: 'stock', active: false, category: 'technology' },
  { symbol: 'RPD', name: 'Rapid7', type: 'stock', active: false, category: 'technology' },
  { symbol: 'TENB', name: 'Tenable', type: 'stock', active: false, category: 'technology' },
  { symbol: 'QLYS', name: 'Qualys', type: 'stock', active: false, category: 'technology' },
  { symbol: 'TER', name: 'Teradyne', type: 'stock', active: false, category: 'technology' },
  { symbol: 'ROK', name: 'Rockwell Automation', type: 'stock', active: false, category: 'technology' },
  { symbol: '6861.T', name: 'Keyence', type: 'stock', active: false, category: 'technology' },
  { symbol: '6954.T', name: 'Fanuc', type: 'stock', active: false, category: 'technology' },
  { symbol: '1211.HK', name: 'BYD', type: 'stock', active: false, category: 'automotive' },
  { symbol: 'RIVN', name: 'Rivian', type: 'stock', active: true, category: 'automotive' },
  { symbol: 'LCID', name: 'Lucid', type: 'stock', active: false, category: 'automotive' },
  { symbol: 'QS', name: 'QuantumScape', type: 'stock', active: false, category: 'automotive' },
  { symbol: 'ENPH', name: 'Enphase Energy', type: 'stock', active: false, category: 'energy-materials' },
  { symbol: 'EA', name: 'Electronic Arts', type: 'stock', active: false, category: 'technology' },
  { symbol: 'TTWO', name: 'Take-Two Interactive', type: 'stock', active: false, category: 'technology' },
  { symbol: 'RBLX', name: 'Roblox', type: 'stock', active: false, category: 'technology' },
  { symbol: 'SPOT', name: 'Spotify', type: 'stock', active: false, category: 'technology' },
  { symbol: 'PINS', name: 'Pinterest', type: 'stock', active: false, category: 'technology' },
  { symbol: 'SNAP', name: 'Snap', type: 'stock', active: false, category: 'technology' },
  { symbol: 'MELI', name: 'MercadoLibre', type: 'stock', active: false, category: 'fintech' },
  { symbol: 'SE', name: 'Sea Limited', type: 'stock', active: false, category: 'fintech' },
  { symbol: 'XYZ', name: 'Block (formerly Square)', type: 'stock', active: false, category: 'fintech', searchAliases: ['SQ', 'Square'] },
  { symbol: 'PYPL', name: 'PayPal', type: 'stock', active: true, category: 'fintech' },
  { symbol: 'COIN', name: 'Coinbase', type: 'stock', active: true, category: 'fintech' },
  { symbol: 'HOOD', name: 'Robinhood', type: 'stock', active: true, category: 'fintech' },

  // Fintech and payments
  { symbol: 'SOFI', name: 'SoFi Technologies', type: 'stock', active: false, category: 'fintech' },
  { symbol: 'ADYEN', name: 'Adyen', type: 'stock', active: false, category: 'fintech' },
  { symbol: 'WISE', name: 'Wise', type: 'stock', active: false, category: 'fintech' },
  { symbol: 'FI', name: 'Fiserv', type: 'stock', active: false, category: 'fintech' },
  { symbol: 'GPN', name: 'Global Payments', type: 'stock', active: false, category: 'fintech' },
  { symbol: 'NU', name: 'Nu Holdings', type: 'stock', active: false, category: 'fintech' },

  // Banking and finance
  { symbol: 'BRK.B', name: 'Berkshire Hathaway', type: 'stock', active: false, category: 'finance' },

  // Automotive companies
  { symbol: 'RACE', name: 'Ferrari', type: 'stock', active: false, category: 'automotive' },
  { symbol: 'TM', name: 'Toyota', type: 'stock', active: false, category: 'automotive' },
  { symbol: 'SONY', name: 'Sony', type: 'stock', active: true, category: 'automotive' },
  { symbol: 'SAMSUNG', name: 'Samsung Electronics', type: 'stock', active: true, category: 'automotive' },
  { symbol: 'XIAOMI', name: 'Xiaomi', type: 'stock', active: false, category: 'automotive' },

  // Energy and materials
  { symbol: 'SHEL', name: 'Shell', type: 'stock', active: false, category: 'energy-materials' },
  { symbol: 'BP', name: 'BP', type: 'stock', active: false, category: 'energy-materials' },
  { symbol: 'TTE', name: 'TotalEnergies', type: 'stock', active: false, category: 'energy-materials' },
  { symbol: 'COP', name: 'ConocoPhillips', type: 'stock', active: false, category: 'energy-materials' },
  { symbol: 'RIO', name: 'Rio Tinto', type: 'stock', active: false, category: 'energy-materials' },
  { symbol: 'BHP', name: 'BHP', type: 'stock', active: false, category: 'energy-materials' },
  { symbol: 'GLEN', name: 'Glencore', type: 'stock', active: false, category: 'energy-materials' },

  // Private companies are intentionally informational and never tradable as public equity.
  { symbol: 'SPACEX', name: 'SpaceX — Private Company', type: 'stock', active: false, category: 'private', tradable: false },
  { symbol: 'OPENAI', name: 'OpenAI — Private Company', type: 'stock', active: false, category: 'private', tradable: false }
];

const PROVIDER_SYMBOL_OVERRIDES: Record<string, string> = {
  SPY: 'SPYUSDT',
  QQQ: 'QQQUSDT',
  IWM: 'IWMUSDT',
  AAPL: 'AAPLUSDT',
  MSFT: 'MSFTUSDT',
  GOOGL: 'GOOGLUSDT',
  AMZN: 'AMZNUSDT',
  TSLA: 'TSLAUSDT',
  META: 'METAUSDT',
  NFLX: 'NFLXUSDT',
  NVDA: 'NVDAUSDT',
  AMD: 'AMDSTOCKUSDT',
  INTC: 'INTCUSDT',
  ORCL: 'ORCLUSDT',
  IBM: 'IBMUSDT',
  ADBE: 'ADBEUSDT',
  NOW: 'NOWUSDT',
  PLTR: 'PLTRUSDT',
  AVGO: 'AVGOUSDT',
  TSM: 'TSMUSDT',
  ASML: 'ASMLUSDT',
  ARM: 'ARMUSDT',
  QCOM: 'QCOMUSDT',
  MU: 'MUUSDT',
  MRVL: 'MRVLUSDT',
  TXN: 'TXNUSDT',
  AMAT: 'AMATUSDT',
  LRCX: 'LRCXUSDT',
  KLAC: 'KLACUSDT',
  CSCO: 'CSCOUSDT',
  DELL: 'DELLUSDT',
  HPE: 'HPEUSDT',
  SMCI: 'SMCIUSDT',
  SNOW: 'SNOWUSDT',
  CRWD: 'CRWDUSDT',
  COIN: 'COINUSDT',
  HOOD: 'HOODUSDT',
  RIVN: 'RIVNUSDT',
  SONY: 'SONYUSDT',
  SAMSUNG: 'SAMSUNGUSDT'
};

const TRADING_VIEW_SYMBOL_OVERRIDES: Record<string, string> = {
  SPY: 'SP:SPX',
  QQQ: 'NASDAQ:NDX',
  DIA: 'DJ:DJI',
  IWM: 'TVC:RUT',
  CAC: 'EURONEXT:PX1',
  ASX: 'ASX:XJO',
  UKX: 'TVC:UKX',
  DAX: 'XETR:DAX',
  FTSEMIB: 'MIL:FTSEMIB',
  NI225: 'TVC:NI225',
  HSI: 'TVC:HSI',
  STOXX50: 'TVC:SX5E',
  IBEX35: 'BME:IBC',
  SMI: 'SIX:SMI',
  AEX: 'EURONEXT:AEX',
  KOSPI: 'KRX:KOSPI',
  NIFTY50: 'NSE:NIFTY',
  SENSEX: 'BSE:SENSEX',
  IBOV: 'BMFBOVESPA:IBOV',
  AAPL: 'NASDAQ:AAPL',
  MSFT: 'NASDAQ:MSFT',
  NVDA: 'NASDAQ:NVDA',
  AMZN: 'NASDAQ:AMZN',
  GOOGL: 'NASDAQ:GOOGL',
  META: 'NASDAQ:META',
  TSLA: 'NASDAQ:TSLA',
  NFLX: 'NASDAQ:NFLX',
  AMD: 'NASDAQ:AMD',
  INTC: 'NASDAQ:INTC',
  ORCL: 'NYSE:ORCL',
  IBM: 'NYSE:IBM',
  ADBE: 'NASDAQ:ADBE',
  CRM: 'NYSE:CRM',
  NOW: 'NYSE:NOW',
  PLTR: 'NASDAQ:PLTR',
  AVGO: 'NASDAQ:AVGO',
  TSM: 'NYSE:TSM',
  ASML: 'NASDAQ:ASML',
  ARM: 'NASDAQ:ARM',
  QCOM: 'NASDAQ:QCOM',
  MU: 'NASDAQ:MU',
  MRVL: 'NASDAQ:MRVL',
  TXN: 'NASDAQ:TXN',
  AMAT: 'NASDAQ:AMAT',
  LRCX: 'NASDAQ:LRCX',
  KLAC: 'NASDAQ:KLAC',
  SNPS: 'NASDAQ:SNPS',
  CDNS: 'NASDAQ:CDNS',
  GFS: 'NASDAQ:GFS',
  ON: 'NASDAQ:ON',
  NXPI: 'NASDAQ:NXPI',
  CSCO: 'NASDAQ:CSCO',
  ANET: 'NYSE:ANET',
  DELL: 'NYSE:DELL',
  HPE: 'NYSE:HPE',
  SMCI: 'NASDAQ:SMCI',
  NTAP: 'NASDAQ:NTAP',
  PSTG: 'NYSE:PSTG',
  SNOW: 'NYSE:SNOW',
  DDOG: 'NASDAQ:DDOG',
  MDB: 'NASDAQ:MDB',
  NET: 'NYSE:NET',
  CRWD: 'NASDAQ:CRWD',
  PANW: 'NASDAQ:PANW',
  FTNT: 'NASDAQ:FTNT',
  CHKP: 'NASDAQ:CHKP',
  OKTA: 'NASDAQ:OKTA',
  ZS: 'NASDAQ:ZS',
  CYBR: 'NASDAQ:CYBR',
  S: 'NYSE:S',
  SHOP: 'NASDAQ:SHOP',
  PATH: 'NYSE:PATH',
  AI: 'NYSE:AI',
  BIDU: 'NASDAQ:BIDU',
  BABA: 'NYSE:BABA',
  '0700.HK': 'HKEX:700',
  DOCN: 'NYSE:DOCN',
  AKAM: 'NASDAQ:AKAM',
  FSLY: 'NYSE:FSLY',
  ADI: 'NASDAQ:ADI',
  MCHP: 'NASDAQ:MCHP',
  SWKS: 'NASDAQ:SWKS',
  COHR: 'NYSE:COHR',
  ALAB: 'NASDAQ:ALAB',
  RMBS: 'NASDAQ:RMBS',
  WOLF: 'NYSE:WOLF',
  IONQ: 'NYSE:IONQ',
  RGTI: 'NASDAQ:RGTI',
  QBTS: 'NYSE:QBTS',
  QUBT: 'NASDAQ:QUBT',
  GEN: 'NASDAQ:GEN',
  RPD: 'NASDAQ:RPD',
  TENB: 'NASDAQ:TENB',
  QLYS: 'NASDAQ:QLYS',
  TER: 'NASDAQ:TER',
  ROK: 'NYSE:ROK',
  '6861.T': 'TSE:6861',
  '6954.T': 'TSE:6954',
  '1211.HK': 'HKEX:1211',
  RIVN: 'NASDAQ:RIVN',
  LCID: 'NASDAQ:LCID',
  QS: 'NYSE:QS',
  ENPH: 'NASDAQ:ENPH',
  EA: 'NASDAQ:EA',
  TTWO: 'NASDAQ:TTWO',
  RBLX: 'NYSE:RBLX',
  SPOT: 'NYSE:SPOT',
  PINS: 'NYSE:PINS',
  SNAP: 'NYSE:SNAP',
  MELI: 'NASDAQ:MELI',
  SE: 'NYSE:SE',
  XYZ: 'NYSE:XYZ',
  PYPL: 'NASDAQ:PYPL',
  COIN: 'NASDAQ:COIN',
  HOOD: 'NASDAQ:HOOD',
  'BRK.B': 'NYSE:BRK.B',
  SAMSUNG: 'KRX:005930',
  XIAOMI: 'HKEX:1810'
};

const CATEGORY_SYMBOLS: Partial<Record<MarketCategory, readonly string[]>> = {
  fintech: ['V', 'MA', 'PYPL'],
  finance: ['JPM', 'GS', 'MS', 'BAC', 'WFC', 'C'],
  'energy-materials': ['XOM', 'CVX']
};

const inferCategory = (instrument: CfdInstrumentConfig): MarketCategory => {
  if (instrument.category) return instrument.category;
  if (instrument.type === 'index') return 'indices';
  if (instrument.type === 'forex') return 'forex';
  if (instrument.type === 'commodity') return 'commodities';

  for (const [category, symbols] of Object.entries(CATEGORY_SYMBOLS)) {
    if (symbols?.includes(instrument.symbol)) return category as MarketCategory;
  }

  return 'other';
};

const inferProviderSymbol = (instrument: CfdInstrumentConfig): string => {
  if (instrument.providerSymbol) return instrument.providerSymbol;
  if (PROVIDER_SYMBOL_OVERRIDES[instrument.symbol]) {
    return PROVIDER_SYMBOL_OVERRIDES[instrument.symbol];
  }
  if (instrument.type === 'forex' || instrument.type === 'commodity') {
    return instrument.symbol.replace('/', '');
  }
  return instrument.symbol;
};

export const CFD_INSTRUMENTS: CfdInstrumentConfig[] = CFD_INSTRUMENTS_BASE.map(instrument => ({
  ...instrument,
  category: inferCategory(instrument),
  providerSymbol: inferProviderSymbol(instrument),
  tradingViewSymbol: instrument.tradingViewSymbol
    || TRADING_VIEW_SYMBOL_OVERRIDES[instrument.symbol]
    || instrument.symbol,
  tradable: instrument.tradable ?? instrument.active
}));

const CFD_BY_SYMBOL = new Map(CFD_INSTRUMENTS.map(instrument => [instrument.symbol.toUpperCase(), instrument]));
const CFD_BY_PROVIDER_SYMBOL = new Map(
  CFD_INSTRUMENTS.map(instrument => [instrument.providerSymbol!.toUpperCase(), instrument])
);

export const getCfdInstrument = (symbol: string): CfdInstrumentConfig | undefined => (
  CFD_BY_SYMBOL.get(symbol.toUpperCase()) || CFD_BY_PROVIDER_SYMBOL.get(symbol.toUpperCase())
);

export const resolveCfdAppSymbol = (providerSymbol: string): string | undefined => (
  CFD_BY_PROVIDER_SYMBOL.get(providerSymbol.toUpperCase())?.symbol
);

export const getCfdProviderSymbols = (): string[] => (
  Array.from(new Set(CFD_INSTRUMENTS.map(instrument => instrument.providerSymbol!)))
);
