export const formatReferralCode = (code: string | null): string => {
  if (!code) return 'Loading...';

  return code.toUpperCase();
};
