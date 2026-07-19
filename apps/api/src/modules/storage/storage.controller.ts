import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { RequirePermissions, TenantId } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

const FOLDERS = new Set(['logos', 'medicines', 'avatars']);

@ApiTags('Storage')
@ApiBearerAuth('access-token')
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('upload')
  @RequirePermissions(PERMISSIONS.MEDICINES_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload an image to S3-compatible storage' })
  upload(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder = 'medicines',
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!FOLDERS.has(folder)) {
      throw new BadRequestException('Invalid folder');
    }
    return this.storage.uploadImage(
      tenantId,
      file,
      folder as 'logos' | 'medicines' | 'avatars',
    );
  }
}
