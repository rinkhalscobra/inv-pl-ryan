import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import BrandLogo from '../components/BrandLogo';

const ForgotPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { resetPasswordForEmail } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await resetPasswordForEmail(email);
      if (error) throw error;
      setResetEmailSent(true);
    } catch (error: any) {
      setError(error.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center overflow-x-hidden px-4 py-8 relative">
      <div className="absolute inset-0 z-0 app-auth-bg" />
      
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
            {t('auth.wellSendYouLink')}
          </p>
        </div>

        {/* Forgot Password Form */}
        <div className="app-auth-card rounded-2xl p-6 sm:p-8" style={{ boxSizing: 'border-box' }}>
          {error && (
            <div className="bg-red-600/30 border-2 border-red-600 rounded-xl p-4 flex items-center gap-3 mb-6 shadow-lg shadow-red-500/20">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          {!resetEmailSent ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('auth.email')}</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.enterYourEmail')}
                    className="w-full app-input pl-10 pr-4 py-3 rounded-xl transition-all"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full app-action-primary text-white py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  t('auth.resetPassword')
                )}
              </button>

              <Link
                to="/signin"
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors py-2"
              >
                <ArrowLeft size={16} />
                {t('auth.backToSignIn')}
              </Link>
            </form>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-3">{t('auth.checkYourEmail')}</h3>
              <p className="text-slate-300 mb-6">
                {t('auth.weveSentPasswordReset')} <span className="text-white font-medium">{email}</span>
              </p>
              <Link
                to="/signin"
                className="app-action-primary text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 inline-block"
              >
                {t('auth.returnToSignIn')}
              </Link>
              <p className="text-sm text-slate-400 mt-4">
                {t('auth.didntReceiveEmail')}{' '}
                <button
                  type="button"
                  onClick={() => setResetEmailSent(false)}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t('auth.tryAgain')}
                </button>
              </p>
            </div>
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

export default ForgotPasswordPage;
