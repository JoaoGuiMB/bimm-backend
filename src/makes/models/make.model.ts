import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('VehicleType', {
  description: 'A kind of vehicle a make produces, as classified by NHTSA.',
})
export class VehicleTypeModel {
  @Field(() => Int, { description: 'NHTSA vehicle type id.' })
  typeId: number;

  @Field({ description: 'Vehicle type name, e.g. "Passenger Car".' })
  typeName: string;
}

@ObjectType('Make', {
  description:
    'A vehicle make registered with NHTSA, with the vehicle types it produces.',
})
export class MakeModel {
  @Field(() => Int, { description: 'NHTSA make id.' })
  makeId: number;

  @Field({
    description:
      'Make name in upper case, as published by NHTSA, e.g. "ASTON MARTIN".',
  })
  makeName: string;

  @Field(() => [VehicleTypeModel], {
    description:
      'Vehicle types produced by this make. Empty when NHTSA lists none.',
  })
  vehicleTypes: VehicleTypeModel[];
}
