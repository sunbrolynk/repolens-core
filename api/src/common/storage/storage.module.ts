import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { StorageService } from './storage.service';

/**
 * StorageModule — provides StorageService for managing project artifact
 * directories in LOCAL_STORAGE mode. Imported by app.module, projects, and
 * repositories (see their *.module.ts).
 */
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
