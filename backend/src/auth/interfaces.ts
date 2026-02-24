export interface JwtPayload {
  sub: string;
  tenantId: string;
  workerId: string;
  role: string;
}

export interface RequestUser {
  /** Auth-provider user ID (e.g. Supabase/Firebase uid). */
  userId: string;
  /** Worker record ID in the worker table — may differ from userId. */
  workerId: string;
  tenantId: string;
  role: string;
}
