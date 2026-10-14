import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MakesReader } from './contracts/makes.reader.js';
import { MakesWriter } from './contracts/makes.writer.js';
import { MongoMakesRepository } from './repositories/mongo-makes.repository.js';
import { Make, MakeSchema } from './schemas/make.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Make.name, schema: MakeSchema }]),
  ],
  providers: [
    MongoMakesRepository,
    { provide: MakesReader, useExisting: MongoMakesRepository },
    { provide: MakesWriter, useExisting: MongoMakesRepository },
  ],
  exports: [MakesReader, MakesWriter],
})
export class MakesModule {}
