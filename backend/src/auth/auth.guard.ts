import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './decorators';
import { JwtPayload, RequestUser } from './interfaces';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);
    const payload = this.verifyToken(token);

    const user: RequestUser = {
      userId: payload.sub,
      workerId: payload.workerId,
      tenantId: payload.tenantId,
      role: payload.role,
    };

    request.user = user;
    return true;
  }

  private verifyToken(token: string): JwtPayload {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET not configured');
    }

    try {
      const decoded = jwt.verify(token, secret) as jwt.JwtPayload & JwtPayload;
      const payload = decoded;
      if (!payload.sub || !payload.tenantId || !payload.workerId || !payload.role) {
        throw new Error('missing claims');
      }
      return payload as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
