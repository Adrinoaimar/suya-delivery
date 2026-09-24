import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type {
  CreateDeveloperRiderInput,
  DeveloperRiderAccountResult,
  DeveloperRiderAccountService,
  ResetDeveloperRiderPasswordInput,
} from './types';

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('La gestión de cuentas rider requiere Supabase configurado.');
  return supabase;
}

async function readableError(error: unknown): Promise<Error> {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; context?: unknown };
    if (value.context instanceof Response) {
      try {
        const payload = (await value.context.clone().json()) as { error?: unknown };
        if (typeof payload.error === 'string') return new Error(payload.error);
      } catch {
        // Supabase may return a non-JSON edge error; use its general message below.
      }
    }
    if (typeof value.message === 'string' && value.message !== 'Edge Function returned a non-2xx status code') {
      return new Error(value.message);
    }
  }
  return new Error('No se pudo completar la operación de cuenta rider. Revisa la sesión y vuelve a intentar.');
}

function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new Error('La clave debe tener entre 12 y 128 caracteres.');
  }
}

export class SupabaseDeveloperRiderAccountService implements DeveloperRiderAccountService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async create(input: CreateDeveloperRiderInput): Promise<DeveloperRiderAccountResult> {
    validatePassword(input.password);
    const { data, error } = await this.client.functions.invoke('manage-rider-accounts', {
      body: {
        action: 'create',
        ...input,
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
      },
    });
    if (error) throw await readableError(error);
    if (data?.ok !== true || typeof data.riderId !== 'string' || typeof data.email !== 'string') {
      throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudo crear la cuenta rider.');
    }
    return {
      riderId: data.riderId,
      email: data.email,
      displayName: typeof data.displayName === 'string' ? data.displayName : input.displayName.trim(),
    };
  }

  async resetPassword(input: ResetDeveloperRiderPasswordInput): Promise<{ email: string }> {
    validatePassword(input.password);
    const { data, error } = await this.client.functions.invoke('manage-rider-accounts', {
      body: { action: 'reset_password', ...input },
    });
    if (error) throw await readableError(error);
    if (data?.ok !== true || typeof data.email !== 'string') {
      throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudo restablecer la clave.');
    }
    return { email: data.email };
  }
}
