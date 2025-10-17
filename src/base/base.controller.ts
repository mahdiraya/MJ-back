// src/base/base.controller.ts
import { Body, Delete, Get, Param, Post, Put } from '@nestjs/common';

export class BaseController<T, CreateDto = any, UpdateDto = any> {
  constructor(protected readonly service: any) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.service.delete(id);
  }
}
