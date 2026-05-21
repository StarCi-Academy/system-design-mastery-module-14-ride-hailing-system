import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator"

export class MatchRequestDto {
    @IsString()
    @IsNotEmpty()
    clientId!: string

    @IsNumber()
    lat!: number

    @IsNumber()
    lng!: number

    @IsOptional()
    @IsNumber()
    distanceKm?: number
}
