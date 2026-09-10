import React, { useState } from 'react';
import { X, Mail, Lock, User, AlertCircle, ArrowLeft, Gift } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import LanguageSwitcher from './LanguageSwitcher';
import BrandLogo from './BrandLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthView = 'signIn' | 'signUp' | 'forgotPassword';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [authView, setAuthView] = useState<AuthView>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { signIn, signUp, resetPasswordForEmail } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (authView === 'signIn') {
        const { data, error } = await signIn(email, password);

        if (error) {
          throw error;
        }

        sessionStorage.removeItem('marketLoadingShown');
        onClose();
      } else if (authView === 'signUp') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }

        const { data, error } = await signUp(email, password, referralCode);

        if (error) throw error;

        sessionStorage.removeItem('marketLoadingShown');
        onClose();
      } else if (authView === 'forgotPassword') {
        const { error } = await resetPasswordForEmail(email);
        if (error) throw error;
        setResetEmailSent(true);
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setReferralCode('');
    setError('');
    setResetEmailSent(false);
    setAuthView('signIn');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="app-auth-card rounded-2xl max-w-md w-full p-8 shadow-2xl border-2 border-blue-500/50 relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
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
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8 relative z-10 pb-4 border-b border-slate-600/50">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-auto w-28 shrink-0" />
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {authView === 'signIn' ? 'Sign In' :
               authView === 'signUp' ? 'Create Account' :
               'Reset Password'}
            </h2>
            <LanguageSwitcher />
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-600/30 border-2 border-red-600 rounded-xl p-4 flex items-center gap-3 mb-6 shadow-lg shadow-red-500/20">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {/* Sign In Form */}
        {authView === 'signIn' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full app-input pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/80 focus:border-blue-500/80 transition-all border border-slate-600/80 shadow-inner shadow-black/30"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-slate-400">Password</label>
                <button
                  type="button"
                  onClick={() => setAuthView('forgotPassword')}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full app-input pl-10 pr-4 py-3 rounded-xl border border-slate-600/80 focus:outline-none focus:ring-2 focus:ring-blue-500/80 focus:border-blue-500/80 transition-all shadow-inner shadow-black/30"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full app-action-primary disabled:from-slate-700 disabled:to-slate-800 text-white py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-blue-500/50 mt-2 border border-blue-400/30"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <User size={18} />
                  Sign In
                </>
              )}
            </button>

            <div className="text-center mt-6">
              <p className="text-slate-300 text-sm">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthView('signUp');
                    setError('');
                  }}
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium underline"
                >
                  Create Account
                </button>
              </p>
            </div>
          </form>
        )}

        {/* Sign Up Form */}
        {authView === 'signUp' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full app-input pl-10 pr-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  className="w-full app-input pl-10 pr-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full app-input pl-10 pr-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Referral Code <span className="text-slate-500">(Optional)</span>
              </label>
              <div className="relative">
                <Gift size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="Enter referral code"
                  className="w-full app-input pl-10 pr-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-1">
                Get trading bonuses with a valid referral code
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full app-action-primary disabled:from-slate-700 disabled:to-slate-800 text-white py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-blue-500/30 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <User size={18} />
                  Create Account
                </>
              )}
            </button>

            <div className="text-center mt-6">
              <p className="text-slate-300 text-sm">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthView('signIn');
                    setError('');
                  }}
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium underline"
                >
                  Sign In
                </button>
              </p>
            </div>
          </form>
        )}

        {/* Forgot Password Form */}
        {authView === 'forgotPassword' && !resetEmailSent && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="text-slate-300 mb-6">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <label className="block text-sm text-slate-400 mb-2">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full app-input pl-10 pr-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full app-action-primary disabled:from-slate-700 disabled:to-slate-800 text-white py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-blue-500/30 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Send Reset Link'
              )}
            </button>

            <button
              type="button"
              onClick={() => setAuthView('signIn')}
              className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors py-2"
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </button>
          </form>
        )}

        {/* Reset Email Sent Confirmation */}
        {authView === 'forgotPassword' && resetEmailSent && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail size={32} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Check Your Email</h3>
            <p className="text-slate-300 mb-6">
              We've sent a password reset link to <span className="text-white font-medium">{email}</span>
            </p>
            <button
              type="button"
              onClick={() => setAuthView('signIn')}
              className="app-action-primary text-white px-6 py-4 rounded-xl font-semibold transition-all duration-300 shadow-xl shadow-blue-500/30"
            >
              Return to Sign In
            </button>
            <p className="text-sm text-slate-400 mt-4">
              Didn't receive the email?{' '}
              <button
                type="button"
                onClick={() => setResetEmailSent(false)}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Try again
              </button>
            </p>
          </div>
        )}

        {/* Security Notice */}
        <div className="mt-8 pt-6 border-t border-slate-700/50 relative z-10 bg-slate-800/80 p-3 rounded-xl">
          <div className="flex items-center gap-2 text-slate-300 text-xs justify-center">
            <Lock size={14} className="text-slate-500" />
            <span>Secure, encrypted connection to dex.vestio.ai</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;


