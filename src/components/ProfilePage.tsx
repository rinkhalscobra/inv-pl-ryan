import React, { useState, useEffect } from 'react';
import { User as UserType } from '@supabase/supabase-js';
import {
  User,
  Shield,
  LogOut,
  Lock,
  Mail,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  Gift,
  Clock,
  ChevronRight,
  Save,
  MessageCircle,
  TrendingUp,
  TrendingDown,
  Award,
  Globe,
} from 'lucide-react';
import KycDocumentUpload from './KycDocumentUpload';
import SupportChat from './SupportChat';
import LanguageSwitcher from './LanguageSwitcher';
import PhoneInput from './PhoneInput';
import ReferralTab from './ReferralTab';
import GiveawaySection from './GiveawaySection';
import AccountBalancesCard from './AccountBalancesCard';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';
import { getUserCfdTier } from '../constants/tradingTiers';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface ProfilePageProps {
  user: UserType;
  usdtBalance?: number;
  btcBalance?: number;
  currentPrice?: number;
  onSignOut: () => void;
  onUpdatePassword: (password: string) => Promise<unknown>;
  totalPortfolioValue: number;
  totalPositionsPnl?: number;
  kycStatus: 'not_verified' | 'pending' | 'verified';
  updateKycStatus: (status: 'not_verified' | 'pending' | 'verified') => void;
}

interface TaxIdStatus {
  status: 'pending' | 'verified' | 'rejected';
  last_four: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_reason: string | null;
}

