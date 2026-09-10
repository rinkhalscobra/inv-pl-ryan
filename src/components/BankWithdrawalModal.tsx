import React, { useState, useEffect } from 'react';
import { X, CreditCard, ArrowUpRight, AlertTriangle, CheckCircle, Copy, ExternalLink, Building, User, Landmark } from 'lucide-react';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface BankWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  usdtBalance: number;
  onWithdraw: (amount: number, bankDetails: {
    bankName: string;
    accountNumber: string;
    routingNumber: string;
    beneficiaryName: string;
  }) => Promise<boolean>;
}

const BankWithdrawalModal: React.FC<BankWithdrawalModalProps> = ({
  isOpen,
  onClose,
  usdtBalance,
  onWithdraw
}) => {
  const { formatFiat } = useFiatCurrency();
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'confirmation' | 'success'>('form');
  const [transactionId, setTransactionId] = useState<string | null>(null);

  // Reset form when modal is opened
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setBankName('');
      setAccountNumber('');
      setRoutingNumber('');
      setBeneficiaryName('');
      setError(null);
      setSuccess(null);
      setStep('form');
      setTransactionId(null);
    }
  }, [isOpen]);

  // Calculate withdrawal fee (0.5% for bank withdrawals)
  const calculateFee = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) return 0;
    return parsedAmount * 0.005;
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
    setAmount(usdtBalance.toString());
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
    
    if (parsedAmount > usdtBalance) {
      setError('Insufficient USDT balance');
      return;
    }
    
    if (!bankName || !accountNumber || !routingNumber || !beneficiaryName) {
      setError('Please fill in all bank details');
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
      const success = await onWithdraw(parseFloat(amount), {
        bankName,
        accountNumber,
        routingNumber,
        beneficiaryName
      });
      
      if (success) {
        setSuccess(`Bank withdrawal of ${amount} USDT initiated successfully`);
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
      <div className="app-surface-primary rounded-xl max-w-md w-full p-4 sm:p-6 shadow-2xl overflow-y-auto hide-scrollbar max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Landmark size={20} className="text-white" />
            </div>
            <h2 className="min-w-0 text-lg sm:text-xl font-semibold text-white">
              {step === 'form' ? 'Bank Withdrawal' : 
               step === 'confirmation' ? 'Confirm Withdrawal' : 
               'Withdrawal Initiated'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-600/20 border border-red-600 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm sm:text-base">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="bg-green-600/20 border border-green-600 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
            <span className="text-green-400 text-sm sm:text-base">{success}</span>
          </div>
        )}

        {/* Bank Withdrawal Form */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-1 sm:mb-2">
                <label className="text-xs sm:text-sm text-slate-400">Amount (USDT)</label>
                <span className="text-xs text-slate-400 text-right">
                  Available: {usdtBalance.toFixed(2)} USDT
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full app-input py-2 pl-4 pr-24 sm:py-3 sm:pl-4 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm sm:text-base"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded bg-blue-400/10"
                  >
                    MAX
                  </button>
                  <span className="text-slate-400">USDT</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 sm:mt-1 ml-1">
                Minimum withdrawal: 100 USDT
              </p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Bank Name</label>
              <div className="relative">
                <Building size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Enter bank name"
                  className="w-full app-input pl-11 pr-4 py-2 sm:py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm sm:text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Account Number</label>
              <div className="relative">
                <CreditCard size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Enter account number"
                  className="w-full app-input pl-11 pr-4 py-2 sm:py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm sm:text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Routing Number / SWIFT Code</label>
              <div className="relative">
                <Landmark size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  placeholder="Enter routing number or SWIFT code"
                  className="w-full app-input pl-11 pr-4 py-2 sm:py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm sm:text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1 sm:mb-2">Beneficiary Name</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="Enter beneficiary name"
                  className="w-full app-input pl-11 pr-4 py-2 sm:py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm sm:text-base"
                />
              </div>
            </div>

            <div className="bg-slate-900/30 rounded-xl p-3 sm:p-4 border border-slate-700/30">
              <div className="flex justify-between items-center mb-1 sm:mb-2">
                <span className="text-xs sm:text-sm text-slate-400">Withdrawal Fee (0.5%)</span>
                <span className="text-xs sm:text-sm text-white">
                  {calculateFee().toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm text-slate-400">Estimated EUR Payout</span>
                <span className="text-xs sm:text-sm text-white">
                  {formatFiat(calculateAmountToReceive())}
                </span>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-amber-400 flex items-start gap-2 sm:gap-3">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5 sm:mb-1">Important Information</p>
                <p>Bank withdrawals typically take 1-3 business days to process. Please ensure all bank details are correct to avoid delays.</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !amount || !bankName || !accountNumber || !routingNumber || !beneficiaryName}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-700 disabled:to-slate-800 text-white py-2 sm:py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <ArrowUpRight size={18} />
                  Withdraw to Bank
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
                <div className="text-xl sm:text-2xl font-bold text-white">{amount} USDT</div>
                <div className="text-xs sm:text-sm text-slate-300">
                  ≈ {formatFiat(parseFloat(amount))}
                </div>
              </div>
              
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Bank Name</span>
                  <span className="text-white text-right">{bankName}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Account Number</span>
                  <span className="text-white text-right">••••{accountNumber.slice(-4)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Routing Number</span>
                  <span className="text-white text-right">{routingNumber}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Beneficiary</span>
                  <span className="text-white text-right">{beneficiaryName}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Fee (0.5%)</span>
                  <span className="text-white text-right">{calculateFee().toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Estimated EUR Payout</span>
                  <span className="text-white font-medium text-right">
                    {formatFiat(calculateAmountToReceive())}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-amber-400 flex items-start gap-2 sm:gap-3">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-0.5 sm:mb-1">Withdrawal Warning</p>
                <p>Please verify that all bank details are correct. Withdrawals to incorrect accounts cannot be recovered.</p>
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
                className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-700 disabled:to-slate-800 text-white py-2 sm:py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 text-sm sm:text-base"
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
                Your bank withdrawal request has been submitted and is being processed. This may take 1-3 business days to complete.
              </p>
            </div>

            <div className="app-surface-muted rounded-xl p-3 sm:p-4">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Amount</span>
                  <span className="text-white text-right">{amount} USDT</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Estimated EUR Payout</span>
                  <span className="text-white text-right">{formatFiat(calculateAmountToReceive())}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Bank</span>
                  <span className="text-white text-right">{bankName}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400 mr-2">Account</span>
                  <span className="text-white text-right">••••{accountNumber.slice(-4)}</span>
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

export default BankWithdrawalModal;

