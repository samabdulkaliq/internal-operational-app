"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchSyncRequestDto = exports.TimeEventInput = exports.TimeEventSourceDto = exports.TimeEventTypeDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var TimeEventTypeDto;
(function (TimeEventTypeDto) {
    TimeEventTypeDto["CLOCK_IN"] = "clock_in";
    TimeEventTypeDto["CLOCK_OUT"] = "clock_out";
    TimeEventTypeDto["BREAK_START"] = "break_start";
    TimeEventTypeDto["BREAK_END"] = "break_end";
})(TimeEventTypeDto || (exports.TimeEventTypeDto = TimeEventTypeDto = {}));
var TimeEventSourceDto;
(function (TimeEventSourceDto) {
    TimeEventSourceDto["GEOFENCE_AUTO"] = "geofence_auto";
    TimeEventSourceDto["PUSH_WAKE_LOCATION"] = "push_wake_location";
    TimeEventSourceDto["SIGNIFICANT_CHANGE"] = "significant_change";
    TimeEventSourceDto["MANUAL_CHECKIN"] = "manual_checkin";
    TimeEventSourceDto["BLE_BEACON"] = "ble_beacon";
    TimeEventSourceDto["NFC_TAP"] = "nfc_tap";
    TimeEventSourceDto["WIFI_SSID"] = "wifi_ssid";
    TimeEventSourceDto["MANAGER_OVERRIDE"] = "manager_override";
})(TimeEventSourceDto || (exports.TimeEventSourceDto = TimeEventSourceDto = {}));
class TimeEventInput {
}
exports.TimeEventInput = TimeEventInput;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], TimeEventInput.prototype, "clientEventId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(TimeEventTypeDto),
    __metadata("design:type", String)
], TimeEventInput.prototype, "eventType", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(TimeEventSourceDto),
    __metadata("design:type", String)
], TimeEventInput.prototype, "source", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], TimeEventInput.prototype, "deviceTimestamp", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], TimeEventInput.prototype, "propertyId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TimeEventInput.prototype, "shiftId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], TimeEventInput.prototype, "lat", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], TimeEventInput.prototype, "lng", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], TimeEventInput.prototype, "accuracyMeters", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TimeEventInput.prototype, "locationProvider", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], TimeEventInput.prototype, "batteryLevel", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TimeEventInput.prototype, "isMockLocation", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], TimeEventInput.prototype, "metadata", void 0);
class BatchSyncRequestDto {
}
exports.BatchSyncRequestDto = BatchSyncRequestDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TimeEventInput),
    __metadata("design:type", Array)
], BatchSyncRequestDto.prototype, "events", void 0);
//# sourceMappingURL=batch-sync.dto.js.map