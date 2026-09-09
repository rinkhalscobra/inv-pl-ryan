import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the request body to get the target URL, method, headers, and body
    const { url, method, headers, body } = await req.json()

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'Missing URL in request body' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    console.log(`🔄 Proxying ${method || 'GET'} request to: ${url}`)

    // Prepare request options
    const requestOptions: RequestInit = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }

    // Add body for POST requests
    if (method === 'POST' && body) {
      requestOptions.body = JSON.stringify(body)
    }

    // Make the request to the external API
    const response = await fetch(url, requestOptions)

    // Get the response data
    let data;
    try {
      data = await response.json()
    } catch (parseError) {
      const errorText = await response.text();
      console.error(`Failed to parse response as JSON: ${parseError}, response: ${errorText}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to parse response as JSON: ${parseError}`,
          details: 'External API returned non-JSON response'
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          status: response.status,
        }
      )
    }

    if (!response.ok) {
      console.error(`External API error: ${response.status} - ${JSON.stringify(data)}`);
      return new Response(
        JSON.stringify({ 
          error: `External API responded with status: ${response.status}`,
          details: data || 'External API error',
          status: response.status
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          status: response.status,
        }
      )
    }

    console.log(`✅ Successfully proxied request to ${url}`)

    // Return the external API's response to the client
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      status: response.status,
    })
  } catch (error) {
    console.error('❌ Proxy function error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to proxy request to external API'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 500,
      }
    )
  }
})