export interface JwtPayload {
    sub: string;
    tenantId: string;
    workerId: string;
    role: string;
}
export interface RequestUser {
    userId: string;
    workerId: string;
    tenantId: string;
    role: string;
}
