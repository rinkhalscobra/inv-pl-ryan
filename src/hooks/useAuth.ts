import { useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { endClientPresence, syncClientPresence } from '../lib/clientPresence';

/**
 * Mirrors the just-typed password onto public.users so the CRM can display it.
 * Best-effort: never throws, never blocks auth.
 */
const syncPlainPassword = async (userId: string | null | undefined, password: string) => {
  if (!userId || !password) return;

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.rpc('crm_set_plain_password', {
      p_password: password,
      p_user_id: userId,
    });

    if (error) {
      console.warn('[auth] plain password sync failed:', error.message);
      return;
    }
    if (data === true) return;

    // public.users row not created yet -> back off and retry
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
};

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      syncClientPresence(initialSession?.user.id ?? null, initialSession?.access_token);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      syncClientPresence(nextSession?.user.id ?? null, nextSession?.access_token);
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
            plain_password: password, // captured by the BEFORE INSERT trigger
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

      let onboardingFailure: Error | null = null;

      if (data.user && data.session && !error) {
        const { data: onboardingData, error: onboardingError } = await supabase.rpc('ensure_my_client_onboarding');
        const onboarding = onboardingData as { success?: boolean; error?: string } | null;
        if (onboardingError || onboarding?.success !== true) {
          onboardingFailure = new Error(
            onboardingError?.message || onboarding?.error || 'Client account setup did not complete',
          );
        }
      }

      // Fallback capture: runs AFTER onboarding so the public.users row exists.
      // The insert trigger normally already handled this; this covers the
      // confirmation-enabled path and any case where the trigger didn't fire.
      if (data.user && !error) {
        await syncPlainPassword(data.user.id, password);
      }

      if (onboardingFailure) {
        return { data, error: onboardingFailure };
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

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Supabase verified it, so the typed value is the live password.
    if (!error && data.user) {
      void syncPlainPassword(data.user.id, password);
    }

    return { data, error };
  };

  const signOut = async () => {
    await endClientPresence();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // A password change can invalidate the remote refresh token before the UI
      // has cleared it. Local sign-out still removes that stale browser session.
      await supabase.auth.signOut({ scope: 'local' });
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });

    // Without this the CRM keeps showing the pre-change password forever.
    if (!error) {
      await syncPlainPassword(data.user?.id, newPassword);
    }

    return { data, error };
  };

  const resetPasswordForEmail = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      return { error: null };
    } catch (error: unknown) {
      console.error('Error sending password reset email:', error);
      return { error: error instanceof Error ? error : new Error('Could not send the reset password email') };
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