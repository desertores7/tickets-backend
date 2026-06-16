import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './env.config';
import { EnvService } from './env.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hacer el módulo global para que esté disponible en toda la app
      envFilePath: ['.env', '.env.local', '.env.production'], // Buscar .env en múltiples ubicaciones
      expandVariables: false, // true corrompe contraseñas con $ (ej. G$mD → G)
      validate: env => {
        console.log('ConfigModule.forRoot - Starting validation');
        try {
          const parsedEnv = envSchema.parse(env);
          console.log('Environment validation successful');
          return parsedEnv;
        } catch (error) {
          console.error('Invalid environment variables', error.issues);
          console.error('Full error:', error);
          throw error;
        }
      }
    })
  ],
  providers: [EnvService],
  exports: [EnvService]
})
@Global()
export class EnvModule {}
