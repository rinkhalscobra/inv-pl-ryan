const selectedCompanyKey = 'atlas-crm-company-id';

export const getSelectedCrmCompanyId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(selectedCompanyKey);
};

export const setSelectedCrmCompanyId = (companyId: string): void => {
  window.localStorage.setItem(selectedCompanyKey, companyId);
  window.dispatchEvent(new CustomEvent('crm-company-change', { detail: companyId }));
};

export interface CrmCompany {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  registration_key: string;
  registration_path: string;
  user_count: number;
  lead_count: number;
  office_count: number;
}
