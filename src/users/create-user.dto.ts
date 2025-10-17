import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password_hash: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['cashier', 'manager', 'admin'])
  role: 'cashier' | 'manager' | 'admin';
}
