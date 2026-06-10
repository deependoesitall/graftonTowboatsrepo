'use client';
// src/lib/auth-context.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface CustomerProfile {
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
}

interface SignUpDetails {
  firstName: string;
  lastName?: string;
  companyName?: string;
}

interface AuthContextType {
  user: User | null;
  profile: CustomerProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, details: SignUpDetails) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  async function loadProfile() {
    try {
      const { data } = await supabase
        .from('customer_profiles')
        .select('*')
        .maybeSingle();
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    // Hard safety net — never show spinner for more than 3 seconds
    const timeout = setTimeout(() => setLoading(false), 3000);

    // getSession reads local cookie — instant, no network round-trip
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile();
      }
      clearTimeout(timeout);
      setLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      setLoading(false);
    });

    // onAuthStateChange handles sign-in/out events after initial load
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile();
        } else {
          setProfile(null);
        }
        // Also clear loading if it fired before getSession resolved
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function signUp(email: string, password: string, details: SignUpDetails) {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        const contactName = [details.firstName, details.lastName].filter(Boolean).join(' ');
        await supabase.from('customer_profiles').upsert({
          user_id: data.user.id,
          first_name: details.firstName || null,
          last_name: details.lastName || null,
          company_name: details.companyName || null,
          contact_name: contactName || null,
        });
        await loadProfile();
      }
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'Sign up failed' };
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      await loadProfile();
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'Sign in failed' };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
