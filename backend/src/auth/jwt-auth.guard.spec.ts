import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard (Unit)', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;
    guard = new JwtAuthGuard(jwtService);
  });

  function mockContext(authHeader?: string): {
    context: ExecutionContext;
    request: Record<string, unknown>;
  } {
    const request: Record<string, unknown> = {
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('chặn khi thiếu header Authorization (401)', async () => {
    const { context } = mockContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Vui lòng đăng nhập để tiếp tục.'),
    );
  });

  it('chặn khi sai cú pháp Bearer (401)', async () => {
    const { context } = mockContext('Basic abc123xyz');
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        'Token xác thực không đúng định dạng. Yêu cầu: Bearer <token>.',
      ),
    );
  });

  it('chặn khi chỉ có từ "Bearer" mà không có token (401)', async () => {
    const { context } = mockContext('Bearer   ');
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        'Token xác thực không đúng định dạng. Yêu cầu: Bearer <token>.',
      ),
    );
  });

  it('chặn khi token hết hạn hoặc sai chữ ký (401)', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context } = mockContext('Bearer expired-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn hoặc token không hợp lệ.',
      ),
    );
  });

  it('chặn khi sub không phải là số hợp lệ (401)', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'not-a-number',
      email: 'user@example.com',
    });
    const { context } = mockContext('Bearer invalid-sub-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Token không hợp lệ: mã người dùng sai.'),
    );
  });

  it('cho phép và gắn user vào request khi token hợp lệ', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 12,
      email: 'customer@brewlite.vn',
    });
    const { context, request } = mockContext('Bearer valid-jwt-token');

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 12,
      email: 'customer@brewlite.vn',
    });
  });
});
