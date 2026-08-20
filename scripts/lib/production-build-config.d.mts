export type ProductionBuildEnvironment = {
  VITE_BACKEND?: string;
  VITE_MAP_PROVIDER?: string;
  VITE_SUPABASE_URL?: string;
  VITE_EXPECTED_SUPABASE_PROJECT_REF?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type ProductionBuildConfigResult = {
  actualProjectRef?: string;
  failures: string[];
  ok: boolean;
};

export function inspectProductionBuildConfig(
  env?: ProductionBuildEnvironment,
): ProductionBuildConfigResult;
export function assertProductionBuildConfig(
  env?: ProductionBuildEnvironment,
): ProductionBuildConfigResult;

