/**
 * End-to-end smoke tests. Requires a running PostgreSQL and Redis
 * (docker compose up postgres redis) with migrations + seed applied.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('PharmaSaaS API (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes public subscription plans', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/subscriptions/plans')
      .expect(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(3);
    expect(response.body[0]).toHaveProperty('slug');
  });

  it('rejects login with wrong credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@alshifa.com', password: 'wrong-password' })
      .expect(401);
  });

  it('logs in the seeded owner and returns tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@alshifa.com', password: 'Password123!' })
      .expect(200);
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
    expect(response.body.user.tenantRole).toBe('OWNER');
    accessToken = response.body.accessToken;
  });

  it('blocks tenant endpoints without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/medicines').expect(401);
  });

  it('returns tenant-scoped medicines with a valid token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/medicines')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('meta');
  });

  it('denies platform admin endpoints to tenant users', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });
});
