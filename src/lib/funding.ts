export type DepositMethod = 'btc' | 'crypto' | 'bank';
export type DepositCurrency = 'EUR' | 'USD' | 'BTC';
export type PaymentDetails = Record<string, string>;

export interface PaymentInstructions {
  id?: string;
  method: DepositMethod;
  details: PaymentDetails;
}

export interface FundingRequest {
  id: string;
  type: string;
  amount: number;
  currency: DepositCurrency;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  description: string;
  deposit_details?: { method?: DepositMethod; instructions?: PaymentDetails };
  withdrawal_details?: Record<string, unknown>;
}

export const depositMethodLabels: Record<DepositMethod, string> = {
  btc: 'Bitcoin (BTC)', crypto: 'Crypto', bank: 'Bank transfer',
};

export const instructionFields: Record<DepositMethod, Array<{ key: string; label: string }>> = {
  btc: [{ key: 'wallet_address', label: 'BTC wallet address' }, { key: 'network', label: 'Network' }],
  crypto: [{ key: 'asset', label: 'Payment asset (e.g. USDT)' }, { key: 'network', label: 'Network (e.g. TRC20)' }, { key: 'wallet_address', label: 'Wallet address' }, { key: 'memo', label: 'Memo / destination tag' }],
  bank: [{ key: 'bank_name', label: 'Bank name' }, { key: 'beneficiary_name', label: 'Beneficiary name' }, { key: 'iban', label: 'IBAN' }, { key: 'account_number', label: 'Account number' }, { key: 'swift_code', label: 'SWIFT / BIC' }, { key: 'routing_number', label: 'Routing number' }, { key: 'currency', label: 'Transfer currency' }, { key: 'reference', label: 'Payment reference' }],
};

export function formatFundingAmount(amount: number, currency: string) {
  return currency === 'BTC' ? `${Number(amount).toFixed(8)} BTC`
    : new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(Number(amount));
}

export function fundingStatusLabel(request: Pick<FundingRequest, 'status' | 'type'>) {
  return request.status === 'pending' ? 'Pending review'
    : request.status === 'failed' ? 'Rejected'
      : request.type === 'withdrawal' ? 'Approved' : 'Completed';
}
