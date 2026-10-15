import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'locks', versionKey: false })
export class Lock {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  owner: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const LockSchema = SchemaFactory.createForClass(Lock);
