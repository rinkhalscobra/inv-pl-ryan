import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import LanguageSwitcher from '../components/LanguageSwitcher';
import BrandLogo from '../components/BrandLogo';

const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const { updatePassword, user } = useAuth();
  
  // State to hold parsed tokens
  const [parsedAccessToken, setParsedAccessToken] = useState<string | null>(null);
  const [parsedRefreshToken, setParsedRefreshToken] = useState<string | null>(null);
  const [parsedType, setParsedType] = useState<string | null>(null);

  const [isSessionSet, setIsSessionSet] = useState(false);

  // Check if we have the required tokens from the URL
  useEffect(() => {
    // Parse tokens from URL hash if available (Supabase often puts them here for recovery)
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.substring(1)); // Remove '#'

    const hashAccessToken = hashParams.get('access_token');
    const hashRefreshToken = hashParams.get('refresh_token');
    const hashType = hashParams.get('type');

    const finalAccessToken = hashAccessToken;
    const finalRefreshToken = hashRefreshToken;
    const finalType = hashType;

    if (finalType !== 'recovery' || !finalAccessToken || !finalRefreshToken) {
      setError('Invalid or expired reset link. Please request a new password reset.');
      return;
    }
    
    const setSessionAndUser = async () => {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken,
        });

        if (error) {
          throw error;
        }

        console.log('Session set successfully for password reset:', data);
        setIsSessionSet(true); // Indicate that session has been attempted to be set
      } catch (err: any) {
        console.error('Error setting session:', err);
        setError('Failed to verify reset link. Please request a new password reset.');
      }
    };

    // Store parsed tokens in state
    setParsedAccessToken(finalAccessToken);
    setParsedRefreshToken(finalRefreshToken);
    setParsedType(finalType);

    setSessionAndUser();
  }, []); // Empty dependency array to run only once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate passwords
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Update the password
      const { error } = await updatePassword(password);
      
      if (error) {
        throw error;
      }

      setSuccess(true);
      
      // Redirect to sign in after 3 seconds
      setTimeout(() => {
      navigate('/signin');
      }, 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center overflow-x-hidden px-4 py-8 relative">
      {/* Background with image overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 app-auth-bg"></div>
        {/* Pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{ 
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`, 
          backgroundSize: '40px 40px' 
        }}></div>
        {/* Additional pattern */}
        <div className="absolute inset-0 opacity-5" style={{ 
          backgroundImage: `linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)`, 
          backgroundSize: '80px 80px' 
        }}></div>
      </div>
      
      {/* Animated overlay effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
        <div className="absolute -top-40 -right-40 w-[30rem] h-[30rem] bg-blue-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-[30rem] h-[30rem] bg-purple-500/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="max-w-md z-20 relative" style={{ width: 'calc(100vw - 2rem)' }}>
        {/* Logo and Title */}
        <div className="text-center mb-10">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <BrandLogo className="mx-auto mb-5 h-auto w-64 sm:w-72" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            {t('auth.resetYourPassword')}
          </h1>
          <p className="text-slate-300 mt-2 text-lg">
            {t('auth.enterYourNewPasswordBelow')}
          </p>
        </div>

        {/* Reset Password Form */}
        <div className="app-auth-card rounded-2xl p-6 sm:p-8" style={{ boxSizing: 'border-box' }}>
          {error && (
            <div className="bg-red-600/30 border-2 border-red-600 rounded-xl p-4 flex items-center gap-3 mb-6 shadow-lg shadow-red-500/20">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-3">{t('auth.passwordUpdated')}</h3>
              <p className="text-slate-300 mb-6">
                {t('auth.passwordUpdatedSuccessfully')}
              </p>
              <Link
                to="/signin"
                className="app-action-primary text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 inline-block"
              >
                {t('auth.goToSignIn')}
              </Link>
            </div>
          ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('auth.newPassword')}</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.enterYourNewPassword')}
                    className="w-full app-input pl-10 pr-10 py-3 rounded-xl transition-all"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1 ml-1">
                  {t('auth.mustBeAtLeast6Characters')}
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('auth.confirmNewPassword')}</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('auth.confirmYourNewPassword')}
                    className="w-full app-input pl-10 pr-10 py-3 rounded-xl transition-all"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="w-full app-action-primary text-white py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  t('profile.updatePassword')
                )}
              </button>
            </form>

            {error && (
              <div className="text-center mt-6">
                <Link
                  to="/signin"
                 className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-medium transition-colors inline-block"
                >
                  {t('auth.backToSignIn')}
                </Link>
              </div>
            )}
            </>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-8 text-center app-surface-muted py-3 px-4 rounded-xl">
          <div className="flex items-center justify-center gap-2 text-slate-300 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>{t('auth.secureConnection')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
