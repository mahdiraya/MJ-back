import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['regular', 'special'])
  customer_type: 'regular' | 'special';

  @IsString()
  @IsOptional()
  contact_info?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
