import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ISystemParameterService } from '../services/contracts/isystem-parameter.service';
import { CreateSystemParameterRequest } from './dtos/create-system-parameter/create-system-parameter.request';
import { UpdateSystemParameterRequest } from './dtos/update-system-parameter/update-system-parameter.request';
import { GetSystemParameterResponse } from './dtos/get-system-parameter/get-system-parameter.response';
import { BadRequestException, NotFoundException } from '@nestjs/common';

@ApiTags('System Parameters')
@Controller('system-parameters')
export class SystemParameterController {
  constructor(
    @Inject('ISystemParameterService')
    private readonly systemParameterService: ISystemParameterService
  ) {}

  @AdminAuth(null, GetSystemParameterResponse)
  @ApiOperation({
    summary: 'Get all system parameters',
    description: 'This endpoint returns all active system parameters. Only for administrator use.'
  })
  @HttpCode(200)
  @Get()
  async getAllParameters(): Promise<GetSystemParameterResponse[]> {
    const parameters = await this.systemParameterService.getAllParameters();
    return parameters.map(param => new GetSystemParameterResponse(param));
  }

  @AdminAuth(null, GetSystemParameterResponse)
  @ApiOperation({
    summary: 'Get system parameter by key',
    description: 'This endpoint returns a system parameter by its key. Only for administrator use.'
  })
  @HttpCode(200)
  @Get(':key')
  async getParameterByKey(@Param('key') key: string): Promise<GetSystemParameterResponse> {
    const parameter = await this.systemParameterService.getParameter(key);
    if (!parameter) {
      throw new NotFoundException(`Parameter with key '${key}' not found`);
    }
    return new GetSystemParameterResponse(parameter);
  }

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Generar token de larga duración para APIs internas',
    description:
      'Genera o rota el token de APIs internas (header X-Internal-Token). Se devuelve solo en esta respuesta. Solo administrador.'
  })
  @HttpCode(201)
  @Post('internal-token/generate')
  async generateInternalToken(@User() userId: string): Promise<{ success: boolean; token: string; message: string }> {
    const { token } = await this.systemParameterService.generateInternalApiToken(userId);
    return {
      success: true,
      token,
      message:
        'Token generado. Guárdalo de forma segura; no se volverá a mostrar. Úsalo en header X-Internal-Token o Authorization: Bearer.'
    };
  }

  @AdminAuth(CreateSystemParameterRequest, GetSystemParameterResponse)
  @ApiOperation({
    summary: 'Create system parameter',
    description:
      'This endpoint creates a new system parameter. If the key already exists, it will be updated. Only for administrator use.'
  })
  @HttpCode(201)
  @Post()
  async createParameter(
    @Body() data: CreateSystemParameterRequest,
    @User() userId: string
  ): Promise<GetSystemParameterResponse> {
    try {
      const parameter = await this.systemParameterService.setParameter(
        data.key,
        data.value,
        data.description,
        data.type || 'string',
        userId
      );
      return new GetSystemParameterResponse(parameter);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Error creating parameter');
    }
  }

  @AdminAuth(UpdateSystemParameterRequest, GetSystemParameterResponse)
  @ApiOperation({
    summary: 'Update system parameter',
    description: 'This endpoint updates an existing system parameter by its key. Only for administrator use.'
  })
  @HttpCode(200)
  @Put(':key')
  async updateParameter(
    @Param('key') key: string,
    @Body() data: UpdateSystemParameterRequest,
    @User() userId: string
  ): Promise<GetSystemParameterResponse> {
    // Verificar que el parámetro existe
    const existing = await this.systemParameterService.getParameter(key);
    if (!existing) {
      throw new NotFoundException(`Parameter with key '${key}' not found`);
    }

    try {
      const parameter = await this.systemParameterService.setParameter(
        key,
        data.value || existing.value,
        data.description !== undefined ? data.description : (existing.description ?? undefined),
        data.type || existing.type,
        userId
      );
      return new GetSystemParameterResponse(parameter);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Error updating parameter');
    }
  }

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Delete system parameter',
    description: 'This endpoint soft deletes a system parameter by its key. Only for administrator use.'
  })
  @HttpCode(200)
  @Delete(':key')
  async deleteParameter(@Param('key') key: string, @User() userId: string): Promise<{ message: string }> {
    try {
      await this.systemParameterService.deleteParameter(key, userId);
      return { message: `Parameter '${key}' deleted successfully` };
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(error.message || 'Error deleting parameter');
    }
  }
}
