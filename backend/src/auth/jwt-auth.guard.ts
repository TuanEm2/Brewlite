import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AuthenticatedUser {
  id: number;
  email: string;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

interface JwtTokenPayload {
  sub: number | string;
  email: string;
  exp?: number;
  iat?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Vui lòng đăng nhập để tiếp tục.');
    }

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
      throw new UnauthorizedException(
        'Token xác thực không đúng định dạng. Yêu cầu: Bearer <token>.',
      );
    }

    const token = parts[1];

    let payload: JwtTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtTokenPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn hoặc token không hợp lệ.',
      );
    }

    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new UnauthorizedException('Token không hợp lệ: mã người dùng sai.');
    }

    request.user = {
      id: userId,
      email: payload.email,
    };

    return true;
  }
}
