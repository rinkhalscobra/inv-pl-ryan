import { useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    referralCode?: string,
    firstName?: string,
    lastName?: string,
    country?: string,
    phoneNumber?: string,
    companyKey?: string,
    registrationCode?: string,
  ) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            referral_code: referralCode || null,
            first_name: firstName || null,
            last_name: lastName || null,
            country: country || null,
            phone_number: phoneNumber || null,
            onboarding_source: 'website_signup',
            crm_company_key: companyKey || null,
            crm_registration_code: registrationCode?.trim().toUpperCase() || null,
          },
        },
      });

      if (data.user && data.session && !error) {
        const { data: onboardingData, error: onboardingError } = await supabase.rpc('ensure_my_client_onboarding');
        const onboarding = onboardingData as { success?: boolean; error?: string } | null;
        if (onboardingError || onboarding?.success !== true) {
          return {
            data,
            error: new Error(onboardingError?.message || onboarding?.error || 'Client account setup did not complete'),
          };
        }
      }

      return { data, error };
    } catch (error) {
      console.error('Error during sign up:', error);
      return {
        data: { user: null, session: null },
        error: new Error('An error occurred during sign up'),
      };
    }
  };

  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // A password change can invalidate the remote refresh token before the UI
      // has cleared it. Local sign-out still removes that stale browser session.
      await supabase.auth.signOut({ scope: 'local' });
    }
  };

  const updatePassword = (newPassword: string) =>
    supabase.auth.updateUser({ password: newPassword });

  const resetPasswordForEmail = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      return { error: null };
    } catch (error: unknown) {
      console.error('Error sending password reset email:', error);
      return { error: error instanceof Error ? error : new Error('Could not send the password reset email') };
    }
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updatePassword,
    resetPasswordForEmail,
  };
};