const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  usdtBalance,
  btcBalance,
  currentPrice,
  onSignOut,
  onUpdatePassword,
  totalPortfolioValue,
  totalPositionsPnl = 0,
  kycStatus: propKycStatus,
  updateKycStatus: propUpdateKycStatus,
}) => {
  const { t } = useTranslation();
  const { formatFiat, formatFiatWhole } = useFiatCurrency();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'referrals' | 'giveaway' | 'support'>('profile');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showKycUpload, setShowKycUpload] = useState(false);
  const [kycStatus, setKycStatus] = useState<'not_verified' | 'pending' | 'verified'>(propKycStatus || 'not_verified');
  const [taxIdStatus, setTaxIdStatus] = useState<TaxIdStatus | null>(null);

  // Profile information state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const userCfdTier = getUserCfdTier(totalPortfolioValue);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('first_name, last_name, country, phone_number, kyc_status')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user profile:', error);
          return;
        }

        if (data) {
          setFirstName(data.first_name || '');
          setLastName(data.last_name || '');
          setCountry(data.country || '');

          if (data.phone_number) {
            const match = data.phone_number.match(/^(\+\d+)\s*(.*)$/);
            if (match) {
              setCountryCode(match[1]);
              setPhoneNumber(match[2]);
            } else {
              setPhoneNumber(data.phone_number);
            }
          }

          setKycStatus(data.kyc_status || 'not_verified');
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };
    
    fetchUserProfile();
  }, [user.id]);

  useEffect(() => {
    let active = true;
    const fetchTaxIdStatus = async () => {
      const { data, error } = await supabase.rpc('get_my_kyc_tax_id_status');
      if (active && !error) setTaxIdStatus((data as TaxIdStatus | null) || null);
    };
    void fetchTaxIdStatus();
    return () => { active = false; };
  }, [user.id, kycStatus]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const { error } = await onUpdatePassword(newPassword);
      
      if (error) {
        throw error;
      }
      
      setSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setError(null);
    setSuccess(null);
    
    try {
      const fullPhoneNumber = phoneNumber ? `${countryCode} ${phoneNumber}` : '';

      const { error } = await supabase
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          country: country,
          phone_number: fullPhoneNumber
        })
        .eq('id', user.id);
      
      if (error) {
        throw error;
      }
      
      setSuccess('Profile information saved successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile information');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleStartVerification = () => {
    setShowKycUpload(true);
  };

  const handleKycStatusChange = (status: 'not_verified' | 'pending' | 'verified') => {
    setKycStatus(status);
    propUpdateKycStatus(status);
  };

  const showAccountRail = activeTab === 'profile' || activeTab === 'security';

  return (
    <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 border-b border-white/[0.08] pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/15">
            <User size={21} className="text-violet-200" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">
              {t('profile.accountSettings')}
            </h1>
            <p className="mt-0.5 truncate text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5 md:justify-end">
          <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2">
            <div className="text-[11px] text-slate-400">Portfolio value</div>
            <div className="font-mono text-base font-semibold text-white">{formatFiat(totalPortfolioValue)}</div>
            {totalPositionsPnl !== 0 && (
              <div className="mt-0.5 flex items-center gap-1">
                {totalPositionsPnl >= 0 ? (
                  <TrendingUp size={14} className="text-emerald-400" />
                ) : (
                  <TrendingDown size={14} className="text-red-400" />
                )}
                <span className={`text-xs font-medium ${totalPositionsPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalPositionsPnl >= 0 ? '+' : ''}{formatFiat(totalPositionsPnl)}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onSignOut}
            className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15"
          >
            <LogOut size={18} />
            {t('navigation.signOut')}
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-white/[0.1]" aria-label="Account settings sections">
        <button
          onClick={() => setActiveTab('profile')}
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
            activeTab === 'profile' 
              ? 'border-violet-400 text-white'
              : 'border-transparent text-slate-400 hover:border-white/[0.18] hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <User size={18} />
            {t('profile.profileInformation')}
          </div>
        </button>
        
        <button
          onClick={() => setActiveTab('security')}
          aria-current={activeTab === 'security' ? 'page' : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
            activeTab === 'security' 
              ? 'border-violet-400 text-white'
              : 'border-transparent text-slate-400 hover:border-white/[0.18] hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield size={18} />
            {t('profile.security')}
          </div>
        </button>
        
        <button
          onClick={() => setActiveTab('referrals')}
          aria-current={activeTab === 'referrals' ? 'page' : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
            activeTab === 'referrals'
              ? 'border-violet-400 text-white'
              : 'border-transparent text-slate-400 hover:border-white/[0.18] hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Gift size={18} />
            {t('profile.referrals')}
          </div>
        </button>

        <button
          onClick={() => setActiveTab('giveaway')}
          aria-current={activeTab === 'giveaway' ? 'page' : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
            activeTab === 'giveaway'
              ? 'border-violet-400 text-white'
              : 'border-transparent text-slate-400 hover:border-white/[0.18] hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Gift size={18} />
            Giveaway
          </div>
        </button>
        
        <button
          onClick={() => setActiveTab('support')}
          aria-current={activeTab === 'support' ? 'page' : undefined}
          className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
            activeTab === 'support' 
              ? 'border-violet-400 text-white'
              : 'border-transparent text-slate-400 hover:border-white/[0.18] hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <MessageCircle size={18} />
            {t('profile.support')}
          </div>
        </button>
      </nav>
      
      {/* Status Messages */}
      {error && (
        <div className="bg-red-600/20 border border-red-600 rounded-xl p-4 flex items-center gap-3 mb-6">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
          <span className="text-red-400">{error}</span>
        </div>
      )}
      
      {success && (
        <div className="bg-green-600/20 border border-green-600 rounded-xl p-4 flex items-center gap-3 mb-6">
          <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
          <span className="text-green-400">{success}</span>
        </div>
      )}
      
      {/* Tab Content */}
      <div className={`grid min-w-0 items-start gap-4 ${showAccountRail ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]' : ''}`}>
        {/* Left Column - Main Content */}
        <div className="min-w-0 space-y-4">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="app-surface-primary rounded-xl p-5 sm:p-6">
              <h2 className="mb-5 flex items-center gap-2.5 text-lg font-semibold text-white">
                <User size={19} className="text-violet-300" />
                {t('profile.profileInformation')}
              </h2>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('auth.email')}</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={user.email || ''}
                      readOnly
                      className="w-full app-input pl-10 pr-4 py-3 rounded-xl"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{t('auth.firstName')}</label>
                    <input
                      type="text"
                      placeholder="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full app-input px-4 py-3 rounded-xl transition-all"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{t('auth.lastName')}</label>
                    <input
                      type="text"
                      placeholder="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full app-input px-4 py-3 rounded-xl transition-all"
                    />
                  </div>
                </div>
                
                <div className="grid gap-4 lg:grid-cols-2">
                  <PhoneInput
                    value={phoneNumber}
                    countryCode={countryCode}
                    onCountryCodeChange={setCountryCode}
                    onPhoneNumberChange={setPhoneNumber}
                  />

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">{t('auth.country')}</label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="app-input custom-select w-full rounded-xl px-4 py-3 transition-all"
                    >
                      <option value="">{t('profile.selectCountry')}</option>
                      <option value="US">United States</option>
                      <option value="UK">United Kingdom</option>
                      <option value="CA">Canada</option>
                      <option value="AU">Australia</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="JP">Japan</option>
                      <option value="SG">Singapore</option>
                      <option value="CH">Switzerland</option>
                      <option value="NL">Netherlands</option>
                      <option value="ES">Spain</option>
                      <option value="IT">Italy</option>
                      <option value="SE">Sweden</option>
                      <option value="NO">Norway</option>
                      <option value="DK">Denmark</option>
                      <option value="FI">Finland</option>
                      <option value="NZ">New Zealand</option>
                      <option value="BR">Brazil</option>
                      <option value="MX">Mexico</option>
                      <option value="IN">India</option>
                      <option value="CN">China</option>
                      <option value="RU">Russia</option>
                      <option value="ZA">South Africa</option>
                      <option value="AE">United Arab Emirates</option>
                    </select>
                  </div>
                </div>

                {/* Language Preferences */}
                <div className="app-surface-muted rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Globe size={20} className="text-blue-400" />
                    Language Preferences
                  </h3>
                  <p className="text-slate-400 mb-4 text-sm">
                    Select your preferred language for the platform interface
                  </p>
                  <LanguageSwitcher />
                </div>

                {/* CFD Trading Tiers */}
                <div className="app-surface-primary rounded-2xl p-6 xl:hidden">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent mb-2">
                      CFD Trading Tiers
                    </h3>
                    <p className="text-slate-400 text-sm">
                      Grow your portfolio to unlock higher leverage limits and better trading conditions
                    </p>
                  </div>

                  {/* Current Tier Badge */}
                  <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/50 rounded-xl p-4 mb-6 text-center">
                    <div className="text-slate-400 text-sm mb-1">Your Current Tier</div>
                    <div className="flex items-center justify-center gap-2">
                      <Award size={24} className="text-amber-400" />
                      <span className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        {userCfdTier.name}
                      </span>
                    </div>
                    <div className="text-slate-400 text-sm mt-2">{userCfdTier.description}</div>
                  </div>

                  {/* Tier Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {[
                      { name: 'Starter', minEquity: formatFiatWhole(0), maxForex: 100, maxCommodities: 30, maxStocks: 20, icon: '📊' },
                      { name: 'Plus', minEquity: formatFiatWhole(10000), maxForex: 200, maxCommodities: 50, maxStocks: 40, icon: '📈' },
                      { name: 'Advanced', minEquity: formatFiatWhole(50000), maxForex: 300, maxCommodities: 75, maxStocks: 60, icon: '💹' },
                      { name: 'Pro', minEquity: formatFiatWhole(100000), maxForex: 500, maxCommodities: 90, maxStocks: 80, icon: '🏆' },
                      { name: 'Elite', minEquity: formatFiatWhole(250000), maxForex: 1000, maxCommodities: 100, maxStocks: 100, icon: '👑' },
                    ].map((tier) => (
                      <div
                        key={tier.name}
                        className={`relative app-surface-muted rounded-xl p-4 border transition-all duration-300 ${
                          tier.name === userCfdTier.name
                            ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/30'
                            : 'border-slate-700/50 hover:border-slate-600'
                        }`}
                      >
                        {tier.name === userCfdTier.name && (
                          <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                            ACTIVE
                          </div>
                        )}
                        <div className="text-center mb-3">
                          <div className="text-4xl mb-2">{tier.icon}</div>
                          <div className="text-white font-bold text-lg">{tier.name}</div>
                          <div className="text-slate-400 text-xs">Min. {tier.minEquity}</div>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Forex:</span>
                            <span className="text-emerald-400 font-bold">{tier.maxForex}x</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Commodities:</span>
                            <span className="text-blue-400 font-bold">{tier.maxCommodities}x</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Stocks:</span>
                            <span className="text-purple-400 font-bold">{tier.maxStocks}x</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Your Limits */}
                  <div className="bg-gradient-to-r from-emerald-900/20 to-blue-900/20 border border-emerald-500/30 rounded-xl p-4">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp size={18} className="text-emerald-400" />
                      Your Current Maximum Leverage
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-emerald-400">{userCfdTier.maxForex}x</div>
                        <div className="text-slate-400 text-xs mt-1">Forex</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-400">{userCfdTier.maxCommodities}x</div>
                        <div className="text-slate-400 text-xs mt-1">Commodities</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-400">{userCfdTier.maxStocks}x</div>
                        <div className="text-slate-400 text-xs mt-1">Stocks</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-center text-xs text-slate-500">
                    💡 Your leverage limits are automatically adjusted based on your total portfolio value
                  </div>
                </div>

                {/* KYC Section */}
                <div id="kyc-section" className="app-surface-muted rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">{t('profile.kycVerification')}</h3>
                  <p className="text-slate-400 mb-4">
                    {t('profile.kycDescription')}
                  </p>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      kycStatus === 'verified' ? 'bg-green-500/20' : 
                      kycStatus === 'pending' ? 'bg-amber-500/20' : 
                      'bg-amber-500/20'
                    }`}>
                      {kycStatus === 'verified' ? (
                        <CheckCircle size={20} className="text-green-400" />
                      ) : kycStatus === 'pending' ? (
                        <Clock size={20} className="text-amber-400" />
                      ) : (
                        <AlertTriangle size={20} className="text-amber-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-white font-medium">
                        {kycStatus === 'verified' ? t('profile.verificationComplete') : 
                         kycStatus === 'pending' ? t('profile.verificationPending') : 
                         t('profile.verificationRequired')}
                      </div>
                      <div className="text-sm text-slate-400">
                        {kycStatus === 'verified' ? t('profile.accountVerified') : 
                         kycStatus === 'pending' ? t('profile.documentsReviewed') : 
                         t('profile.accountNotVerified')}
                      </div>
                    </div>
                  </div>

                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-950/50 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-white">Tax ID</div>
                      <div className="mt-0.5 text-xs text-slate-400">{taxIdStatus ? `On file · ending ${taxIdStatus.last_four}` : 'No Tax ID on file'}</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${taxIdStatus?.status === 'verified' ? 'bg-emerald-500/15 text-emerald-300' : taxIdStatus?.status === 'pending' ? 'bg-amber-500/15 text-amber-300' : taxIdStatus?.status === 'rejected' ? 'bg-red-500/15 text-red-300' : 'bg-slate-700/70 text-slate-300'}`}>
                      {taxIdStatus?.status === 'verified' ? 'Approved' : taxIdStatus?.status === 'pending' ? 'Pending admin review' : taxIdStatus?.status === 'rejected' ? 'Resubmission required' : 'Not submitted'}
                    </span>
                  </div>
                  {taxIdStatus?.status === 'rejected' && taxIdStatus.review_reason && (
                    <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      <span className="font-semibold">Review note:</span> {taxIdStatus.review_reason}
                    </div>
                  )}
                  
                  {(kycStatus === 'not_verified' || (kycStatus === 'pending' && !taxIdStatus)) && (
                    <button 
                      onClick={handleStartVerification}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                    >
                      {taxIdStatus?.status === 'rejected' ? 'Resubmit verification' : kycStatus === 'pending' ? 'Complete Tax ID verification' : t('profile.startVerification')}
                      <ChevronRight size={18} />
                    </button>
                  )}
                  
                  {kycStatus === 'pending' && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm">
                      {taxIdStatus ? 'Your identity documents and Tax ID are awaiting administrator review.' : 'Your previous KYC submission needs a Tax ID. Complete the verification form to send it for administrator review.'}
                    </div>
                  )}
                  
                  {kycStatus === 'verified' && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-green-400 text-sm">
                      {t('profile.verificationComplete')}
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-700 disabled:to-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                  >
                    {savingProfile ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save size={18} />
                        {t('profile.saveChanges')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* Change Password */}
              <div className="app-surface-primary rounded-xl p-5 sm:p-6">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-3">
                  <Lock size={20} className="text-blue-400" />
                  {t('profile.changePassword')}
                </h2>
                
                <form onSubmit={handlePasswordChange} className="space-y-6">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{t('profile.currentPassword')}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={t('profile.enterCurrentPassword')}
                        className="w-full app-input pl-10 pr-10 py-3 rounded-xl transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                      >
                        {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{t('profile.newPassword')}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('profile.enterNewPassword')}
                        className="w-full app-input pl-10 pr-10 py-3 rounded-xl transition-all"
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-1">
                      {t('profile.passwordMinLength')}
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{t('profile.confirmNewPassword')}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full app-input pl-10 pr-10 py-3 rounded-xl transition-all"
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
                  
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading || !newPassword || !confirmPassword}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-700 disabled:to-slate-800 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        t('profile.updatePassword')
                      )}
                    </button>
                  </div>
                </form>
              </div>
              
            </div>
          )}
          
          {/* Referrals Tab */}
          {activeTab === 'referrals' && (
            <ReferralTab />
          )}
          
          {/* Support Tab */}
          {activeTab === 'giveaway' && (
            <GiveawaySection />
          )}

          {activeTab === 'support' && (
            <SupportChat user={user} />
          )}

        </div>
        
        {/* Right Column - Account Summary */}
        {showAccountRail && <div className="min-w-0 space-y-4 xl:sticky xl:top-20">
          {/* Account Summary */}
          <div className="app-surface-primary rounded-xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-white">{t('profile.accountSummary')}</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">{t('profile.accountType')}</span>
                <span className="text-white font-medium">{t('profile.standardAccountType')}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-slate-400">{t('profile.memberSince')}</span>
                <span className="text-white font-medium">{new Date(user.created_at || Date.now()).toLocaleDateString()}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-slate-400">{t('profile.kycStatus')}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  kycStatus === 'verified' ? 'bg-green-500/20 text-green-400' :
                  kycStatus === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {kycStatus === 'verified' ? 'Verified' :
                   kycStatus === 'pending' ? 'Pending' :
                   t('profile.notVerified')}
                </span>
              </div>
              
            </div>
            
            {kycStatus !== 'verified' && (
              <div className="mt-5 border-t border-white/[0.08] pt-4">
                <button
                  onClick={() => {
                    setActiveTab('profile');
                    window.setTimeout(() => document.getElementById('kyc-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-2.5 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-500/20"
                >
                  {kycStatus === 'pending' ? 'View verification status' : 'Complete verification'}
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          
          {/* Account Balances */}
          <AccountBalancesCard
            title={t('profile.accountBalances')}
            usdtBalance={usdtBalance || 0}
            btcBalance={btcBalance || 0}
            currentPrice={currentPrice || 0}
          />
        </div>}
      </div>

      {/* KYC Document Upload Modal */}
      {showKycUpload && (
        <KycDocumentUpload 
          onClose={() => setShowKycUpload(false)}
          onKycStatusChange={handleKycStatusChange}
        />
      )}
    </div>
  );
};

export default ProfilePage;

