import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface ManifoldMarket {
  id: string;
  slug: string;
  question: string;
  outcomeType: string;
  probability: number;
  isResolved: boolean;
  closeTime: string;
  volume: number;
  answers?: string[]; // For multiple-choice markets
}

// Function to categorize events based on their content
function categorizeEvent(question: string): string {
  const lowerQuestion = question.toLowerCase();
  
  // Politics keywords
  if (lowerQuestion.includes('election') || 
      lowerQuestion.includes('president') || 
      lowerQuestion.includes('biden') || 
      lowerQuestion.includes('trump') || 
      lowerQuestion.includes('congress') || 
      lowerQuestion.includes('senate') || 
      lowerQuestion.includes('government') || 
      lowerQuestion.includes('policy') || 
      lowerQuestion.includes('vote') || 
      lowerQuestion.includes('political') ||
      lowerQuestion.includes('republican') ||
      lowerQuestion.includes('democrat') ||
      lowerQuestion.includes('supreme court')) {
    return 'politics';
  }
  
  // Sports keywords
  if (lowerQuestion.includes('nfl') || 
      lowerQuestion.includes('nba') || 
      lowerQuestion.includes('mlb') || 
      lowerQuestion.includes('nhl') || 
      lowerQuestion.includes('soccer') || 
      lowerQuestion.includes('football') || 
      lowerQuestion.includes('basketball') || 
      lowerQuestion.includes('baseball') || 
      lowerQuestion.includes('hockey') || 
      lowerQuestion.includes('olympics') || 
      lowerQuestion.includes('world cup') ||
      lowerQuestion.includes('championship') ||
      lowerQuestion.includes('super bowl') ||
      lowerQuestion.includes('playoffs')) {
    return 'sports';
  }
  
  // Crypto keywords
  if (lowerQuestion.includes('bitcoin') || 
      lowerQuestion.includes('ethereum') || 
      lowerQuestion.includes('crypto') || 
      lowerQuestion.includes('btc') || 
      lowerQuestion.includes('eth') || 
      lowerQuestion.includes('blockchain') || 
      lowerQuestion.includes('defi') || 
      lowerQuestion.includes('nft') || 
      lowerQuestion.includes('dogecoin') ||
      lowerQuestion.includes('solana') ||
      lowerQuestion.includes('cardano') ||
      lowerQuestion.includes('binance')) {
    return 'crypto';
  }
  
  // Economy keywords
  if (lowerQuestion.includes('recession') || 
      lowerQuestion.includes('inflation') || 
      lowerQuestion.includes('federal reserve') || 
      lowerQuestion.includes('fed') || 
      lowerQuestion.includes('interest rate') || 
      lowerQuestion.includes('gdp') || 
      lowerQuestion.includes('unemployment') || 
      lowerQuestion.includes('stock market') || 
      lowerQuestion.includes('dow jones') || 
      lowerQuestion.includes('s&p 500') ||
      lowerQuestion.includes('nasdaq') ||
      lowerQuestion.includes('economy') ||
      lowerQuestion.includes('economic')) {
    return 'economy';
  }
  
  // Tech keywords
  if (lowerQuestion.includes('apple') || 
      lowerQuestion.includes('google') || 
      lowerQuestion.includes('microsoft') || 
      lowerQuestion.includes('tesla') || 
      lowerQuestion.includes('amazon') || 
      lowerQuestion.includes('meta') || 
      lowerQuestion.includes('ai') || 
      lowerQuestion.includes('artificial intelligence') || 
      lowerQuestion.includes('chatgpt') || 
      lowerQuestion.includes('openai') ||
      lowerQuestion.includes('nvidia') ||
      lowerQuestion.includes('technology') ||
      lowerQuestion.includes('software') ||
      lowerQuestion.includes('iphone') ||
      lowerQuestion.includes('spacex')) {
    return 'tech';
  }
  
  // Default to general
  return 'general';
}

