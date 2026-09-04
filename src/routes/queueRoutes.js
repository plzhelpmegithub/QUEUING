const redis = require('../config/redis');
const queueService = require('../services/queueService');

function getQueueContext(request) {
  const body = request.body || {};
  const query = request.query || {};
  return {
    eventId: body.eventId || query.eventId || '',
    sessionDate: body.sessionDate || query.sessionDate || '',
    sessionTime: body.sessionTime || query.sessionTime || '',
  };
}

async function queueRoutes(fastify) {

  fastify.post('/queue/set-seats', async (request, reply) => {
    const { totalSeats } = request.body || {};
    if (!totalSeats || totalSeats < 1) {
      return reply.status(400).send({ error: '총 좌석 수(totalSeats)는 1 이상이어야 합니다.' });
    }
    const result = await queueService.setTotalSeats(totalSeats, getQueueContext(request));
    return reply.send(result);
  });

  fastify.post('/queue/enter', async (request, reply) => {
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const result = await queueService.enter(userId, getQueueContext(request));
    return reply.send(result);
  });

  fastify.get('/queue/position/:userId', async (request, reply) => {
    const { userId } = request.params;
    const result = await queueService.getPosition(userId, getQueueContext(request));
    if (result.status === 'not_found') {
      return reply.status(404).send(result);
    }
    return reply.send(result);
  });

  fastify.post('/queue/admit', async (request, reply) => {
    const result = await queueService.admitBatch(getQueueContext(request));
    return reply.send(result);
  });

  fastify.get('/queue/standby/next', async (request, reply) => {
    const result = await queueService.getNextStandby(getQueueContext(request));
    return reply.send(result);
  });

  fastify.post('/queue/standby/promote', async (request, reply) => {
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }
    const result = await queueService.promoteStandby(userId, getQueueContext(request));
    return reply.send(result);
  });

  fastify.get('/queue/stats', async (request, reply) => {
    const result = await queueService.getStats(getQueueContext(request));
    return reply.send(result);
  });

  fastify.post('/admin/ticketing/open', async (request, reply) => {
    const result = await queueService.openTicketing();
    return reply.send(result);
  });

  fastify.post('/admin/ticketing/close', async (request, reply) => {
    const result = await queueService.closeTicketing();
    return reply.send(result);
  });

  fastify.get('/admin/ticketing/status', async (request, reply) => {
    const result = await queueService.getTicketingStatus();
    return reply.send(result);
  });

  fastify.post('/admin/hold-duration', async (request, reply) => {
    const { seconds } = request.body || {};
    if (!seconds || seconds < 10) {
      return reply.status(400).send({ error: '결제 제한 시간은 10초 이상이어야 합니다.' });
    }
    const result = await queueService.setHoldDuration(seconds);
    return reply.send(result);
  });

  fastify.get('/admin/hold-duration', async (request, reply) => {
    const result = await queueService.getHoldDuration();
    return reply.send(result);
  });

  fastify.post('/admin/ticketing/schedule', async (request, reply) => {
    const { openAt, durationMinutes } = request.body || {};
    if (!openAt) {
      return reply.status(400).send({ error: 'openAt(오픈 시간)은 필수입니다. 예: "2026-12-25T20:00:00"' });
    }
    const result = await queueService.scheduleTicketing(openAt, durationMinutes);
    const statusCode = result.success ? 200 : 400;
    return reply.status(statusCode).send(result);
  });

  fastify.post('/admin/ticketing/cancel-schedule', async (request, reply) => {
    const result = await queueService.cancelSchedule();
    return reply.send(result);
  });

  fastify.get('/admin/ticketing/schedule', async (request, reply) => {
    const result = await queueService.getSchedule();
    return reply.send(result);
  });

  fastify.post('/admin/ticketing/schedule-standby-close', async (request, reply) => {
    const { closeAt } = request.body || {};
    if (!closeAt) {
      return reply.status(400).send({ error: 'closeAt(마감 시간)은 필수입니다. 예: "2026-08-18T00:00:00"' });
    }
    const result = await queueService.scheduleStandbyClose(closeAt);
    const statusCode = result.success ? 200 : 400;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/queue/token/:userId', async (request, reply) => {
    const { getTokenInfo } = require('../services/tokenService');
    const { userId } = request.params;
    const result = await getTokenInfo(userId, getQueueContext(request));
    return reply.send(result);
  });

  fastify.get('/queue/status/:userId', async (request, reply) => {
    const { getTokenInfo } = require('../services/tokenService');
    const { userId } = request.params;

    const context = getQueueContext(request);
    const keys = queueService.queueKeys(context);
    const isAdmitted = await redis.sismember(keys.admittedKey, userId);
    if (isAdmitted) {
      const tokenInfo = await getTokenInfo(userId, context);
      return reply.send({
        canEnter: true,
        status: 'admitted',
        token: tokenInfo.exists ? tokenInfo : null,
        message: '입장이 허용되었습니다. 좌석을 선택해주세요.',
      });
    }

    const rank = await redis.zrank(keys.waitingKey, userId);
    if (rank !== null) {
      return reply.send({
        canEnter: false,
        status: 'waiting',
        type: 'eligible',
        position: rank + 1,
        message: `현재 ${rank + 1}번째 대기 중입니다.`,
      });
    }

    const standbyRank = await redis.zrank(keys.standbyKey, userId);
    if (standbyRank !== null) {
      return reply.send({
        canEnter: false,
        status: 'standby',
        type: 'standby',
        standbyPosition: standbyRank + 1,
        message: `취소표 대기 ${standbyRank + 1}번째입니다.`,
      });
    }

    return reply.send({
      canEnter: false,
      status: 'not_found',
      message: '대기열에 등록되어 있지 않습니다.',
    });
  });

  fastify.post('/queue/leave', async (request, reply) => {
    const { revokeToken } = require('../services/tokenService');
    const { userId } = request.body || {};
    if (!userId) {
      return reply.status(400).send({ error: 'userId는 필수입니다.' });
    }

    let removed = false;
    let from = '';

    const context = getQueueContext(request);
    const keys = queueService.queueKeys(context);
    const eligibleRemoved = await redis.zrem(keys.waitingKey, userId);
    if (eligibleRemoved > 0) { removed = true; from = 'eligible'; }

    const standbyRemoved = await redis.zrem(keys.standbyKey, userId);
    if (standbyRemoved > 0) { removed = true; from = 'standby'; }

    const admittedRemoved = await redis.srem(keys.admittedKey, userId);
    if (admittedRemoved > 0) { removed = true; from = 'admitted'; }

    await revokeToken(userId, context);

    if (removed) {
      return reply.send({ success: true, from, message: `${userId}가 대기열에서 이탈했습니다.` });
    }
    return reply.send({ success: false, message: '대기열에 등록되어 있지 않습니다.' });
  });

  fastify.post('/admin/queue/simulate', async (request, reply) => {
    const { count, membershipRatio } = request.body || {};
    const total = Math.min(parseInt(count, 10) || 1000, 500000);
    const mRatio = Math.max(0, Math.min(1, parseFloat(membershipRatio) || 0));
    const totalSeats = parseInt(await redis.get('event:total-seats'), 10) || 0;

    if (totalSeats === 0) {
      return reply.status(400).send({ error: '먼저 공연을 생성하고 좌석 수를 설정해주세요.' });
    }

    await redis.set('event:ticketing-status', 'open');

    const BATCH = 5000;
    let eligibleCount = 0;
    let standbyCount = 0;
    let memberCount = 0;

    for (let i = 0; i < total; i += BATCH) {
      const batchEnd = Math.min(i + BATCH, total);
      const pipeline = redis.pipeline();

      for (let j = i; j < batchEnd; j++) {
        const ticket = j + 1;
        const simUserId = `sim-user-${String(j + 1).padStart(6, '0')}@test.com`;

        if (ticket <= totalSeats) {
          pipeline.zadd('queue:waiting', ticket, simUserId);
          eligibleCount++;
        } else {
          pipeline.zadd('queue:standby', ticket, simUserId);
          standbyCount++;
        }
      }

      await pipeline.exec();
    }

    await redis.set('queue:counter', total);

    if (mRatio > 0) {
      const pool = require('../config/mariadb');
      const mCount = Math.floor(standbyCount * mRatio);
      const mBatch = 500;
      for (let i = 0; i < mCount; i += mBatch) {
        const values = [];
        const params = [];
        const batchEnd = Math.min(i + mBatch, mCount);
        for (let j = i; j < batchEnd; j++) {
          const idx = totalSeats + j + 1;
          const simUserId = `sim-user-${String(idx).padStart(6, '0')}@test.com`;
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
          values.push('(?, TRUE, ?, ?, ?, 1)');
          params.push(simUserId, 'monthly', 'MONTHLY', expiresAt);
          memberCount++;
        }
        try {
          await pool.query(
            `INSERT IGNORE INTO memberships (user_id, is_membership, plan, tier_name, expires_at, priority_level) VALUES ${values.join(',')}`,
            params,
          );
        } catch (e) {
          console.error('[Simulate] 멤버십 생성 실패:', e.message);
        }
      }
    }

    if (standbyCount > 0) {
      await redis.set('event:ticketing-status', 'sold_out');
    }

    return reply.send({
      success: true,
      total,
      eligible: eligibleCount,
      standby: standbyCount,
      memberships: memberCount,
      totalSeats,
      message: `${total.toLocaleString()}명 시뮬레이션 완료 (eligible: ${eligibleCount.toLocaleString()}, standby: ${standbyCount.toLocaleString()}, 멤버십: ${memberCount.toLocaleString()})`,
    });
  });

  fastify.post('/admin/queue/reset', async (request, reply) => {
    const pipeline = redis.pipeline();
    pipeline.del('queue:waiting');
    pipeline.del('queue:standby');
    pipeline.del('queue:admitted');
    pipeline.del('queue:counter');
    await pipeline.exec();

    const pool = require('../config/mariadb');
    try {
      await pool.query(`DELETE FROM waiting_queue WHERE user_id LIKE 'sim-user-%'`);
      await pool.query(`DELETE FROM memberships WHERE user_id LIKE 'sim-user-%'`);
    } catch (_) {}

    return reply.send({ success: true, message: '대기열 및 시뮬레이션 데이터가 초기화되었습니다.' });
  });
}

module.exports = queueRoutes;
