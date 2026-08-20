export type AccessRole = 'customer' | 'rider' | 'restaurant_staff' | 'platform_admin';

export interface AuthIdentity {
  id: string;
  email: string;
  displayName: string;
  phone: string;
  defaultAddress: string;
  defaultReference: string;
  access: AccessRole[];
  restaurantIds: string[];
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpInput extends AuthCredentials {
  displayName: string;
}

export interface ProfileUpdate {
  displayName: string;
  phone: string;
  defaultAddress: string;
  defaultReference: string;
}

export interface AuthService {
  getIdentity(): Promise<AuthIdentity | null>;
  subscribe(listener: (identity: AuthIdentity | null) => void): () => void;
  signIn(credentials: AuthCredentials): Promise<AuthIdentity>;
  signUpCustomer(input: SignUpInput): Promise<{ requiresEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  updateProfile(input: ProfileUpdate): Promise<AuthIdentity>;
}
