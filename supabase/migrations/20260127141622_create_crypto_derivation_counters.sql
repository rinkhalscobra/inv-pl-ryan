/*
  # Create Crypto Derivation Counters System

  1. New Tables
    - `crypto_derivation_counters`
      - `chain` (text, primary key) - The blockchain identifier (e.g., 'btc', 'eth')
      - `next_index` (integer) - The next derivation index to allocate

  2. New Functions
    - `allocate_derivation_index(p_chain text)` - Atomically allocates and returns the next derivation index for a given chain

  3. Initial Data
    - Seeds BTC counter starting at index 0

  4. Security
    - RLS enabled on table
    - Function is accessible for authenticated service role calls
*/

-- Table that holds the next derivation index per chain
CREATE TABLE IF NOT EXISTS public.crypto_derivation_counters (
  chain text PRIMARY KEY,
  next_index integer NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.crypto_derivation_counters ENABLE ROW LEVEL SECURITY;

-- Seed BTC counter
INSERT INTO public.crypto_derivation_counters(chain, next_index)
VALUES ('btc', 0)
ON CONFLICT (chain) DO NOTHING;

-- RPC to allocate the next index atomically
CREATE OR REPLACE FUNCTION public.allocate_derivation_index(p_chain text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_idx integer;
BEGIN
  UPDATE public.crypto_derivation_counters
  SET next_index = next_index + 1
  WHERE chain = p_chain
  RETURNING next_index - 1 INTO v_idx;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'Unknown chain %', p_chain;
  END IF;

  RETURN v_idx;
END;
$$;