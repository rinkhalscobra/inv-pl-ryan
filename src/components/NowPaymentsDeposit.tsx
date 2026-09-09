import React, { useState, useEffect } from 'react';
import { DollarSign, QrCode, Copy, RefreshCw, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabaseClient';

interface NowPaymentsDepositProps {
  userId: string;
  onDepositComplete?: () => void;
  onSuccess?: () => void;
  initialAmount?: string;
  fixedPayCurrency?: string;
  buttonLabel?: string;
}

const NowPaymentsDeposit: React.FC<NowPaymentsDepositProps> = ({
  userId,
  onDepositComplete,
  onSuccess,
  initialAmount = '',
  fixedPayCurrency,
  buttonLabel = 'Generate Deposit Address',
}) => {
  const [amount, setAmount] = useState(initialAmount);
  const [payCurrency, setPayCurrency] = useState(fixedPayCurrency || 'BTC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [statusPolling, setStatusPolling] = useState<number | null>(null);

  // Available cryptocurrencies
  const availableCurrencies = [
    { symbol: 'BTC', name: 'Bitcoin' },
    { symbol: 'ETH', name: 'Ethereum' },
    { symbol: 'LTC', name: 'Litecoin' },
    { symbol: 'DOGE', name: 'Dogecoin' },
    { symbol: 'XRP', name: 'Ripple' },
    { symbol: 'BNB', name: 'Binance Coin' },
    { symbol: 'USDT', name: 'Tether' },
    { symbol: 'USDC', name: 'USD Coin' },
    { symbol: 'SOL', name: 'Solana' },
    { symbol: 'ADA', name: 'Cardano' }
  ];

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (statusPolling) {
        clearInterval(statusPolling);
      }
    };
  }, [statusPolling]);

  useEffect(() => {
    setAmount(initialAmount);
  }, [initialAmount]);

  useEffect(() => {
    if (fixedPayCurrency) setPayCurrency(fixedPayCurrency);
  }, [fixedPayCurrency]);

  // Generate QR code when payment address is available
  useEffect(() => {
    if (paymentData?.pay_address) {
      generateQrCode(paymentData.pay_address);
    }
  }, [paymentData]);

  const generateQrCode = async (address: string) => {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(address);
      setQrCodeUrl(qrCodeDataUrl);
    } catch (err) {
      console.error('Error generating QR code:', err);
      setError('Failed to generate QR code');
    }
  };

  const handleCreatePayment = async () => {
    setLoading(true);
    setError(null);
    setPaymentData(null);
    setPaymentStatus(null);
    
    if (statusPolling) {
      clearInterval(statusPolling);
      setStatusPolling(null);
    }

    try {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Please enter a valid amount');
      }

      const { data, error: invokeError } = await supabase.functions.invoke('nowpayments-create-payment', {
        body: {
          amount: numAmount,
          pay_currency: payCurrency,
          user_id: userId
        },
      });
      if (invokeError) {
        const context = (invokeError as any).context;
        const errorData = context ? await context.json().catch(() => null) : null;
        throw new Error(errorData?.error || invokeError.message || 'Failed to create payment');
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create payment');
      }

      setPaymentData(data);
      setPaymentStatus('waiting');

      // Start polling for payment status
      const interval = setInterval(() => {
        checkPaymentStatus(data.payment_id);
      }, 15000); // Check every 15 seconds
      
      setStatusPolling(interval);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async (paymentId: string) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('nowpayments-check-payment', {
        body: {
          payment_id: paymentId
        },
      });

      if (invokeError) {
        console.error('Error checking payment status:', invokeError);
        return;
      }
      
      if (data.success) {
        setPaymentStatus(data.payment_status);
        
        // If payment is completed, stop polling and notify parent
        if (data.payment_status === 'finished') {
          if (statusPolling) {
            clearInterval(statusPolling);
            setStatusPolling(null);
          }

          // Call both callbacks if provided
          onDepositComplete?.();
          onSuccess?.();
        }
        
        // If payment failed or expired, stop polling
        if (['failed', 'expired', 'refunded'].includes(data.payment_status)) {
          if (statusPolling) {
            clearInterval(statusPolling);
            setStatusPolling(null);
          }
        }
      }
    } catch (err) {
      console.error('Error checking payment status:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };


  const getStatusDisplay = () => {
    switch (paymentStatus) {
      case 'waiting':
        return { 
          icon: <Clock size={20} className="text-amber-400" />, 
          text: 'Waiting for payment', 
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30'
        };
      case 'confirming':
        return { 
          icon: <Clock size={20} className="text-blue-400" />, 
          text: 'Confirming transaction', 
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30'
        };
      case 'confirmed':
        return { 
          icon: <Clock size={20} className="text-blue-400" />, 
          text: 'Transaction confirmed, processing', 
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30'
        };
      case 'sending':
        return { 
          icon: <Clock size={20} className="text-blue-400" />, 
          text: 'Processing payment', 
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30'
        };
      case 'partially_paid':
        return { 
          icon: <AlertTriangle size={20} className="text-amber-400" />, 
          text: 'Partially paid, please send the remaining amount', 
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30'
        };
      case 'finished':
        return { 
          icon: <CheckCircle size={20} className="text-emerald-400" />, 
          text: 'Payment completed successfully', 
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30'
        };
      case 'failed':
        return { 
          icon: <AlertTriangle size={20} className="text-red-400" />, 
          text: 'Payment failed', 
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30'
        };
      case 'expired':
        return { 
          icon: <AlertTriangle size={20} className="text-red-400" />, 
          text: 'Payment expired', 
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30'
        };
      default:
        return { 
          icon: <Clock size={20} className="text-slate-400" />, 
          text: 'Unknown status', 
          color: 'text-slate-400',
          bg: 'bg-slate-500/10',
          border: 'border-slate-500/30'
        };
    }
  };

  return (
    <div className="space-y-6">
      {!paymentData ? (
        <>
          {!initialAmount && <div>
            <label className="block text-sm text-slate-400 mb-2">Amount (USD)</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount in USD"
                className="w-full app-input pl-10 pr-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                min="1"
                step="1"
              />
              <DollarSign size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            </div>
          </div>}

          {!fixedPayCurrency && <div>
            <label className="block text-sm text-slate-400 mb-2">Pay With</label>
            <select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
              className="w-full app-input px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all custom-select"
            >
              {availableCurrencies.map((currency) => (
                <option key={currency.symbol} value={currency.symbol}>
                  {currency.name} ({currency.symbol})
                </option>
              ))}
            </select>
          </div>}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          <button
            onClick={handleCreatePayment}
            disabled={loading || !amount}
            className="w-full app-action-primary disabled:from-slate-700 disabled:to-slate-800 text-white py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              buttonLabel
            )}
          </button>
        </>
      ) : (
        <div className="space-y-6">
          {/* Status Display */}
          {paymentStatus && (
            <div className={`${getStatusDisplay().bg} ${getStatusDisplay().border} border rounded-xl p-4 flex items-center gap-3`}>
              {getStatusDisplay().icon}
              <span className={getStatusDisplay().color}>{getStatusDisplay().text}</span>
            </div>
          )}

          {/* Payment Information */}
          <div className="app-surface-muted rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Payment Details</h3>
            
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-400 mb-1">Amount to Send</div>
                <div className="text-xl font-bold text-white">{paymentData.pay_amount} {paymentData.pay_currency}</div>
                <div className="text-xs text-slate-400">≈ ${amount} USD</div>
              </div>
              
              <div>
                <div className="text-sm text-slate-400 mb-1">Payment Address</div>
                <div className="flex items-center gap-2">
                  <div className="bg-slate-800 p-3 rounded-lg text-white font-mono text-sm break-all flex-1">
                    {paymentData.pay_address}
                  </div>
                  <button
                    onClick={() => copyToClipboard(paymentData.pay_address)}
                    className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition-colors"
                  >
                    {copied ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} className="text-slate-300" />}
                  </button>
                </div>
              </div>
              
              {/* QR Code */}
              {qrCodeUrl && (
                <div className="flex justify-center py-4">
                  <div className="bg-white p-4 rounded-lg">
                    <img src={qrCodeUrl} alt="Payment QR Code" className="w-48 h-48" />
                  </div>
                </div>
              )}
              
              <div className="text-sm text-slate-400 text-center">
                <p>Scan the QR code or copy the address to complete your payment.</p>
                <p className="mt-1">Payment ID: {paymentData.payment_id}</p>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                setPaymentData(null);
                setQrCodeUrl(null);
                setPaymentStatus(null);
                if (statusPolling) {
                  clearInterval(statusPolling);
                  setStatusPolling(null);
                }
              }}
              className="flex-1 app-action-soft text-white py-3 rounded-xl font-medium transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={() => checkPaymentStatus(paymentData.payment_id)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} />
              Refresh Status
            </button>
          </div>
          
          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-400">
            <p className="font-medium mb-2">Important Information</p>
            <ul className="space-y-1 list-disc pl-5">
              <li>Send exactly {paymentData.pay_amount} {paymentData.pay_currency} to the address above.</li>
              <li>The payment will be automatically processed once confirmed on the blockchain.</li>
              <li>This may take 10-60 minutes depending on network congestion.</li>
              <li>Do not close this window until the payment is confirmed.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default NowPaymentsDeposit;