// Helper function to safely convert date to ISO string
function safeToISOString(dateValue: any): string | null {
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting Manifold Markets data sync...");
    
    // Fetch markets from Manifold API
    console.log("Fetching markets from Manifold API...");
    
    const manifoldApiUrl = "https://api.manifold.markets/v0/markets?limit=500";
    
    const response = await fetch(manifoldApiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Supabase-Edge-Function/1.0'
      },
      // Add a timeout to avoid hanging
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      throw new Error(`Manifold API error: ${response.status} - ${await response.text()}`);
    }
    
    const manifoldMarkets: ManifoldMarket[] = await response.json();
    
    if (!Array.isArray(manifoldMarkets)) {
      throw new Error("Invalid response format from Manifold API");
    }
    
    // Filter for only unresolved markets (both binary and multiple choice)
    const filteredMarkets = manifoldMarkets.filter(market => 
      market.isResolved === false && 
      (market.outcomeType === 'BINARY' || market.outcomeType === 'MULTIPLE_CHOICE')
    );
    
    console.log(`Processing ${filteredMarkets.length} markets from Manifold`);

    // Process each market
    let processedCount = 0;
    let errorCount = 0;
    
    for (const market of filteredMarkets) {
      try {
        // Convert closeTime to proper ISO string
        const endDate = safeToISOString(market.closeTime);
        
        if (!endDate) {
          console.warn(`Invalid closeTime for market ${market.id}, skipping`);
          continue;
        }

        // Automatically categorize the event based on its question
        const category = categorizeEvent(market.question);

        // Determine status based on end date
        const now = new Date();
        const eventEndDate = new Date(endDate);
        const status = eventEndDate <= now ? 'closed' : 'open';

        // Use upsert to handle both insert and update cases
        const { data: upsertedEvents, error: upsertError } = await supabase
          .from('events')
          .upsert({
            user_id: null, // Explicitly set to null for external events
            question: market.question,
            description: `Prediction market from Manifold Markets`,
            category: category,
            status: status,
            polymarket_id: market.id,
            volume: market.volume || 0,
            end_date: endDate,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'polymarket_id', // Handle conflicts on polymarket_id
            ignoreDuplicates: false // Update existing records
          })
          .select('id');

        if (upsertError) {
          console.error(`Error upserting event ${market.id}:`, upsertError);
          errorCount++;
          continue;
        }

        // Check if upsert returned data
        if (!upsertedEvents || upsertedEvents.length === 0) {
          console.error(`No event returned after upsert for ${market.id}`);
          errorCount++;
          continue;
        }

        const eventId = upsertedEvents[0].id;
        console.log(`✅ Processed event (${category}): ${market.question}`);

        // Handle outcomes based on market type
        if (market.outcomeType === 'BINARY') {
          // Check if outcomes already exist
          const { data: existingOutcomes } = await supabase
            .from('event_outcomes')
            .select('id, outcome_name, polymarket_id')
            .eq('event_id', eventId);

          const yesOutcome = existingOutcomes?.find(o => o.outcome_name === 'Yes');
          const noOutcome = existingOutcomes?.find(o => o.outcome_name === 'No');

          // Create or update Yes outcome
          if (yesOutcome) {
            await supabase
              .from('event_outcomes')
              .update({
                current_price: market.probability,
                updated_at: new Date().toISOString()
              })
              .eq('id', yesOutcome.id);
          } else {
            await supabase
              .from('event_outcomes')
              .insert({
                event_id: eventId,
                outcome_name: 'Yes',
                current_price: market.probability,
                polymarket_id: `${market.id}_yes`
              });
          }

          // Create or update No outcome
          if (noOutcome) {
            await supabase
              .from('event_outcomes')
              .update({
                current_price: 1 - market.probability,
                updated_at: new Date().toISOString()
              })
              .eq('id', noOutcome.id);
          } else {
            await supabase
              .from('event_outcomes')
              .insert({
                event_id: eventId,
                outcome_name: 'No',
                current_price: 1 - market.probability,
                polymarket_id: `${market.id}_no`
              });
          }
        } 
        // Handle multiple-choice markets
        else if (market.outcomeType === 'MULTIPLE_CHOICE' && market.answers && market.answers.length > 0) {
          // Check if outcomes already exist
          const { data: existingOutcomes } = await supabase
            .from('event_outcomes')
            .select('id, outcome_name, polymarket_id')
            .eq('event_id', eventId);
          
          // Process each answer in the multiple-choice market
          for (let i = 0; i < market.answers.length; i++) {
            const answer = market.answers[i];
            const existingOutcome = existingOutcomes?.find(o => o.outcome_name === answer);
            
            // Calculate a probability for each answer (evenly distributed if not available)
            // For multiple-choice markets, we'll use an even distribution as a fallback
            const probability = 1 / market.answers.length;
            
            if (existingOutcome) {
              // Update existing outcome
              await supabase
                .from('event_outcomes')
                .update({
                  current_price: probability,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingOutcome.id);
            } else {
              // Create new outcome
              await supabase
                .from('event_outcomes')
                .insert({
                  event_id: eventId,
                  outcome_name: answer,
                  current_price: probability,
                  polymarket_id: `${market.id}_${i}`
                });
            }
          }
          
          console.log(`✅ Processed multiple-choice market: ${market.question} with ${market.answers.length} options`);
        }

        processedCount++;
      } catch (marketError) {
        console.error(`Error processing market ${market.id}:`, marketError);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Manifold Markets sync completed. Processed ${processedCount} markets successfully, ${errorCount} failed.`,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in sync-manifold-markets function:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});