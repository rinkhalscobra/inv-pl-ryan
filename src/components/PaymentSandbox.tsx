import React, { useState, useEffect } from 'react';
import { CreditCard, Send, CheckCircle, XCircle, Clock, Copy, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const SANDBOX_API_KEY = 'sandbox_evekAlmRh16puingi5kxe3Xbmp6k7nUF8hSlPunB67f386a0';
const SANDBOX_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-gateway-sandbox`;

async function getAuthHeaders() {
  const { data: { session }, error } = await supabase.auth.getSession();
  console.log('Session check:', { hasSession: !!session, error });
  if (!session) {
    throw new Error('No active session - please log in');
  }
  console.log('Token exists:', session.access_token ? 'yes' : 'no');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'X-API-Key': SANDBOX_API_KEY,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

interface Transaction {
  transaction_uuid: string;
  reference_no: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  card_number_masked?: string;
  created_at: string;
  error_message?: string;
}

interface WebhookLog {
  id: string;
  webhook_url: string;
  payload: any;
  signature: string;
  response_status: number;
  delivered: boolean;
  created_at: string;
}

export default function PaymentSandbox() {
  const [activeTab, setActiveTab] = useState<'initiate' | 'payment' | 'status' | 'cards' | 'transactions' | 'webhooks'>('initiate');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [allowedCards, setAllowedCards] = useState<any[]>([]);

  const [initiateForm, setInitiateForm] = useState({
    amount: 5000,
    currency: 'USD',
    referenceNo: `ORD-${Date.now()}`,
    returnUrl: 'https://example.com/payment/callback',
    email: 'customer@example.com',
    billingFirstName: 'John',
    billingLastName: 'Doe',
    billingAddress1: '123 Main Street',
    billingAddress2: '',
    billingCity: 'New York',
    billingState: 'NY',
    billingPostcode: '10001',
    billingCountry: 'US',
    billingPhone: '+1-555-123-4567',
  });

  const [paymentForm, setPaymentForm] = useState({
    number: '4012888888881881',
    expiryMonth: 12,
    expiryYear: 2025,
    cvv: '123',
    referenceNo: `REF-${Date.now()}`,
    returnUrl: 'https://example.com/return',
    amount: 5000,
    currency: 'USD',
    email: 'customer@example.com',
    ip: '192.0.2.1',
    billingFirstName: 'John',
    billingLastName: 'Doe',
    billingAddress1: '123 Main Street',
    billingCity: 'New York',
    billingState: 'NY',
    billingPostcode: '10001',
    billingCountry: 'US',
    billingPhone: '+1-555-123-4567',
  });

  const [statusUuid, setStatusUuid] = useState('');
  const [cardForm, setCardForm] = useState({
    first_six: '',
    last_four: '',
  });

  useEffect(() => {
    fetchTransactions();
    fetchWebhookLogs();
    fetchAllowedCards();
  }, []);

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from('sandbox_payment_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setTransactions(data);
    }
  };

  const fetchWebhookLogs = async () => {
    const { data, error } = await supabase
      .from('sandbox_webhook_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setWebhookLogs(data);
    }
  };

  const fetchAllowedCards = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${SANDBOX_API_URL}/v1/allowed-cards`, {
        headers,
      });
      const data = await res.json();
      setAllowedCards(data);
    } catch (err) {
      console.error('Error fetching allowed cards:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleInitiate = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${SANDBOX_API_URL}/v1/initiate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(initiateForm),
      });

      const data = await res.json();
      setResponse(data);
      await fetchTransactions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${SANDBOX_API_URL}/v1/payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify(paymentForm),
      });

      const data = await res.json();
      setResponse(data);
      await fetchTransactions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${SANDBOX_API_URL}/v1/payment/status`, {
        method: 'GET',
        headers,
        body: JSON.stringify({ uuid: statusUuid }),
      });

      const data = await res.json();
      setResponse(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${SANDBOX_API_URL}/v1/allowed-cards`, {
        method: 'POST',
        headers,
        body: JSON.stringify(cardForm),
      });

      const data = await res.json();
      setResponse(data);
      await fetchAllowedCards();
      setCardForm({ first_six: '', last_four: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (first_six: string, last_four: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${SANDBOX_API_URL}/v1/allowed-cards`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ first_six, last_four }),
      });
      await fetchAllowedCards();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'DECLINED':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'PENDING':
      case 'WAITING':
        return <Clock className="w-5 h-5 text-yellow-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen app-page-bg text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <span className="app-icon-tile flex h-11 w-11 items-center justify-center rounded-xl">
              <CreditCard className="w-6 h-6" />
            </span>
            Payment Gateway Sandbox
          </h1>
          <p className="text-slate-400">Test the GaliaPay payment API in a safe sandbox environment</p>
        </div>

        <div className="app-surface-primary rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-1">Sandbox API Key</p>
              <code className="text-sm font-mono text-emerald-400">{SANDBOX_API_KEY}</code>
            </div>
            <button
              onClick={() => copyToClipboard(SANDBOX_API_KEY)}
              className="p-2 app-action-soft rounded-lg transition-colors"
            >
              {copiedKey ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Base URL: {SANDBOX_API_URL}</p>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {['initiate', 'payment', 'status', 'cards', 'transactions', 'webhooks'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'app-action-primary text-white'
                  : 'app-action-soft text-slate-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="app-surface-primary rounded-xl p-6">
            {activeTab === 'initiate' && (
              <div>
                <h2 className="text-xl font-bold mb-4">POST /v1/initiate</h2>
                <p className="text-sm text-slate-400 mb-4">Initialize a hosted payment checkout</p>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1">Amount (cents)</label>
                      <input
                        type="number"
                        value={initiateForm.amount}
                        onChange={(e) => setInitiateForm({ ...initiateForm, amount: parseInt(e.target.value) })}
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Currency</label>
                      <input
                        type="text"
                        value={initiateForm.currency}
                        onChange={(e) => setInitiateForm({ ...initiateForm, currency: e.target.value })}
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Reference No</label>
                    <input
                      type="text"
                      value={initiateForm.referenceNo}
                      onChange={(e) => setInitiateForm({ ...initiateForm, referenceNo: e.target.value })}
                      className="w-full app-input rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Return URL</label>
                    <input
                      type="text"
                      value={initiateForm.returnUrl}
                      onChange={(e) => setInitiateForm({ ...initiateForm, returnUrl: e.target.value })}
                      className="w-full app-input rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Customer Email</label>
                    <input
                      type="email"
                      value={initiateForm.email}
                      onChange={(e) => setInitiateForm({ ...initiateForm, email: e.target.value })}
                      className="w-full app-input rounded px-3 py-2"
                    />
                  </div>

                  <button
                    onClick={handleInitiate}
                    disabled={loading}
                    className="w-full app-action-primary disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    {loading ? 'Processing...' : 'Initiate Payment'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'payment' && (
              <div>
                <h2 className="text-xl font-bold mb-4">POST /v1/payment</h2>
                <p className="text-sm text-slate-400 mb-4">Process a direct card payment</p>

                <div className="space-y-4">
                  <div className="app-surface-muted rounded-lg p-3 mb-4 border border-sky-500/25">
                    <p className="text-xs font-medium text-blue-400 mb-2">Test Cards:</p>
                    <p className="text-xs text-slate-300">4012888888881881 - Success</p>
                    <p className="text-xs text-slate-300">4000000000000002 - Declined</p>
                    <p className="text-xs text-slate-300">4000000000003220 - 3DS Required</p>
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Card Number</label>
                    <input
                      type="text"
                      value={paymentForm.number}
                      onChange={(e) => setPaymentForm({ ...paymentForm, number: e.target.value })}
                      className="w-full app-input rounded px-3 py-2"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm mb-1">Month</label>
                      <input
                        type="number"
                        value={paymentForm.expiryMonth}
                        onChange={(e) => setPaymentForm({ ...paymentForm, expiryMonth: parseInt(e.target.value) })}
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Year</label>
                      <input
                        type="number"
                        value={paymentForm.expiryYear}
                        onChange={(e) => setPaymentForm({ ...paymentForm, expiryYear: parseInt(e.target.value) })}
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">CVV</label>
                      <input
                        type="text"
                        value={paymentForm.cvv}
                        onChange={(e) => setPaymentForm({ ...paymentForm, cvv: e.target.value })}
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1">Amount (cents)</label>
                      <input
                        type="number"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseInt(e.target.value) })}
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Currency</label>
                      <input
                        type="text"
                        value={paymentForm.currency}
                        onChange={(e) => setPaymentForm({ ...paymentForm, currency: e.target.value })}
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handlePayment}
                    disabled={loading}
                    className="w-full app-action-primary disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-5 h-5" />
                    {loading ? 'Processing...' : 'Process Payment'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'status' && (
              <div>
                <h2 className="text-xl font-bold mb-4">GET /v1/payment/status</h2>
                <p className="text-sm text-slate-400 mb-4">Check transaction status by UUID</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm mb-1">Transaction UUID</label>
                    <input
                      type="text"
                      value={statusUuid}
                      onChange={(e) => setStatusUuid(e.target.value)}
                      placeholder="Enter transaction UUID"
                      className="w-full app-input rounded px-3 py-2"
                    />
                  </div>

                  <button
                    onClick={handleCheckStatus}
                    disabled={loading || !statusUuid}
                    className="w-full app-action-primary disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    {loading ? 'Checking...' : 'Check Status'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'cards' && (
              <div>
                <h2 className="text-xl font-bold mb-4">Allowed Cards Management</h2>
                <p className="text-sm text-slate-400 mb-4">Manage card whitelist</p>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1">First 6 Digits</label>
                      <input
                        type="text"
                        value={cardForm.first_six}
                        onChange={(e) => setCardForm({ ...cardForm, first_six: e.target.value })}
                        maxLength={6}
                        placeholder="401288"
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Last 4 Digits</label>
                      <input
                        type="text"
                        value={cardForm.last_four}
                        onChange={(e) => setCardForm({ ...cardForm, last_four: e.target.value })}
                        maxLength={4}
                        placeholder="1881"
                        className="w-full app-input rounded px-3 py-2"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddCard}
                    disabled={loading || !cardForm.first_six || !cardForm.last_four}
                    className="w-full app-action-primary disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    Add Allowed Card
                  </button>

                  <div className="mt-6">
                    <h3 className="text-sm font-medium mb-2">Allowed Cards</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {allowedCards.map((card, idx) => (
                        <div key={idx} className="flex items-center justify-between app-surface-muted rounded p-3">
                          <span className="font-mono text-sm">{card.first_six}******{card.last_four}</span>
                          <button
                            onClick={() => handleDeleteCard(card.first_six, card.last_four)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                      {allowedCards.length === 0 && (
                        <p className="text-slate-500 text-sm text-center py-4">No allowed cards</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div>
                <h2 className="text-xl font-bold mb-4">Recent Transactions</h2>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {transactions.map((tx) => (
                    <div key={tx.transaction_uuid} className="app-surface-muted rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(tx.status)}
                          <span className="font-medium">{tx.status}</span>
                        </div>
                        <span className="text-sm text-slate-400">
                          {tx.amount / 100} {tx.currency}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-1">UUID: {tx.transaction_uuid}</p>
                      <p className="text-xs text-slate-400 mb-1">Ref: {tx.reference_no}</p>
                      {tx.card_number_masked && (
                        <p className="text-xs text-slate-400 mb-1">Card: {tx.card_number_masked}</p>
                      )}
                      {tx.error_message && (
                        <p className="text-xs text-red-400 mt-2">{tx.error_message}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <p className="text-slate-500 text-center py-8">No transactions yet</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'webhooks' && (
              <div>
                <h2 className="text-xl font-bold mb-4">Webhook Logs</h2>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {webhookLogs.map((log) => (
                    <div key={log.id} className="app-surface-muted rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {log.delivered ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span className="text-sm font-medium">
                            {log.delivered ? 'Delivered' : 'Failed'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          Status: {log.response_status || 'N/A'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-1">URL: {log.webhook_url}</p>
                      <p className="text-xs text-slate-400 mb-1">Signature: {log.signature.substring(0, 32)}...</p>
                      <p className="text-xs text-slate-500 mt-2">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {webhookLogs.length === 0 && (
                    <p className="text-slate-500 text-center py-8">No webhook logs yet</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="app-surface-primary rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Response</h2>

            {error && (
              <div className="app-status-danger rounded-lg p-4 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {response && (
              <div className="app-surface-muted rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-emerald-400">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            )}

            {!response && !error && (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500">Make a request to see the response</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

