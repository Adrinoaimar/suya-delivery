export type MobileQaEnvironment = {
  VITE_BACKEND?: string;
  VITE_SUPABASE_URL?: string;
  VITE_EXPECTED_SUPABASE_PROJECT_REF?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_CULQI_GATEWAY_ENABLED?: string;
  VITE_ROUTING_URL?: string;
  VITE_CUSTOMER_APP_URL?: string;
  VITE_RIDER_APP_URL?: string;
  VITE_BACKOFFICE_APP_URL?: string;
  VITE_LIVE_UPDATE_BASE_URL?: string;
};

export function inspectMobileQaEnv(env: MobileQaEnvironment): string[];
