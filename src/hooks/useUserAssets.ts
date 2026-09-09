import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

export interface UserAsset {
  id: string;
  user_id: string;
  asset_symbol: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export const useUserAssets = () => {
  const { user } = useAuth();
  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all user assets
  const fetchAssets = useCallback(async () => {
    if (!user) {
      setAssets([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('user_assets')
        .select('*')
        .eq('user_id', user.id)
        .order('asset_symbol');

      if (fetchError) {
        throw fetchError;
      }

      // Convert string balances to numbers
      const formattedAssets = data?.map(asset => ({
        ...asset,
        balance: parseFloat(asset.balance)
      })) || [];

      setAssets(formattedAssets);
    } catch (err: any) {
      console.error('Error fetching user assets:', err);
      setError(err.message || 'Failed to fetch user assets');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Update asset balance
  const updateAssetBalance = useCallback(async (
    assetSymbol: string,
    newBalance: number
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      // Check if asset exists
      const { data: existingAsset } = await supabase
        .from('user_assets')
        .select('id')
        .eq('user_id', user.id)
        .eq('asset_symbol', assetSymbol)
        .maybeSingle();

      if (existingAsset) {
        // Update existing asset
        const { error: updateError } = await supabase
          .from('user_assets')
          .update({ balance: newBalance })
          .eq('id', existingAsset.id);

        if (updateError) throw updateError;
      } else {
        // Create new asset
        const { error: insertError } = await supabase
          .from('user_assets')
          .insert([{
            user_id: user.id,
            asset_symbol: assetSymbol,
            balance: newBalance
          }]);

        if (insertError) throw insertError;
      }

      // Update local state
      setAssets(prev => {
        const assetIndex = prev.findIndex(a => a.asset_symbol === assetSymbol);
        if (assetIndex >= 0) {
          // Update existing asset
          const newAssets = [...prev];
          newAssets[assetIndex] = {
            ...newAssets[assetIndex],
            balance: newBalance,
            updated_at: new Date().toISOString()
          };
          return newAssets;
        } else {
          // Add new asset
          return [...prev, {
            id: `temp-${Date.now()}`, // Will be replaced on next fetch
            user_id: user.id,
            asset_symbol: assetSymbol,
            balance: newBalance,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }];
        }
      });

      return true;
    } catch (err: any) {
      console.error('Error updating asset balance:', err);
      setError(err.message || 'Failed to update asset balance');
      return false;
    }
  }, [user]);

  // Get balance for a specific asset
  const getAssetBalance = useCallback((assetSymbol: string): number => {
    const asset = assets.find(a => a.asset_symbol === assetSymbol);
    return asset?.balance || 0;
  }, [assets]);

  // Initialize by fetching assets
  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  return {
    assets,
    loading,
    error,
    fetchAssets,
    updateAssetBalance,
    getAssetBalance
  };
};