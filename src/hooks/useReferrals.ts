import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

export interface ReferralEarning {
  id: string;
  referred_user_id: string;
  referred_user_email?: string;
  position_id: string;
  commission_amount: number;
  position_pnl: number;
  position_symbol: string;
  position_side: string;
  created_at: string;
}

export interface ReferralStats {
  totalReferrals: number;
  totalEarnings: number;
  earningsToday: number;
  earningsThisWeek: number;
  earningsThisMonth: number;
  activeReferrals: number;
}

export interface ReferredUser {
  id: string;
  email: string;
  created_at: string;
  total_earned_from_user: number;
  last_earning_date: string | null;
}

export const useReferrals = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralEarnings, setReferralEarnings] = useState<ReferralEarning[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats>({
    totalReferrals: 0,
    totalEarnings: 0,
    earningsToday: 0,
    earningsThisWeek: 0,
    earningsThisMonth: 0,
    activeReferrals: 0,
  });
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([]);

  const fetchReferralCode = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('referral_code')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setReferralCode(data?.referral_code || null);
    } catch (err: any) {
      console.error('Error fetching referral code:', err);
    }
  }, [user]);

  const fetchReferralEarnings = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('referral_earnings')
        .select(`
          *,
          referred_user:users!referral_earnings_referred_user_id_fkey(email)
        `)
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const earnings: ReferralEarning[] = (data || []).map((item: any) => ({
        id: item.id,
        referred_user_id: item.referred_user_id,
        referred_user_email: item.referred_user?.email,
        position_id: item.position_id,
        commission_amount: parseFloat(item.commission_amount) || 0,
        position_pnl: parseFloat(item.position_pnl) || 0,
        position_symbol: item.position_symbol,
        position_side: item.position_side,
        created_at: item.created_at,
      }));

      setReferralEarnings(earnings);
    } catch (err: any) {
      console.error('Error fetching referral earnings:', err);
      setError(err.message || 'Failed to fetch referral earnings');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchReferralStats = useCallback(async () => {
    if (!user) return;

    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('referral_count, total_referral_earnings')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: todayEarnings, error: todayError } = await supabase
        .from('referral_earnings')
        .select('commission_amount')
        .eq('referrer_id', user.id)
        .gte('created_at', todayStart.toISOString());

      const { data: weekEarnings, error: weekError } = await supabase
        .from('referral_earnings')
        .select('commission_amount')
        .eq('referrer_id', user.id)
        .gte('created_at', weekStart.toISOString());

      const { data: monthEarnings, error: monthError } = await supabase
        .from('referral_earnings')
        .select('commission_amount')
        .eq('referrer_id', user.id)
        .gte('created_at', monthStart.toISOString());

      const { data: activeReferralsData, error: activeError } = await supabase
        .from('referral_earnings')
        .select('referred_user_id')
        .eq('referrer_id', user.id)
        .gte('created_at', monthStart.toISOString());

      const uniqueActiveReferrals = new Set(
        (activeReferralsData || []).map((item: any) => item.referred_user_id)
      ).size;

      setReferralStats({
        totalReferrals: userData?.referral_count || 0,
        totalEarnings: parseFloat(userData?.total_referral_earnings || '0'),
        earningsToday: (todayEarnings || []).reduce(
          (sum: number, item: any) => sum + parseFloat(item.commission_amount || '0'),
          0
        ),
        earningsThisWeek: (weekEarnings || []).reduce(
          (sum: number, item: any) => sum + parseFloat(item.commission_amount || '0'),
          0
        ),
        earningsThisMonth: (monthEarnings || []).reduce(
          (sum: number, item: any) => sum + parseFloat(item.commission_amount || '0'),
          0
        ),
        activeReferrals: uniqueActiveReferrals,
      });
    } catch (err: any) {
      console.error('Error fetching referral stats:', err);
    }
  }, [user]);

  const fetchReferredUsers = useCallback(async () => {
    if (!user) return;

    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email, created_at')
        .eq('referred_by', user.id)
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      const usersWithEarnings = await Promise.all(
        (usersData || []).map(async (userData: any) => {
          const { data: earningsData } = await supabase
            .from('referral_earnings')
            .select('commission_amount, created_at')
            .eq('referrer_id', user.id)
            .eq('referred_user_id', userData.id)
            .order('created_at', { ascending: false });

          const totalEarned = (earningsData || []).reduce(
            (sum, item) => sum + parseFloat(item.commission_amount || '0'),
            0
          );

          return {
            id: userData.id,
            email: userData.email,
            created_at: userData.created_at,
            total_earned_from_user: totalEarned,
            last_earning_date: earningsData && earningsData.length > 0 ? earningsData[0].created_at : null,
          };
        })
      );

      setReferredUsers(usersWithEarnings);
    } catch (err: any) {
      console.error('Error fetching referred users:', err);
    }
  }, [user]);

  const copyReferralLink = useCallback(() => {
    if (!referralCode) return;

    const referralLink = `${window.location.origin}/signup?ref=${referralCode}`;
    navigator.clipboard.writeText(referralLink);
  }, [referralCode]);

  const copyReferralCode = useCallback(() => {
    if (!referralCode) return;

    navigator.clipboard.writeText(referralCode);
  }, [referralCode]);

  useEffect(() => {
    if (user) {
      fetchReferralCode();
      fetchReferralEarnings();
      fetchReferralStats();
      fetchReferredUsers();
    }
  }, [user, fetchReferralCode, fetchReferralEarnings, fetchReferralStats, fetchReferredUsers]);

  return {
    loading,
    error,
    referralCode,
    referralEarnings,
    referralStats,
    referredUsers,
    fetchReferralEarnings,
    fetchReferralStats,
    fetchReferredUsers,
    copyReferralLink,
    copyReferralCode,
  };
};
