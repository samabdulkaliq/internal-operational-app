import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TimeEventTypeDto {
  CLOCK_IN = 'clock_in',
  CLOCK_OUT = 'clock_out',
  BREAK_START = 'break_start',
  BREAK_END = 'break_end',
}

export enum TimeEventSourceDto {
  GEOFENCE_AUTO = 'geofence_auto',
  PUSH_WAKE_LOCATION = 'push_wake_location',
  SIGNIFICANT_CHANGE = 'significant_change',
  MANUAL_CHECKIN = 'manual_checkin',
  BLE_BEACON = 'ble_beacon',
  NFC_TAP = 'nfc_tap',
  WIFI_SSID = 'wifi_ssid',
  MANAGER_OVERRIDE = 'manager_override',
}

export class TimeEventInput {
  @IsUUID()
  clientEventId!: string;

  @IsEnum(TimeEventTypeDto)
  eventType!: TimeEventTypeDto;

  @IsEnum(TimeEventSourceDto)
  source!: TimeEventSourceDto;

  @IsDateString()
  deviceTimestamp!: string;

  @IsUUID()
  propertyId!: string;

  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsNumber()
  @IsOptional()
  accuracyMeters?: number;

  @IsString()
  @IsOptional()
  locationProvider?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  batteryLevel?: number;

  @IsBoolean()
  @IsOptional()
  isMockLocation?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class BatchSyncRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TimeEventInput)
  events!: TimeEventInput[];
}

export type BatchResultStatus = 'created' | 'duplicate' | 'rejected' | 'flagged';

export interface BatchResultItem {
  clientEventId: string;
  status: BatchResultStatus;
  serverId?: string;
  existingServerId?: string;
  reason?: string;
}

export interface BatchSyncResponse {
  results: BatchResultItem[];
}
