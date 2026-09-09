interface ManifoldMarket {
  id: string;
  slug: string;
  question: string;
  outcomeType: string;
  probability: number;
  isResolved: boolean;
  closeTime: string;
  volume: number;
  answers?: string[]; // Add support for multiple-choice markets
}

class ManifoldApiService {
  private apiUrl = 'https://api.manifold.markets/v0/markets';

  async fetchMarkets(): Promise<ManifoldMarket[]> {
    try {
      console.log('🔄 Fetching live data from Manifold Markets API via Edge Function...');

      // Construct the URL for your Supabase Edge Function
      const supabaseFunctionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-api`;

      // Updated to fetch 500 markets instead of 50
      const apiUrlWithParams = `${this.apiUrl}?limit=500`;

      const response = await fetch(supabaseFunctionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          url: apiUrlWithParams,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Manifold API error: ${response.status} - ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data: ManifoldMarket[] = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from Manifold Markets API');
      }

      // Filter for only unresolved markets (both binary and multiple choice)
      const filteredMarkets = data.filter(market => 
        market.isResolved === false && 
        (market.outcomeType === 'BINARY' || market.outcomeType === 'MULTIPLE_CHOICE')
      );

      console.log('✅ Successfully fetched Manifold Markets data:', filteredMarkets.length, 'markets');
      return filteredMarkets;
    } catch (error) {
      console.warn('⚠️ Failed to fetch from Manifold Markets API via Edge Function:', error);
      console.log('📝 No fallback data - returning empty array');
      return []; // Return empty array instead of fake data
    }
  }

  async syncWithDatabase(markets: ManifoldMarket[]) {
    console.log('Syncing markets with database:', markets.length);
  }
}

export const manifoldApi = new ManifoldApiService();
export default ManifoldApiService;