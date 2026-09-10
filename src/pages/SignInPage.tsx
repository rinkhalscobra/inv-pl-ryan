import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../hooks/useAuth';

const SignInPage: React.FC = () => {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) throw signInError;
      sessionStorage.removeItem('marketLoadingShown');
      navigate('/', { replace: true });
    } catch (signInError: any) {
      setError(signInError.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-8">
      <div className="app-auth-bg absolute inset-0 z-0" />

      <div className="relative z-20 max-w-md" style={{ width: 'calc(100vw - 2rem)' }}>
        <div className="mb-10 text-center">
          <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
          <BrandLogo className="mx-auto mb-4 h-auto w-64 sm:w-72" />
          <h1 className="mb-2 bg-gradient-to-r from-blue-300 via-purple-300 to-violet-300 bg-clip-text text-4xl font-bold text-transparent">
            {t('auth.welcomeBack')}
          </h1>
          <p className="mt-2 text-lg text-slate-300">{t('auth.signInToAccess')}</p>
        </div>

        <div className="app-auth-card rounded-2xl p-6 sm:p-8" style={{ boxSizing: 'border-box' }}>
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border-2 border-red-600 bg-red-600/30 p-4 shadow-lg shadow-red-500/20">
              <AlertCircle size={20} className="shrink-0 text-red-400" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm text-slate-400">{t('auth.email')}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('auth.enterYourEmail')}
                  className="app-input w-full rounded-xl py-3 pl-10 pr-4 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm text-slate-400">{t('auth.password')}</label>
                <Link to="/forgot-password" className="text-xs text-blue-400 transition-colors hover:text-blue-300">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('auth.enterYourPassword')}
                  className="app-input w-full rounded-xl py-3 pl-10 pr-10 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="app-action-primary mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-4 font-semibold transition-all duration-300"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>{t('auth.signIn')}<ChevronRight size={18} /></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-300">
              {t('auth.dontHaveAccount')}{' '}
              <Link to="/auth/register" className="font-medium text-blue-400 underline transition-colors hover:text-blue-300">
                {t('auth.createAccount')}
              </Link>
            </p>
          </div>
        </div>

        <div className="app-surface-muted mt-8 rounded-xl px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{t('auth.secureConnection')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
