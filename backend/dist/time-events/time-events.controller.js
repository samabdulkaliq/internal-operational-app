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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeEventsController = void 0;
const common_1 = require("@nestjs/common");
const decorators_1 = require("../auth/decorators");
const batch_sync_dto_1 = require("./dto/batch-sync.dto");
const time_events_service_1 = require("./time-events.service");
const MAX_BATCH_SIZE = 200;
let TimeEventsController = class TimeEventsController {
    constructor(service) {
        this.service = service;
    }
    async batchSync(user, dto) {
        if (dto.events.length > MAX_BATCH_SIZE) {
            throw new common_1.BadRequestException('BATCH_TOO_LARGE');
        }
        return this.service.processBatch(user.tenantId, user.workerId, dto.events);
    }
};
exports.TimeEventsController = TimeEventsController;
__decorate([
    (0, common_1.Post)('batch'),
    (0, decorators_1.Roles)('cleaner', 'supervisor'),
    (0, common_1.HttpCode)(207),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, batch_sync_dto_1.BatchSyncRequestDto]),
    __metadata("design:returntype", Promise)
], TimeEventsController.prototype, "batchSync", null);
exports.TimeEventsController = TimeEventsController = __decorate([
    (0, common_1.Controller)('time-events'),
    __metadata("design:paramtypes", [time_events_service_1.TimeEventsService])
], TimeEventsController);
//# sourceMappingURL=time-events.controller.js.map