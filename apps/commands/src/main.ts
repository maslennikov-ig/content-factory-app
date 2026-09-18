import { NestFactory } from '@nestjs/core';
import { CommandModule } from './command.module';
import { CommandService } from 'nestjs-command';
import { closeIoRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { closeTemporalCommandClient } from '@contentfactory/nestjs-libraries/temporal/temporal.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(CommandModule, {
    logger: ['error'],
  });

  // Boot stays quiet — the thirty "InstanceLoader ... dependencies initialized"
  // lines are noise in front of a command's answer — but the answer itself is
  // the whole point of running a command. Raising the level here, after the
  // context is built, keeps the first and drops the second: a dry run that
  // prints nothing is indistinguishable from a dry run that found nothing.
  app.useLogger(['error', 'warn', 'log']);

  // Everything this process opened that Nest does not own. Both are no-ops
  // until something actually opened a socket, and both are the difference
  // between a command that returns and one that has to be killed.
  const release = async () => {
    await closeTemporalCommandClient(app);
    await closeIoRedis();
  };

  try {
    await app.select(CommandModule).get(CommandService).exec();
    await release();
    await app.close();
  } catch (error) {
    console.error(error);
    await release();
    await app.close();
    process.exit(1);
  }
}

bootstrap();
