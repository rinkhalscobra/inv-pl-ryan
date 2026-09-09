import { useState, useEffect } from 'react';
import { Bitcoin, Copy, Check, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabaseClient';

interface BTCDepositProps {
  userId: string;
  onSuccess?: () => void;
}

interface Deposit {
  id: string;
  txid: string;
  amount_display: number;
  confirmations: number;
  required_confirmations: number;
  status: string;
  credited: boolean;
  created_at: string;
}

export default function BTCDeposit({ userId, onSuccess }: BTCDepositProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  useEffect(() => {
    fetchExistingAddress();
    fetchPendingDeposits();

    const channel = supabase
      .channel('crypto-deposits')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crypto_deposits',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDeposits((prev) => [payload.new as Deposit, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Deposit;
            setDeposits((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d))
            );
            if (updated.credited && onSuccess) {
              onSuccess();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onSuccess]);

  const fetchExistingAddress = async () => {
    const { data } = await supabase
      .from('crypto_deposit_addresses')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'btc')
      .maybeSingle();

    if (data?.address) {
      setAddress(data.address);
      generateQRCode(data.address);
    }
  };

  const fetchPendingDeposits = async () => {
    const { data } = await supabase
      .from('crypto_deposits')
      .select('*')
      .eq('user_id', userId)
      .eq('chain', 'btc')
      .order('created_at', { ascending: false })
      .limit(5);

    if (data) {
      setDeposits(data);
    }
  };

  const generateQRCode = async (addr: string) => {
    try {
      const url = await QRCode.toDataURL(`bitcoin:${addr}`, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrCodeUrl(url);
    } catch (err) {
      console.error('QR code generation failed:', err);
    }
  };

  const getAddress = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session) {
        setError('Please sign in to continue');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crypto-address`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ chain: 'btc' }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get address');
      }

      setAddress(data.address);
      generateQRCode(data.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (deposit: Deposit) => {
    if (deposit.credited) return 'text-green-400';
    if (deposit.confirmations > 0) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const getStatusText = (deposit: Deposit) => {
    if (deposit.credited) return 'Credited';
    if (deposit.confirmations >= deposit.required_confirmations) return 'Confirming...';
    if (deposit.confirmations > 0) {
      return `${deposit.confirmations}/${deposit.required_confirmations} confirmations`;
    }
    return 'Waiting for confirmations...';
  };

  return (
    <div className="space-y-6">
      <div className="app-surface-primary rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/25 via-amber-500/18 to-yellow-500/15 flex items-center justify-center border border-orange-400/25">
            <Bitcoin className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Bitcoin Deposit</h3>
            <p className="text-sm text-gray-400">Send BTC to your personal address</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!address ? (
          <button
            onClick={getAddress}
            disabled={loading}
            className="w-full py-3 app-action-primary disabled:opacity-60 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Address...
              </>
            ) : (
              <>
                <Bitcoin className="w-5 h-5" />
                Get BTC Deposit Address
              </>
            )}
          </button>
        ) : (
          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl shadow-xl shadow-black/30">
                  <img src={qrCodeUrl} alt="BTC Address QR Code" className="w-48 h-48" />
                </div>
              </div>
            )}

            <div className="app-surface-muted rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2">Your BTC Address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-orange-400 break-all font-mono">
                  {address}
                </code>
                <button
                  onClick={copyAddress}
                  className="p-2 app-action-soft rounded-lg transition-colors"
                  title="Copy address"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">
                Only send BTC to this address. Sending other assets may result in permanent loss.
                Minimum deposit: 0.0001 BTC. Requires 3 confirmations.
              </p>
            </div>

            <button
              onClick={fetchPendingDeposits}
              className="w-full py-2 app-action-soft text-gray-300 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Status
            </button>
          </div>
        )}
      </div>

      {deposits.length > 0 && (
        <div className="app-surface-primary rounded-xl p-6">
          <h4 className="text-white font-medium mb-4">Recent Deposits</h4>
          <div className="space-y-3">
            {deposits.map((deposit) => (
              <div
                key={deposit.id}
                className="app-surface-muted rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium">
                      {deposit.amount_display.toFixed(8)} BTC
                    </span>
                    <span className={`text-xs ${getStatusColor(deposit)}`}>
                      {getStatusText(deposit)}
                    </span>
                  </div>
                  <a
                    href={`https://mempool.space/tx/${deposit.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1"
                  >
                    {deposit.txid.slice(0, 16)}...{deposit.txid.slice(-8)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="w-16">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        deposit.credited ? 'bg-green-500' : 'bg-orange-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          (deposit.confirmations / deposit.required_confirmations) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-1">
                    {Math.min(deposit.confirmations, deposit.required_confirmations)}/
                    {deposit.required_confirmations}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

