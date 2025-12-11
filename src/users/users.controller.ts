import {
  Controller,
  Post,
  Body,
  UseGuards,
  Delete,
  Param,
  Put,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { BaseController } from '../base/base.controller';
import { User } from '../entities/user.entity';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController extends BaseController<
  User,
  CreateUserDto,
  UpdateUserDto
> {
  constructor(private readonly usersService: UsersService) {
    // BaseController will now have a service with findAll/findOne/etc.
    super(usersService);
  }

  /** Admin registration endpoint (hashes password). */
  @Roles('admin')
  @Post('register')
  async register(
    @Body()
    body: {
      username: string;
      password: string;
      name: string;
      role: 'cashier' | 'manager' | 'admin';
    },
  ) {
    return this.usersService.createUser(body);
  }

  /** Admin create endpoint for POST /users (also hashes password). */
  @Roles('admin')
  @Post()
  override create(@Body() dto: CreateUserDto) {
    // Ensure dto has password; if your DTO uses 'password', this will hash it.
    return this.usersService.createUser(dto as any);
  }

  /** Admin update endpoint for PUT /users/:id (hash if password present). */
  @Roles('admin')
  @Put(':id')
  override async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, dto as any);
  }

  /** Only admin can delete users. */
  @Roles('admin')
  @Delete(':id')
  override delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}
