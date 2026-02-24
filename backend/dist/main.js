"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
function getCorsOrigins() {
    const raw = process.env.CORS_ORIGINS;
    if (!raw)
        return false;
    const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
    return origins.length > 0 ? origins : false;
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const corsOrigins = getCorsOrigins();
    if (corsOrigins) {
        app.enableCors({ origin: corsOrigins });
    }
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`API server listening on :${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map