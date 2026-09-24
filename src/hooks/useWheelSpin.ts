import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface WheelEligibility {
  id: string;
  source_type: 'deposit' | 'crm_grant';
  amount: number;
  currency: string;
  created_at: string;
}

export interface WheelSpinOutcome {
  percentage: number;
  winning_amount: number;
  currency: string;
}

interface WheelSpinResult {
  eligibleDeposit: WheelEligibility | null;
  loading: boolean;
  error: string | null;
  spinWheel: () => Promise<WheelSpinOutcome>;
  refreshEligibility: () => Promise<void>;
}

export const useWheelSpin = (userId: string | undefined): WheelSpinResult => {
  const [eligibleDeposit, setEligibleDeposit] = useState<WheelEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEligibleDeposit = useCallback(async () => {
    if (!userId) {
      setEligibleDeposit(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase.rpc('get_wheel_spin_eligibility');
      if (fetchError) throw fetchError;
      setEligibleDeposit((data as WheelEligibility | null) || null);
    } catch (err) {
      console.error('Error fetching wheel eligibility:', err);
      setError(err instanceof Error ? err.message : 'Failed to check wheel eligibility');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const spinWheel = async (): Promise<WheelSpinOutcome> => {
    if (!eligibleDeposit || !userId) throw new Error('No eligible wheel spin found');

    const { data, error: spinError } = await supabase.rpc('claim_wheel_spin', {
      p_source_type: eligibleDeposit.source_type,
      p_source_id: eligibleDeposit.id,
    });
    if (spinError) throw new Error(spinError.message);

    const outcome = data as WheelSpinOutcome | null;
    if (!outcome || !Number.isFinite(Number(outcome.percentage))) {
      throw new Error('The wheel result could not be confirmed');
    }

    await fetchEligibleDeposit();
    return {
      percentage: Number(outcome.percentage),
      winning_amount: Number(outcome.winning_amount || 0),
      currency: String(outcome.currency || eligibleDeposit.currency),
    };
  };

  useEffect(() => {
    void fetchEligibleDeposit();
  }, [fetchEligibleDeposit]);

  return {
    eligibleDeposit,
    loading,
    error,
    spinWheel,
    refreshEligibility: fetchEligibleDeposit,
  };
};
