import React, { useState, useEffect } from 'react';
import { X, Wallet, ArrowUpRight, AlertTriangle, CheckCircle, Copy, ExternalLink, Bitcoin, DollarSign } from 'lucide-react';

interface CryptoWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  usdtBalance: number;
  btcBalance: number;
  currentBtcPrice: number;
  initialCurrency?: 'USDT' | 'BTC';
  onWithdraw: (currency: 'USDT' | 'BTC', amount: number, address: string, network: string) => Promise<boolean>;
}

const CryptoWithdrawalModal: React.FC<CryptoWithdrawalModalProps> = ({
  isOpen,
  onClose,
  usdtBalance,
  btcBalance,
  currentBtcPrice,
  initialCurrency = 'USDT',
  onWithdraw
}) => {
  const [currency, setCurrency] = useState<'USDT' | 'BTC'>(initialCurrency);
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState(initialCurrency === 'USDT' ? 'ERC20' : 'BTC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'confirmation' | 'success'>('form');
  const [transactionId, setTransactionId] = useState<string | null>(null);

  // Reset form when modal is opened or currency changes
  useEffect(() => {
    if (isOpen) {
      setCurrency(initialCurrency);
      setAmount('');
      setAddress('');
      setNetwork(initialCurrency === 'USDT' ? 'ERC20' : 'BTC');
      setError(null);
      setSuccess(null);
      setStep('form');
      setTransactionId(null);
    }
  }, [isOpen, initialCurrency]);

  // Update network options when currency changes
  useEffect(() => {
    if (currency === 'USDT') {
      setNetwork('ERC20');
    } else {
      setNetwork('BTC');
    }
  }, [currency]);

  // Get available balance for selected currency
  const getAvailableBalance = () => {
    return currency === 'USDT' ? usdtBalance : btcBalance;
  };

  // Get network options based on selected currency
  const getNetworkOptions = () => {
    if (currency === 'USDT') {
      return [
        { value: 'ERC20', label: 'Ethereum (ERC20)' },
        { value: 'TRC20', label: 'Tron (TRC20)' },
        { value: 'BEP20', label: 'Binance Smart Chain (BEP20)' }
      ];
    } else {
      return [
        { value: 'BTC', label: 'Bitcoin Network' },
        { value: 'Lightning', label: 'Lightning Network' }
      ];
    }
  };

  // Calculate withdrawal fee (0.1% for USDT, 0.0005 BTC for BTC)
  const calculateFee = () => {
    if (currency === 'USDT') {
      return parseFloat(amount) * 0.001;
    } else {
      return 0.0005;
    }
  };

  // Calculate amount to receive after fee
  const calculateAmountToReceive = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) return 0;
    
    const fee = calculateFee();
    return parsedAmount - fee;
  };

  // Handle max button click
  const handleMaxClick = () => {
    const balance = getAvailableBalance();
    if (currency === 'USDT') {
      setAmount(balance.toString());
    } else {
      // For BTC, subtract the fee to ensure the total doesn't exceed the balance
      const maxAmount = Math.max(0, balance - 0.0005);
      setAmount(maxAmount.toFixed(8));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    if (parsedAmount > getAvailableBalance()) {
      setError(`Insufficient ${currency} balance`);
      return;
    }
    
    if (!address) {
      setError('Please enter a valid wallet address');
      return;
    }
    
    // Move to confirmation step
    setError(null);
    setStep('confirmation');
  };

  // Handle withdrawal confirmation
  const handleConfirmWithdrawal = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const success = await onWithdraw(currency, parseFloat(amount), address, network);
      
      if (success) {
        setSuccess(`Withdrawal of ${amount} ${currency} initiated successfully`);
        setStep('success');
        // Generate a fake transaction ID
        setTransactionId(`tx_${Math.random().toString(36).substring(2, 15)}`);
      } else {
        throw new Error('Withdrawal failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during withdrawal');
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  // Copy transaction ID to clipboard
  const copyTransactionId = () => {
    if (transactionId) {
      navigator.clipboard.writeText(transactionId);
      setSuccess('Transaction ID copied to clipboard');
      
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl max-w-md w-full p-4 sm:p-6 border border-slate-700 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/25">
              <ArrowUpRight size={20} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold text-white">
              {step === 'form' ? 'Withdraw Crypto' : 
               step === 'confirmation' ? 'Confirm Withdrawal' : 
               'Withdrawal Initiated'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm sm:text-base">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
            <span className="text-green-400 text-sm sm:text-base">{success}</span>
          </div>
        )}

        {/* Withdrawal Form */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Select Asset</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCurrency('USDT')}
                  className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                    currency === 'USDT'
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25 transform scale-105'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                  }`}
                >
                  <DollarSign size={16} className={currency === 'USDT' ? 'text-white' : 'text-slate-400'} />
                  USDT
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('BTC')}
                  className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                    currency === 'BTC'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25 transform scale-105'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                  }`}
                >
                  <Bitcoin size={16} className={currency === 'BTC' ? 'text-white' : 'text-slate-400'} />
                  BTC
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 sm:mb-2">
                <label className="text-xs sm:text-sm text-slate-400">Amount</label>
                <span className="text-xs text-slate-400">
                  Available: {getAvailableBalance().toFixed(currency === 'USDT' ? 2 : 8)} {currency}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Enter amount`}
                  className="w-full app-input px-3 sm:px-4 py-2 sm:py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm sm:text-base"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded bg-blue-400/10"
                  >
                    MAX
                  </button>
                  <span className="text-slate-400">{currency}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 sm:mt-1 ml-1">
                Minimum withdrawal: {currency === 'USDT' ? '10 USDT' : '0.001 BTC'}
              </p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Recipient Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={`Enter ${currency} address`}
                className="w-full app-input px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm sm:text-base"
              />
              <p className="text-xs text-slate-500 mt-0.5 sm:mt-1 ml-1">
                Double-check the address to avoid loss of funds
              </p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Network</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full app-input px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all custom-select text-sm sm:text-base"
              >
                {getNetworkOptions().map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-0.5 sm:mt-1 ml-1">
                Select the correct network for your withdrawal
              </p>
            </div>

            <div className="bg-slate-900/30 rounded-xl p-3 sm:p-4 border border-slate-700/30">
              <div className="flex justify-between items-center mb-1 sm:mb-2">
                <span className="text-xs sm:text-sm text-slate-400">Withdrawal Fee</span>
                <span className="text-xs sm:text-sm text-white">
                  {currency === 'USDT' ? '0.1%' : '0.0005 BTC'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm text-slate-400">You Will Receive</span>
                <span className="text-xs sm:text-sm text-white">
                  {calculateAmountToReceive().toFixed(currency === 'USDT' ? 2 : 8)} {currency}
                </span>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-amber-400 flex items-start gap-2 sm:gap-3">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5 sm:mb-1">Important Information</p>
                <p>Withdrawals typically take 10-30 minutes to process. For security reasons, large withdrawals may require additional verification.</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !amount || !address}
              className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 disabled:from-slate-700 disabled:to-slate-800 text-white py-2 sm:py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <ArrowUpRight size={18} />
                  Withdraw {currency}
                </>
              )}
            </button>
          </form>
        )}

        {/* Confirmation Step */}
        {step === 'confirmation' && (
          <div className="space-y-6">
            <div className="app-surface-muted rounded-xl p-3 sm:p-4">
              <div className="text-center mb-3 sm:mb-4">
                <div className="text-xs sm:text-sm text-slate-400 mb-1">You are about to withdraw</div>
                <div className="text-xl sm:text-2xl font-bold text-white">{amount} {currency}</div>
                <div className="text-xs sm:text-sm text-slate-300">
                  ≈ ${(parseFloat(amount) * (currency === 'USDT' ? 1 : currentBtcPrice)).toFixed(2)}
                </div>
              </div>
              
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">To Address</span>
                  <span className="text-white font-mono text-xs break-all text-right">{address}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Network</span>
                  <span className="text-white text-right">{network}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Fee</span>
                  <span className="text-white text-right">
                    {currency === 'USDT' ? `${(parseFloat(amount) * 0.001).toFixed(2)} USDT` : '0.0005 BTC'}
                  </span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">You Will Receive</span>
                  <span className="text-white font-medium text-right">
                    {calculateAmountToReceive().toFixed(currency === 'USDT' ? 2 : 8)} {currency}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-amber-400 flex items-start gap-2 sm:gap-3">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5 sm:mb-1">Withdrawal Warning</p>
                <p>Please verify that the address and network are correct. Withdrawals to incorrect addresses cannot be recovered.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep('form')}
                disabled={loading}
                className="flex-1 app-action-soft text-white py-2 sm:py-3 rounded-xl font-medium transition-colors text-sm sm:text-base"
              >
                Back
              </button>
              <button
                onClick={handleConfirmWithdrawal}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 disabled:from-slate-700 disabled:to-slate-800 text-white py-2 sm:py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Confirm Withdrawal'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="space-y-6">
            <div className="text-center py-3 sm:py-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <CheckCircle size={28} className="text-green-400" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2 sm:mb-3">Withdrawal Initiated</h3>
              <p className="text-slate-300 text-sm sm:text-base mb-4 sm:mb-6">
                Your withdrawal request has been submitted and is being processed. This may take 10-30 minutes to complete.
              </p>
            </div>

            <div className="app-surface-muted rounded-xl p-3 sm:p-4">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Amount</span>
                  <span className="text-white text-right">{amount} {currency}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">To Address</span>
                  <span className="text-white font-mono text-xs break-all text-right">{address}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Network</span>
                  <span className="text-white text-right">{network}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Transaction ID</span>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <span className="text-white font-mono text-xs text-right">{transactionId}</span>
                    <button
                      onClick={copyTransactionId}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      <Copy size={12} className="sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Status</span>
                  <span className="text-amber-400 text-right">Processing</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 sm:p-4">
              <span className="text-xs sm:text-sm text-blue-400">Track your withdrawal in the Transactions tab</span>
              <button className="text-blue-400 hover:text-blue-300 transition-colors">
                <ExternalLink size={14} className="sm:w-4 sm:h-4" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full app-action-soft text-white py-2 sm:py-3 rounded-xl font-medium transition-colors text-sm sm:text-base"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CryptoWithdrawalModal;

