export interface LeadInput {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  country: string;
  office: string;
  campaign: string;
  notes: string;
  external_id: string;
}

const text = (value: unknown, limit: number) => String(value ?? '').trim().slice(0, limit);

export function normalizeLead(value: Record<string, unknown>): LeadInput | null {
  const email = text(value.email ?? value.email_address ?? value.emailAddress, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const fullName = text(value.full_name ?? value.fullName ?? value.name, 200);
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = text(value.first_name ?? value.firstName, 100) || parts[0] || '';
  const lastName = text(value.last_name ?? value.lastName, 100) || parts.slice(1).join(' ').slice(0, 100);
  return {
    email,
    first_name: firstName,
    last_name: lastName,
    phone: text(value.phone ?? value.phone_number ?? value.phoneNumber, 60),
    country: text(value.country, 100),
    office: text(value.office ?? value.office_code ?? value.officeCode ?? value.team, 100),
    campaign: text(value.campaign, 120),
    notes: text(value.notes ?? value.note, 2000),
    external_id: text(value.external_id ?? value.externalId ?? value.lead_id ?? value.leadId, 120),
  };
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && cell.length > 0) cell += char;
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV file contains an unfinished quoted field.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

const headerName = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fieldForHeader = (value: unknown): keyof LeadInput | 'full_name' | null => {
  const name = headerName(value);
  if (['email', 'emailaddress', 'emailid', 'mail'].includes(name)) return 'email';
  if (['firstname', 'givenname', 'forename'].includes(name)) return 'first_name';
  if (['lastname', 'surname', 'familyname'].includes(name)) return 'last_name';
  if (['fullname', 'name', 'leadname'].includes(name)) return 'full_name';
  if (['phone', 'phonenumber', 'mobile', 'mobilenumber', 'telephone', 'tel'].includes(name)) return 'phone';
  if (['country', 'countrycode'].includes(name)) return 'country';
  if (['office', 'officecode', 'team', 'teamcode'].includes(name)) return 'office';
  if (['campaign', 'campaignname'].includes(name)) return 'campaign';
  if (['notes', 'note', 'comments', 'comment'].includes(name)) return 'notes';
  if (['externalid', 'leadid', 'id'].includes(name)) return 'external_id';
  return null;
};

export function rowsToLeads(rows: unknown[][]): { leads: LeadInput[]; invalid: number } {
  if (rows.length === 0) return { leads: [], invalid: 0 };
  const fields = rows[0].map(fieldForHeader);
  if (!fields.includes('email')) throw new Error('Add an Email column to the spreadsheet.');
  const leads: LeadInput[] = [];
  let invalid = 0;
  for (const row of rows.slice(1)) {
    if (!row.some(value => String(value ?? '').trim())) continue;
    const values: Record<string, unknown> = {};
    fields.forEach((field, index) => { if (field) values[field] = row[index]; });
    const lead = normalizeLead(values);
    if (lead) leads.push(lead);
    else invalid++;
  }
  return { leads, invalid };
}
