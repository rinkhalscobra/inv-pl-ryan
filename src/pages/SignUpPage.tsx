import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Building2, Gift, User, Globe, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import BrandLogo from '../components/BrandLogo';
import PhoneInput from '../components/PhoneInput';
import { supabase } from '../lib/supabaseClient';

const SignUpPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { companyKey } = useParams<{ companyKey?: string }>();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [resolvingCompany, setResolvingCompany] = useState(false);
  const [country, setCountry] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const { signUp, signIn } = useAuth();
  const registrationKey = companyKey || searchParams.get('company') || '';

  useEffect(() => {
    const refParam = searchParams.get('ref');
    if (refParam) {
      setReferralCode(refParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!registrationKey) {
      setCompanyName('');
      return;
    }

    const validLegacyKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationKey);
    const validShortKey = /^[a-z0-9]{12}$/i.test(registrationKey);
    if (!validLegacyKey && !validShortKey) {
      setError('This registration link is invalid. Request a new link.');
      return;
    }

    let active = true;
    setResolvingCompany(true);
    void supabase.rpc('crm_resolve_registration_company', {
      p_company_code: null,
      p_registration_key: registrationKey,
    }).then(({ data, error: resolveError }) => {
      if (!active) return;
      if (resolveError) {
        setError(resolveError.message || 'This registration link is invalid or inactive.');
        return;
      }
      const company = data as { code?: string; security_code?: string; name?: string } | null;
      if (!company?.security_code && !company?.code) {
        setError('This registration link is invalid or inactive.');
        return;
      }
      setSecurityCode(company.security_code || company.code);
      setCompanyName(company.name || company.code);
      setError('');
    }).finally(() => { if (active) setResolvingCompany(false); });

    return () => { active = false; };
  }, [registrationKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const normalizedSecurityCode = securityCode.trim().toUpperCase();
      if (!/^[A-F0-9]{10}$/.test(normalizedSecurityCode)) {
        throw new Error('Enter the valid 10-character registration security code provided by your company.');
      }

      const { data: resolvedCompany, error: companyError } = await supabase.rpc('crm_resolve_registration_company', {
        p_company_code: normalizedSecurityCode,
        p_registration_key: registrationKey || null,
      });
      if (companyError) throw new Error(companyError.message);
      const verifiedCompany = resolvedCompany as { code?: string; security_code?: string; name?: string } | null;
      const verifiedSecurityCode = verifiedCompany?.security_code || verifiedCompany?.code;
      if (!verifiedSecurityCode) throw new Error('Registration security code is invalid or inactive.');
      setSecurityCode(verifiedSecurityCode);
      setCompanyName(verifiedCompany?.name || 'your company');

      const { data, error: signUpError } = await signUp(
        email,
        password,
        referralCode,
        firstName,
        lastName,
        country,
        phoneNumber.trim() ? `${countryCode} ${phoneNumber.trim()}` : '',
        registrationKey || undefined,
        verifiedSecurityCode
      );

      if (signUpError) {
        throw signUpError;
      }

      if (!data.session) {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          throw new Error('Email confirmation is still enabled in Supabase. Disable "Confirm email" in Authentication settings.');
        }
      }

      sessionStorage.removeItem('marketLoadingShown');
      navigate('/dashboard', { replace: true });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // List of countries for dropdown
  const countries = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde',
  'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China',
  'Colombia', 'Comoros', 'Congo (Brazzaville)', 'Congo (Kinshasa)', 'Costa Rica', 'Croatia',
  'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini',
  'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana',
  'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras',
  'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait',
  'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
  'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco',
  'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal',
  'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia',
  'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay',
  'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
  'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste',
  'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
];

  return (
    <div className="min-h-screen flex items-center justify-center overflow-x-hidden px-4 py-8 relative">
      <div className="absolute inset-0 z-0 app-auth-bg" />

      <div className="max-w-lg z-20 relative" style={{ width: 'calc(100vw - 2rem)' }}>
        {/* Title */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <h1 className="sr-only">
            {t('auth.joinPlatform')}
          </h1>
          <BrandLogo className="mx-auto mb-4 h-auto w-64 sm:w-72" />
          <p className="text-slate-300 mt-2 text-base sm:text-lg">
            {t('auth.createYourAccount')}
          </p>
        </div>

        {/* Sign Up Form */}
        <div className="app-auth-card rounded-2xl p-6 sm:p-8" style={{ boxSizing: 'border-box' }}>
          {error && (
            <div className="bg-red-600/30 border-2 border-red-600 rounded-xl p-4 flex items-center gap-3 mb-6 shadow-lg shadow-red-500/20">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xl font-semibold text-white mb-4">{t('auth.createYourAccountStep')}</h2>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Registration security code <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={securityCode}
                      onChange={(event) => setSecurityCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 10))}
                      placeholder="Enter security code"
                      className="w-full app-input pl-10 pr-4 py-3 rounded-xl font-mono uppercase transition-all read-only:cursor-not-allowed read-only:opacity-80"
                      minLength={10}
                      maxLength={10}
                      autoCapitalize="characters"
                      autoComplete="off"
                      readOnly={Boolean(registrationKey && companyName)}
                      disabled={resolvingCompany}
                      required
                    />
                  </div>
                  <p className={`mt-2 text-xs ${companyName ? 'text-emerald-300' : 'text-slate-500'}`}>
                    {resolvingCompany ? 'Checking the secure registration link...' : companyName ? 'Security code verified.' : 'Enter the private code provided by your company. It securely connects your registration to the correct company.'}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      {t('auth.firstName')} <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder={t('auth.firstName')}
                        className="w-full app-input pl-10 pr-4 py-3 rounded-xl transition-all"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      {t('auth.lastName')} <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder={t('auth.lastName')}
                        className="w-full app-input pl-10 pr-4 py-3 rounded-xl transition-all"
                        required
                      />
                    </div>
                  </div>
                </div>

                <PhoneInput
                  value={phoneNumber}
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                  onPhoneNumberChange={setPhoneNumber}
                />

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    {t('auth.country')} <span className="text-slate-500">(optional fallback)</span>
                  </label>
                  <div
                    className="relative"
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setCountryDropdownOpen(false);
                      }
                    }}
                  >
                    <Globe size={18} className="absolute left-3 top-1/2 z-10 transform -translate-y-1/2 text-slate-400" />
                    <button
                      type="button"
                      onClick={() => setCountryDropdownOpen((isOpen) => !isOpen)}
                      className="relative w-full app-input text-left pl-10 pr-10 py-3 rounded-xl transition-all"
                      aria-expanded={countryDropdownOpen}
                      aria-haspopup="listbox"
                    >
                      <span className={country ? 'text-white' : 'text-slate-400'}>
                        {country || t('auth.selectYourCountry')}
                      </span>
                      <ChevronDown
                        size={18}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {countryDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl app-dropdown py-2" role="listbox">
                        {countries.map((countryName) => (
                          <button
                            key={countryName}
                            type="button"
                            onClick={() => {
                              setCountry(countryName);
                              setCountryDropdownOpen(false);
                            }}
                            className={`w-full px-10 py-2.5 text-left text-sm transition-colors ${
                              country === countryName
                                ? 'bg-blue-500/25 text-white'
                                : 'text-slate-200 hover:bg-blue-500/15 hover:text-white'
                            }`}
                            role="option"
                            aria-selected={country === countryName}
                          >
                            {countryName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">A recognized international phone code sets your country automatically.</p>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    {t('auth.email')} <span className="text-red-400">*</span>
                  </label>
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

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    {t('auth.password')} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.createAPassword')}
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
                  <label className="block text-sm text-slate-400 mb-2">
                    {t('auth.confirmPassword')} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('auth.confirmYourPassword')}
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

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    {t('auth.referralCode')} <span className="text-slate-500">({t('common.optional')})</span>
                  </label>
                  <div className="relative">
                    <Gift size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder={t('auth.enterReferralCode')}
                      className="w-full app-input pl-10 pr-4 py-3 rounded-xl transition-all"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1 ml-1">
                    {t('auth.getTradingBonuses')}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading || resolvingCompany}
                    className="w-full app-action-primary text-white py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 sm:w-2/3"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        {t('auth.createAccount')}
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-300">
              {t('auth.alreadyHaveAccount')}{' '}
              <Link to="/signin" className="text-blue-400 hover:text-blue-300 transition-colors font-medium underline">
                {t('auth.signIn')}
              </Link>
            </p>
          </div>
        </div>

        {/* Terms and Conditions */}
        <div className="mt-8 text-center app-surface-muted py-3 px-4 rounded-xl">
          <p className="text-xs text-slate-300">
            {t('auth.byCreatingAccount')}{' '}
            <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">
              {t('auth.termsOfService')}
            </a>{' '}
            {t('auth.and')}{' '}
            <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">
              {t('auth.privacyPolicy')}
            </a><br />
            <span className="mt-1 inline-block">{t('auth.secureConnectionTo')}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
