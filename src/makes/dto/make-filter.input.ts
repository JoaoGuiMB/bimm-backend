import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

@InputType({
  description: 'Conditions a make must meet. All set fields must match.',
})
export class MakeFilterInput {
  @Field(() => String, {
    nullable: true,
    description: 'Case-insensitive start of the make name, e.g. "aston".',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  namePrefix?: string | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Only makes that produce this vehicle type id.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  vehicleTypeId?: number | null;
}
