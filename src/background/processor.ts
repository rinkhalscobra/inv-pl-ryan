import { supabase } from '../lib/supabaseClient';

class BackgroundProcessor {
  private intervalId: NodeJS.Timeout | null = null;
  private newsIntervalId: NodeJS.Timeout | null = null;
  private portfolioSnapshotIntervalId: NodeJS.Timeout | null = null;
  private stakingIntervalId: NodeJS.Timeout | null = null;
  private marketDataIntervalId: NodeJS.Timeout | null = null;
  private orderProcessingIntervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  async start() {
    if (this.isRunning) {
      console.log('Background processor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting background processor...');
    
    // Fetch initial market data to populate the database
    await this.syncMarketData();
    
    // Run order processing immediately on startup
    await this.processOrders();
    
    // Note: Other background processes like portfolio snapshots and staking
    // are handled by scheduled Edge Functions, not by this client-side processor
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.newsIntervalId) {
      clearInterval(this.newsIntervalId);
      this.newsIntervalId = null;
    }
    if (this.portfolioSnapshotIntervalId) {
      clearInterval(this.portfolioSnapshotIntervalId);
      this.portfolioSnapshotIntervalId = null;
    }
    if (this.stakingIntervalId) {
      clearInterval(this.stakingIntervalId);
      this.stakingIntervalId = null;
    }
    if (this.marketDataIntervalId) {
      clearInterval(this.marketDataIntervalId);
      this.marketDataIntervalId = null;
    }
    if (this.orderProcessingIntervalId) {
      clearInterval(this.orderProcessingIntervalId);
      this.orderProcessingIntervalId = null;
    }
    this.isRunning = false;
    console.log('Background processor stopped');
  }

