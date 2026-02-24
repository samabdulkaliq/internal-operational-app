export declare enum TimeEventTypeDto {
    CLOCK_IN = "clock_in",
    CLOCK_OUT = "clock_out",
    BREAK_START = "break_start",
    BREAK_END = "break_end"
}
export declare enum TimeEventSourceDto {
    GEOFENCE_AUTO = "geofence_auto",
    PUSH_WAKE_LOCATION = "push_wake_location",
    SIGNIFICANT_CHANGE = "significant_change",
    MANUAL_CHECKIN = "manual_checkin",
    BLE_BEACON = "ble_beacon",
    NFC_TAP = "nfc_tap",
    WIFI_SSID = "wifi_ssid",
    MANAGER_OVERRIDE = "manager_override"
}
export declare class TimeEventInput {
    clientEventId: string;
    eventType: TimeEventTypeDto;
    source: TimeEventSourceDto;
    deviceTimestamp: string;
    propertyId: string;
    shiftId?: string;
    lat?: number;
    lng?: number;
    accuracyMeters?: number;
    locationProvider?: string;
    batteryLevel?: number;
    isMockLocation?: boolean;
    metadata?: Record<string, unknown>;
}
export declare class BatchSyncRequestDto {
    events: TimeEventInput[];
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
