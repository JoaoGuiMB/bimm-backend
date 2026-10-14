import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MakesReader } from './contracts/makes.reader.js';
import { MakesWriter } from './contracts/makes.writer.js';
import { MongoMakesRepository } from './repositories/mongo-makes.repository.js';
import { MakesResolver } from './resolvers/makes.resolver.js';
import { Make, MakeSchema } from './schemas/make.schema.js';
import { MakesService } from './services/makes.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Make.name, schema: MakeSchema }]),
  ],
  providers: [
    MongoMakesRepository,
    MakesService,
    MakesResolver,
    { provide: MakesReader, useExisting: MongoMakesRepository },
    { provide: MakesWriter, useExisting: MongoMakesRepository },
  ],
  exports: [MakesReader, MakesWriter],
})
export class MakesModule {}
