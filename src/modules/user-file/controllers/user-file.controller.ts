import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Post } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserFileRequest } from './dtos/create-user-file/create-user-file.request';
import { GetIdUserFileResponse } from './dtos/get-id-user-file/get-id-user-file.response';
import { UpdateUserFileRequest } from './dtos/update-user-file/update-user-file.request';
import { IUserFileService } from '../services/contracts/iuser-file.service';
import { FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { userFileFilters } from './const/user-file.filters';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';

@ApiTags('User File')
@ApiExcludeController()
@Controller({ path: 'user-file', version: '1' })
export class UserFileController {
  constructor(@Inject('IUserFileService') public _userFileService: IUserFileService) {}

  @UserAuth(CreateUserFileRequest, null)
  @ApiOperation({
    summary: 'Create user file',
    description: 'This endpoint is for create user file'
  })
  @HttpCode(201)
  @Post()
  async createUserFile(@Body() data: CreateUserFileRequest): Promise<void> {
    await this._userFileService.createUserFile(data);
  }

  @UserAuth(null, GetIdUserFileResponse)
  @ApiOperation({
    summary: 'Get user file by id',
    description: 'This endpoint is for get user file by id'
  })
  @HttpCode(200)
  @Get(':userUuid')
  async getUserFile(
    @Param('userUuid') userUuid: string,
    @FilterParams(userFileFilters) filters: IFiltersParams<typeof userFileFilters>
  ): Promise<GetIdUserFileResponse[]> {
    const user = await this._userFileService.getUserFile(userUuid, filters);
    return user.map(item => new GetIdUserFileResponse(item));
  }

  @UserAuth(UpdateUserFileRequest, null)
  @ApiOperation({
    summary: 'Update user file',
    description: 'This endpoint is for update user file'
  })
  @HttpCode(200)
  @Put(':userUuid')
  async updateUserFile(@Param('userUuid') userUuid: string, @Body() data: UpdateUserFileRequest): Promise<void> {
    await this._userFileService.updateUserFile(userUuid, data);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Delete user file',
    description: 'This endpoint is for delete user file'
  })
  @HttpCode(200)
  @Delete(':userUuid')
  async deleteUserFile(@Param('userUuid') userUuid: string): Promise<boolean> {
    return await this._userFileService.deleteUserFile(userUuid);
  }
}
