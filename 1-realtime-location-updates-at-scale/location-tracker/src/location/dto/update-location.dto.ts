import { IsNotEmpty, IsNumber, IsString } from "class-validator"

export class UpdateLocationDto {
    @IsString()
    @IsNotEmpty()
    driverId!: string

    @IsNumber()
    lat!: number

    @IsNumber()
    lng!: number
}
