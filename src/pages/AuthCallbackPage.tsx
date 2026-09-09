import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Loader2, AlertCircle } from 'lucide-react';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('AuthCallback: Starting auth callback process...');
        
        // Get access_token from URL query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');
        
        console.log('AuthCallback: Access token found:', !!accessToken);
        console.log('AuthCallback: Refresh token found:', !!refreshToken);

        if (!accessToken) {
          throw new Error('No access token found in URL');
        }

        // Clear any existing session first
        console.log('AuthCallback: Clearing existing session...');
        await supabase.auth.signOut();
        
        // Add a small delay to ensure session is fully cleared
        await new Promise(resolve => setTimeout(resolve, 100));

        // Set the new session with the provided tokens
        console.log('AuthCallback: Setting new session...');
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || undefined // Use undefined if no refresh token
        });

        if (sessionError) {
          console.error('AuthCallback: Error setting session:', sessionError);
          throw sessionError;
        }

        if (!data.session) {
          throw new Error('Failed to create session');
        }

        console.log('AuthCallback: Session set successfully for user:', data.session.user.email);

        // Store impersonation flag in localStorage
        localStorage.setItem('is_impersonating', 'true');
        console.log('AuthCallback: Impersonation flag set in localStorage');

        // Clear the URL parameters and redirect to home
        console.log('AuthCallback: Redirecting to home...');
        navigate('/', { replace: true });

      } catch (err: any) {
        console.error('AuthCallback: Error during auth callback:', err);
        setError(err.message || 'Authentication failed');
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen app-page-bg flex items-center justify-center overflow-x-hidden px-4 py-8">
        <div className="app-auth-card rounded-2xl p-6 max-w-md border-red-500/30 sm:p-8" style={{ width: 'calc(100vw - 2rem)', boxSizing: 'border-box' }}>
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle size={24} className="text-red-400" />
            <h2 className="text-xl font-semibold text-white">Authentication Error</h2>
          </div>
          <p className="text-red-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/signin', { replace: true })}
            className="w-full app-action-primary text-white py-3 rounded-xl font-semibold transition-all duration-300"
          >
            Return to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-page-bg flex items-center justify-center overflow-x-hidden px-4 py-8">
      <div className="app-auth-card rounded-2xl p-6 max-w-md text-center sm:p-8" style={{ width: 'calc(100vw - 2rem)', boxSizing: 'border-box' }}>
        <div className="w-16 h-16 app-icon-tile rounded-full flex items-center justify-center mx-auto mb-6">
          <Loader2 size={32} className="text-white animate-spin" />
        </div>
        <h2 className="text-2xl font-semibold text-white mb-4">Authenticating...</h2>
        <p className="text-slate-300">Please wait while we log you in.</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;
