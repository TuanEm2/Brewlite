import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự.' })
  @IsByteLength(0, 72, {
    message: 'Mật khẩu không được vượt quá 72 byte.',
  })
  password!: string;
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu.' })
  @IsByteLength(0, 72, {
    message: 'Mật khẩu không được vượt quá 72 byte.',
  })
  password!: string;
}