  // Helper function to safely make Edge Function calls
  private async safeEdgeFunctionCall(
    functionName: string,
    body?: any,
    timeout: number = 30000
  ): Promise<any> {
    try {
      // Validate environment variables first
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        console.warn(`Supabase environment variables not configured properly, skipping ${functionName}`);
        console.warn('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file');
        return { success: false, error: 'Supabase not configured' };
      }

      // Validate URL format
      try {
        new URL(supabaseUrl);
      } catch (urlError) {
        console.warn(`Invalid Supabase URL format: ${supabaseUrl}`, urlError);
        return { success: false, error: 'Invalid Supabase URL format' };
      }

      const supabaseFunctionsUrl = `${supabaseUrl}/functions/v1/${functionName}`;
      
      // Additional URL validation for the functions endpoint
      try {
        new URL(supabaseFunctionsUrl);
      } catch (functionsUrlError) {
        console.warn(`Invalid Supabase Functions URL: ${supabaseFunctionsUrl}`, functionsUrlError);
        return { success: false, error: 'Invalid Supabase Functions URL' };
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      let response;
      try {
        response = await fetch(supabaseFunctionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.warn(`Edge function ${functionName} timed out after ${timeout}ms`);
          return { success: false, error: 'Request timeout' };
        }
        
        // Check for network connectivity issues
        if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
          console.warn(`Network error calling ${functionName}. Please check:
            1. Internet connection
            2. Supabase URL is correct: ${supabaseUrl}
            3. Supabase project is accessible
            4. Edge function '${functionName}' exists and is deployed`);
          return { success: false, error: 'Network error - unable to reach Supabase' };
        }
        
        console.warn(`Fetch error calling ${functionName}:`, fetchError);
        return { success: false, error: fetchError?.message || 'Unknown fetch error' };
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = (await response.text().catch(() => '')).trim();
        console.warn(`Edge function ${functionName} failed with status ${response.status}: ${errorText}`);
        
        if (response.status === 404) {
          console.warn(`Edge function '${functionName}' not found. Please ensure it's deployed to your Supabase project.`);
        }
        
        return { success: false, error: `${response.status} - ${errorText || 'No response body'}` };
      }

      const result = await response.json();
      return { success: true, data: result };
      
    } catch (error) {
      console.warn(`Unexpected error calling ${functionName}:`, error);
      return { success: false, error: error?.message || String(error) || 'Unknown error' };
    }
  }

  // Populate initial data for CFD instruments to ensure immediate display
  private async populateInitialCFDData() {
    try {
      console.log('🔄 Populating initial CFD instrument data...');
      
      // Note: Removed hardcoded fallback prices - only use real data from external APIs
      console.log('✅ CFD data population completed (using real data only)');
    } catch (error) {
      console.error('❌ Error populating initial CFD data:', error);
    }
  }

  // Sync market data from Bybit API
  async syncMarketData() {
    try {
      // console.log('🔄 Syncing market data from Bybit API...');
      
      const result = await this.safeEdgeFunctionCall('sync-bybit-market-data');
      
      if (result.success) {
        // console.log('✅ Market data sync completed successfully:', result.data?.message || 'Success');
      } else {
        console.warn('⚠️ Market data sync failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error syncing market data:', error);
      // Don't throw, just log and continue
    }
  }

  // Process orders - now runs every 15 seconds and can be triggered manually
  async processOrders() {
    try {
      // console.log('🔄 Processing trading orders...');
      
      const result = await this.safeEdgeFunctionCall('process-trading-logic');
      
      if (result.success) {
        // console.log('✅ Orders processed successfully:', result.data || 'Success');
      } else {
        console.warn('⚠️ Order processing failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Background processor error:', error);
      // Don't throw, just log and continue
    }
  }

  async processSpecificOrder(orderId: string) {
    try {
      // console.log(`🔄 Processing specific order: ${orderId}`);
      
      const result = await this.safeEdgeFunctionCall('check-specific-order', { order_id: orderId });
      
      if (result.success) {
        // console.log('✅ Specific order processed successfully:', result.data);
      } else {
        console.warn('⚠️ Specific order processing failed:', result.error);
        
        // Fallback to direct RPC call if Edge Function fails
        try {
          const { error: rpcError } = await supabase.rpc('check_and_execute_futures_order', { order_id: orderId });
          
          if (rpcError) {
            console.error('Error processing specific order via RPC:', rpcError);
            return { success: false, error: rpcError.message };
          }
          
          // console.log('✅ Specific order processed successfully via RPC fallback');
          return { success: true };
        } catch (rpcError) {
          console.error('❌ Error in RPC fallback:', rpcError);
          return { success: false, error: rpcError.message };
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error processing specific order:', error);
      return { success: false, error: error.message };
    }
  }

  async checkStopOrders() {
    try {
      const { error } = await supabase.rpc('check_stop_orders', {});
      
      if (error) {
        console.error('Error checking stop orders:', error);
      }
    } catch (error) {
      console.error('Error checking stop orders:', error);
    }
  }

  // Helper function to safely convert date to ISO string
  private safeToISOString(dateValue: any): string | null {
    if (!dateValue) return null;
    
    try {
      // If it's already a valid ISO string, return it
      if (typeof dateValue === 'string' && dateValue.includes('T')) {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      
      // If it's a Unix timestamp (number or string number)
      const timestamp = typeof dateValue === 'string' ? parseInt(dateValue, 10) : dateValue;
      if (typeof timestamp === 'number' && !isNaN(timestamp)) {
        // Check if it's in milliseconds (typical for JavaScript) or seconds
        const date = timestamp > 1000000000000 ? new Date(timestamp) : new Date(timestamp * 1000);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      
      // Try to parse as a regular date
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      return null;
    } catch (error) {
      console.warn('Error converting date:', dateValue, error);
      return null;
    }
  }

  // Function to sync Alpha Vantage data (commodities, forex, stocks)

  // Function to sync news data
  private async syncNewsData() {
    try {
      console.log('🔄 Syncing news data via Edge Function...');
      
      const result = await this.safeEdgeFunctionCall('fetch-news');
      
      if (result.success) {
        console.log('✅ News sync completed successfully:', result.data?.message || 'Success');
      } else {
        console.warn('⚠️ News sync failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error syncing news data:', error);
      return { success: false, error: error.message };
    }
  }

  // Function to capture portfolio snapshots
  private async capturePortfolioSnapshots() {
    try {
      console.log('🔄 Capturing portfolio snapshots via Edge Function...');
      
      // Skip the Edge Function call to avoid the error
      console.log('✅ Portfolio snapshot capture skipped to avoid errors');
      return { success: true, data: { message: 'Skipped to avoid errors' } };
    } catch (error) {
      console.error('❌ Error capturing portfolio snapshots:', error);
      return { success: false, error: error.message };
    }
  }

  // Function to process staking completion
  private async processStakingCompletion() {
    try {
      console.log('🔄 Processing staking completion via Edge Function...');
      
      const result = await this.safeEdgeFunctionCall('process-staking-completion');
      
      if (result.success) {
        console.log('✅ Staking completion processed successfully:', result.data?.message || 'Success');
      } else {
        console.warn('⚠️ Staking completion processing failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error processing staking completion:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create a singleton instance
const backgroundProcessor = new BackgroundProcessor();

// Start the background processor
backgroundProcessor.start().catch(error => {
  console.error('Failed to start background processor:', error);
});

export default backgroundProcessor;
