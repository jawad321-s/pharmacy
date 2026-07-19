import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BillingCycle, TenantRole, TenantStatus, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { permissionsForUser } from '../../common/permissions';
import { AuthenticatedUser, JwtPayload } from '../../common/types';
import { ChangePasswordDto, LoginDto, RegisterTenantDto } from './auth.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const BCRYPT_ROUNDS = 12;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { tenant: { select: { id: true, name: true, slug: true, subdomain: true, status: true, currency: true, logoUrl: true } } },
    });

    const passwordOk =
      user !== null && (await bcrypt.compare(dto.password, user.passwordHash));

    await this.prisma.loginHistory.create({
      data: {
        userId: user?.id ?? null,
        tenantId: user?.tenantId ?? null,
        email: dto.email.toLowerCase(),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        success: Boolean(passwordOk && user?.isActive),
      },
    });

    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user, meta);
    return {
      ...tokens,
      user: this.toProfile(user),
      tenant: user.tenant,
    };
  }

  async registerTenant(dto: RegisterTenantDto, meta: RequestMeta) {
    const email = dto.email.toLowerCase();
    const subdomain = dto.subdomain.toLowerCase();

    const [existingUser, existingTenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.tenant.findFirst({
        where: { OR: [{ subdomain }, { slug: subdomain }] },
      }),
    ]);
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }
    if (existingTenant) {
      throw new ConflictException('This subdomain is already taken');
    }

    const plan = await this.prisma.plan.findFirst({
      where: dto.planSlug ? { slug: dto.planSlug, isActive: true } : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!plan) {
      throw new BadRequestException('No active subscription plan available');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, tenant } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.pharmacyName,
          slug: subdomain,
          subdomain,
          email,
          phone: dto.phone ?? null,
          currency: dto.currency ?? 'SAR',
          timezone: dto.timezone ?? 'Asia/Riyadh',
          status: TenantStatus.TRIAL,
          subscriptionPlanId: plan.id,
          settings: { create: {} },
        },
      });

      await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Main Branch',
          nameAr: 'الفرع الرئيسي',
          isMain: true,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone ?? null,
          tenantId: tenant.id,
          tenantRole: TenantRole.OWNER,
        },
        include: { tenant: { select: { id: true, name: true, slug: true, subdomain: true, status: true, currency: true, logoUrl: true } } },
      });

      return { user, tenant };
    });

    await this.subscriptions.startTrial(tenant.id, plan.id, BillingCycle.MONTHLY);

    const tokens = await this.issueTokens(user, meta);
    return { ...tokens, user: this.toProfile(user), tenant: user.tenant };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (stored.revokedAt) {
      // Token reuse detected — revoke the whole family for safety.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const tokens = await this.issueTokens(stored.user, meta, stored.id);
    return tokens;
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async me(user: AuthenticatedUser) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            subdomain: true,
            status: true,
            currency: true,
            timezone: true,
            logoUrl: true,
            settings: true,
          },
        },
        branch: { select: { id: true, name: true, isMain: true } },
      },
    });
    return {
      user: this.toProfile(record),
      tenant: record.tenant,
      branch: record.branch,
      permissions: permissionsForUser(record),
    };
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  private async issueTokens(
    user: User,
    meta: RequestMeta,
    rotatedFromId?: string,
  ): Promise<TokenPair> {
    const base: Omit<JwtPayload, 'type'> = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      tenantRole: user.tenantRole,
      platformRole: user.platformRole,
      jti: randomUUID(),
    };

    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      },
    );

    const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpiresIn));
    const created = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    if (rotatedFromId) {
      await this.prisma.refreshToken.update({
        where: { id: rotatedFromId },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
    }

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDuration(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const amount = Number(match[1]);
    const unit = match[2];
    const factors: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return amount * factors[unit];
  }

  private toProfile(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      tenantId: user.tenantId,
      tenantRole: user.tenantRole,
      platformRole: user.platformRole,
      branchId: user.branchId,
      permissions: permissionsForUser(user),
    };
  }
}
