import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

function getCorsOrigins(): string[] | false {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return false;
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length > 0 ? origins : false;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = getCorsOrigins();
  if (corsOrigins) {
    app.enableCors({ origin: corsOrigins });
  }

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API server listening on :${port}`);
}

bootstrap();
