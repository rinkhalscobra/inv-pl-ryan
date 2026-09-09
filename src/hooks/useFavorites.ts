import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

interface UserFavorite {
  id: string;
  user_id: string;
  symbol: string;
  created_at: string;
}

export const useFavorites = () => {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch favorites from database
  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('user_favorites')
        .select('symbol')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      const favoriteSymbols = data?.map(fav => fav.symbol) || [];
      setFavorites(favoriteSymbols);
    } catch (err: any) {
      console.error('Error fetching favorites:', err);
      setError(err.message || 'Failed to fetch favorites');
      
      // Fallback to localStorage if database fails
      try {
        const storedFavorites = localStorage.getItem('favoritePairs');
        setFavorites(storedFavorites ? JSON.parse(storedFavorites) : []);
      } catch (localStorageError) {
        console.error('Failed to parse favorites from localStorage:', localStorageError);
        setFavorites([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load favorites when user changes
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Add favorite to database
  const addFavorite = useCallback(async (symbol: string) => {
    if (!user) {
      console.warn('Cannot add favorite: user not authenticated');
      return;
    }

    // Optimistically update local state
    setFavorites(prev => [...new Set([...prev, symbol])]);

    try {
      const { error } = await supabase
        .from('user_favorites')
        .insert([{
          user_id: user.id,
          symbol: symbol
        }]);

      if (error) {
        // Set empty array if database fails
        setFavorites([]);
        throw error;
      }

      console.log(`Added favorite: ${symbol}`);
    } catch (err: any) {
      console.error('Error adding favorite:', err);
      setError(err.message || 'Failed to add favorite');
      
      // Revert optimistic update on error
      setFavorites(prev => prev.filter(fav => fav !== symbol));
    }
  }, [user, favorites]);

  // Remove favorite from database
  const removeFavorite = useCallback(async (symbol: string) => {
    if (!user) {
      console.warn('Cannot remove favorite: user not authenticated');
      return;
    }

    // Optimistically update local state
    setFavorites(prev => prev.filter(fav => fav !== symbol));

    try {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('symbol', symbol);

      if (error) {
        throw error;
      }

      console.log(`Removed favorite: ${symbol}`);
    } catch (err: any) {
      console.error('Error removing favorite:', err);
      setError(err.message || 'Failed to remove favorite');
      
      // Revert optimistic update on error
      setFavorites(prev => [...new Set([...prev, symbol])]);
    }
  }, [user, favorites]);

  // Check if symbol is favorite
  const isFavorite = useCallback((symbol: string) => {
    return favorites.includes(symbol);
  }, [favorites]);

  // Toggle favorite status
  const toggleFavorite = useCallback(async (symbol: string) => {
    if (isFavorite(symbol)) {
      await removeFavorite(symbol);
    } else {
      await addFavorite(symbol);
    }
  }, [isFavorite, addFavorite, removeFavorite]);

  return {
    favorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    fetchFavorites
  };
};