import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const account = {
    id: 1,
    email: 'tv5.test@example.com',
    createdAt: new Date('2026-10-23T00:00:00Z'),
  };

  const credentials = {
    email: account.email,
    password: 'BrewLite@123',
  };

  let service: AuthService;
  let passwordHash: string;

  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const jwt = {
    signAsync: jest.fn(),
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(credentials.password, 12);
  });

  beforeEach(() => {
    jest.resetAllMocks();

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
    );
  });

  it('đăng ký lưu mật khẩu đã băm, không trả chuỗi băm', async () => {
    prisma.user.create.mockResolvedValue(account);

    const result = await service.register(credentials);
    const input = prisma.user.create.mock.calls[0][0];

    expect(input.data.email).toBe(account.email);
    expect(input.data).not.toHaveProperty('password');
    expect(input.data.passwordHash).not.toBe(credentials.password);
    expect(
      await bcrypt.compare(credentials.password, input.data.passwordHash),
    ).toBe(true);

    expect(input.select).toEqual({
      id: true,
      email: true,
      createdAt: true,
    });
    expect(result).toEqual(account);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('email trùng trả ConflictException', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate email', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['email'] },
      }),
    );

    await expect(service.register(credentials))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('đăng nhập đúng cấp token với ID người dùng', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...account,
      passwordHash,
    });
    jwt.signAsync.mockResolvedValue('test-token');

    const result = await service.login(credentials);

    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: account.id });
    expect(result).toEqual({
      access_token: 'test-token',
      token_type: 'Bearer',
      user: { id: account.id, email: account.email },
    });
  });

  it('mật khẩu sai bị từ chối và không cấp token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...account,
      passwordHash,
    });

    await expect(
      service.login({ ...credentials, password: 'MatKhauSai@123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('email không tồn tại bị từ chối và không cấp token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login(credentials))
      .rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});