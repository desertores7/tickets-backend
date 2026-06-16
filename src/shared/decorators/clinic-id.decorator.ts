import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const ClinicId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const clinicId = request.headers['x-clinic-id'] || request.user?.clinicId;
  if (!clinicId) {
    throw new BadRequestException('X-Clinic-Id header is required');
  }
  return String(clinicId);
});
