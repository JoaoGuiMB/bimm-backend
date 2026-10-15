import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class VehicleTypeSubdocument {
  @Prop({ required: true })
  typeId: number;

  @Prop({ required: true })
  typeName: string;
}

const VehicleTypeSubdocumentSchema = SchemaFactory.createForClass(
  VehicleTypeSubdocument,
);

@Schema({ collection: 'makes', timestamps: true })
export class Make {
  @Prop({ required: true, unique: true })
  makeId: number;

  @Prop({ required: true, index: true })
  makeName: string;

  @Prop({ type: [VehicleTypeSubdocumentSchema], default: [] })
  vehicleTypes: VehicleTypeSubdocument[];

  @Prop({ required: true })
  lastIngestedAt: Date;
}

export type MakeDocument = HydratedDocument<Make>;

export const MakeSchema = SchemaFactory.createForClass(Make);
MakeSchema.index({ 'vehicleTypes.typeId': 1, makeId: 1 });
