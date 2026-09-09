import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface EligibleDeposit {
  id: string;
  amount: number;
  created_at: string;
}

interface WheelSpinResult {
  eligibleDeposit: EligibleDeposit | null;
  loading: boolean;
  error: string | null;
  spinWheel: (percentage: number) => Promise<void>;
  refreshEligibility: () => Promise<void>;
}

export const useWheelSpin = (userId: string | undefined): WheelSpinResult => {
  const [eligibleDeposit, setEligibleDeposit] = useState<EligibleDeposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEligibleDeposit = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select('id, amount, created_at')
        .eq('user_id', userId)
        .eq('type', 'deposit')
        .eq('status', 'completed')
        .eq('wheel_spun', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setEligibleDeposit(data);
    } catch (err) {
      console.error('Error fetching eligible deposit:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch deposit');
    } finally {
      setLoading(false);
    }
  };

  const spinWheel = async (percentage: number) => {
    if (!eligibleDeposit || !userId) {
      throw new Error('No eligible deposit found');
    }

    try {
      const winningAmount = Number((eligibleDeposit.amount * percentage) / 100);

      console.log('Processing wheel spin:', { userId, percentage, winningAmount, depositId: eligibleDeposit.id });

      const { data: updateData, error: updateError } = await supabase
        .from('transactions')
        .update({
          wheel_spun: true,
          wheel_winning_percentage: percentage,
          wheel_winning_amount: winningAmount,
        })
        .eq('id', eligibleDeposit.id)
        .select();

      if (updateError) {
        console.error('Error updating transaction:', updateError);
        throw new Error(`Failed to update transaction: ${updateError.message}`);
      }

      console.log('Transaction updated:', updateData);

      if (percentage > 0) {
        const { data: balanceData, error: balanceError } = await supabase.rpc('update_user_balance', {
          p_user_id: userId,
          p_amount: winningAmount,
          p_operation: 'add',
        });

        if (balanceError) {
          console.error('Error updating balance:', balanceError);
          throw new Error(`Failed to update balance: ${balanceError.message}`);
        }

        console.log('Balance updated:', balanceData);

        const { data: txData, error: txError } = await supabase.from('transactions').insert({
          user_id: userId,
          type: 'wheel_bonus',
          amount: winningAmount,
          description: `Wheel spin bonus: ${percentage}% of deposit $${eligibleDeposit.amount}`,
          status: 'completed',
        }).select();

        if (txError) {
          console.error('Error creating bonus transaction:', txError);
          throw new Error(`Failed to create bonus transaction: ${txError.message}`);
        }

        console.log('Bonus transaction created:', txData);
      } else {
        console.log('No win - skipping balance credit');
      }

      await fetchEligibleDeposit();
    } catch (err) {
      console.error('Error processing wheel spin:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchEligibleDeposit();
  }, [userId]);

  return {
    eligibleDeposit,
    loading,
    error,
    spinWheel,
    refreshEligibility: fetchEligibleDeposit,
  };
};
