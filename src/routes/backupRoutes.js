const backupService = require('../services/backupService');

async function backupRoutes(fastify) {

  fastify.post('/admin/backup/queue', async (request, reply) => {
    const { eventId } = request.body || {};
    const result = await backupService.saveQueueSnapshot(eventId);
    return reply.send(result);
  });

  fastify.post('/admin/backup/seats', async (request, reply) => {
    const { eventId } = request.body || {};
    const result = await backupService.saveSeatSnapshot(eventId);
    return reply.send(result);
  });

  fastify.get('/admin/backup/list', async (request, reply) => {
    const { eventId, limit } = request.query || {};
    const backups = await backupService.listBackups(eventId, parseInt(limit, 10) || 20);
    return reply.send({ backups, count: backups.length });
  });

  fastify.get('/admin/backup/:id', async (request, reply) => {
    const { id } = request.params;
    const rows = await require('../config/mariadb').query(
      `SELECT id, backup_type, event_id, data, created_at FROM backups WHERE id = ?`, [id],
    );
    if (rows.length === 0) {
      return reply.status(404).send({ message: '해당 백업을 찾을 수 없습니다.' });
    }
    const r = rows[0];
    return reply.send({
      id: r.id,
      backupType: r.backup_type,
      eventId: r.event_id,
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    });
  });

  fastify.post('/admin/backup/restore/queue', async (request, reply) => {
    const { backupId } = request.body || {};
    if (!backupId) {
      return reply.status(400).send({ error: 'backupId는 필수입니다.' });
    }
    const result = await backupService.restoreQueueSnapshot(backupId);
    const statusCode = result.success ? 200 : 404;
    return reply.status(statusCode).send(result);
  });
}

module.exports = backupRoutes;
