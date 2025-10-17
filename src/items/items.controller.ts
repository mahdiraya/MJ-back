import {
  Controller,
  UseGuards,
  Delete,
  Param,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { BaseController } from '../base/base.controller';
import { Item } from '../entities/item.entity';
import { CreateItemDto } from './create-item.dto';
import { UpdateItemDto } from './update-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { Express } from 'express';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('items')
export class ItemsController extends BaseController<
  Item,
  CreateItemDto,
  UpdateItemDto
> {
  constructor(private readonly itemsService: ItemsService) {
    super(itemsService);
  }

  /** Upload/replace an item's photo */
  @Roles('manager', 'admin')
  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'items');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const id = req.params?.id ?? 'unknown';
          const stamp = Date.now();
          const ext = (extname(file.originalname) || '.jpg').toLowerCase();
          cb(null, `item-${id}-${stamp}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        // allow common raster formats
        const ok = /^image\/(png|jpe?g|webp|gif|bmp)$/.test(file.mimetype);
        cb(ok ? null : new Error('Only image files are allowed'), ok);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    // Served by your static middleware at /uploads/**
    const relUrl = `/uploads/items/${file.filename}`;

    // Use your ItemsService helper that writes to `photoUrl`
    const updated = await this.itemsService.setPhotoUrl(id, relUrl);

    // Return the updated item (best DX for the frontend)
    return updated;

    // If you prefer to return just the URL instead:
    // return { photoUrl: updated?.photoUrl ?? relUrl };
  }

  // Only manager/admin can delete items
  @Roles('manager', 'admin')
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}
