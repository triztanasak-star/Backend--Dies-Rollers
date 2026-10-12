const express = require('express');

module.exports = (context) => {
  const router = express.Router();
  const {
    db,
    authMiddleware,
    isManagerOrAdmin,
    handleServerError,
    logActivity,
  } = context;

  // ✅ Hàm chọn bảng works theo type
  // - type='die' (mặc định): digital_works
  // - type='roller': digital_roller_works
  const getWorksTable = (req) => {
    return req.query.type === 'roller' ? 'digital_roller_works' : 'digital_works';
  };

  const mapPlan = (row) => ({
    $id: String(row.id),
    id: row.id,
    work_id: row.work_id,
    created_by: row.created_by,
    step_name: row.step_name,
    step_order: row.step_order,
    status: row.status,
    progress_percent: row.progress_percent,
    due_date: row.due_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  // ✅ Sửa canAccessWork: query đúng bảng works theo type
  const canAccessWork = async (req, workId, requireModify = false) => {
    const worksTable = getWorksTable(req);
    const { rows } = await db.query(
      `SELECT * FROM "${worksTable}" WHERE id = $1 AND is_deleted = false`,
      [workId]
    );
    if (!rows.length) return { ok: false, status: 404, message: 'Work not found' };

    const work = rows[0];

    if (requireModify) {
      const isAllowed = isManagerOrAdmin(req) ||
                        Number(work.assigned_to) === Number(req.user.id) ||
                        Number(work.support_id) === Number(req.user.id);
      if (!isAllowed) {
        return { ok: false, status: 403, message: 'Bạn không có quyền chỉnh sửa hạng mục của công việc này' };
      }
    }

    return { ok: true, work };
  };

  // ✅ SỬA: recomputeWorkProgress cần biết worksTable để UPDATE đúng bảng
  const recomputeWorkProgress = async (workId, worksTable) => {
    const table = worksTable || 'digital_works';
    const { rows } = await db.query(
      'SELECT COALESCE(SUM(progress_percent), 0)::int AS total_tons, COUNT(*)::int AS total FROM "task_plans" WHERE work_id = $1',
      [workId],
    );
    if (!rows.length) return;

    if (rows[0].total > 0) {
      await db.query(
        `UPDATE "${table}" SET progress_percent = $1, updated_at = NOW() WHERE id = $2`,
        [rows[0].total_tons, workId],
      );
    }
  };

  // ✅ List plan steps — hỗ trợ type=roller
  router.get('/api/works/:workId/plans', authMiddleware, async (req, res) => {
    try {
      const workId = Number(req.params.workId);
      const access = await canAccessWork(req, workId, false);   // ✅ Đã dùng type
      if (!access.ok) return res.status(access.status).json({ message: access.message });

      const { rows } = await db.query(
        'SELECT * FROM "task_plans" WHERE work_id = $1 ORDER BY step_order ASC, id ASC',
        [workId],
      );
      return res.json({ documents: rows.map(mapPlan) });
    } catch (error) {
      return handleServerError(res, error, 'task-plans-list');
    }
  });

  // ✅ THÊM MỚI: Route public cho plans (không cần auth) — dùng cho QR scan
  router.get('/api/works/:workId/plans/public', async (req, res) => {
    try {
      const workId = Number(req.params.workId);
      // Không cần kiểm tra access vì đây là route public

      const { rows } = await db.query(
        'SELECT * FROM "task_plans" WHERE work_id = $1 ORDER BY step_order ASC, id ASC',
        [workId],
      );
      return res.json({ documents: rows.map(mapPlan) });
    } catch (error) {
      return handleServerError(res, error, 'task-plans-public-list');
    }
  });

  // ✅ Tạo bước plan mới — hỗ trợ type=roller
  router.post('/api/works/:workId/plans', authMiddleware, async (req, res) => {
    try {
      const workId = Number(req.params.workId);
      const access = await canAccessWork(req, workId, true);
      if (!access.ok) return res.status(access.status).json({ message: access.message });

      const { step_name, step_order, due_date, progress_percent } = req.body;
      if (!step_name) return res.status(400).json({ message: 'Missing step_name' });

      if (progress_percent !== undefined && progress_percent !== null && Number(progress_percent) < 0) {
        return res.status(400).json({ message: 'Số tấn không được âm' });
      }

      const { rows } = await db.query(
        `INSERT INTO "task_plans" (work_id, created_by, step_name, step_order, due_date, progress_percent)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0))
         RETURNING *`,
        [workId, req.user.id, step_name, step_order || 0, due_date || null, progress_percent ?? null],
      );

      // ✅ Truyền worksTable để UPDATE đúng bảng
      const worksTable = getWorksTable(req);
      await recomputeWorkProgress(workId, worksTable);
      await logActivity(req, 'CREATE_TASK_PLAN', rows[0].id, null, rows[0]);
      return res.status(201).json(mapPlan(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'task-plans-create');
    }
  });

  // ✅ Update plan — hỗ trợ type=roller
  router.put('/api/plans/:id', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.query('SELECT * FROM "task_plans" WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Plan not found' });

      const access = await canAccessWork(req, existing.rows[0].work_id, true);
      if (!access.ok) return res.status(access.status).json({ message: access.message });

      const { step_name, step_order, status, due_date, progress_percent } = req.body;
      if (status && !['pending', 'in_progress', 'done'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      if (progress_percent !== undefined && progress_percent !== null && Number(progress_percent) < 0) {
        return res.status(400).json({ message: 'Số tấn không được âm' });
      }

      const { rows } = await db.query(
        `UPDATE "task_plans"
         SET step_name = COALESCE($1, step_name),
             step_order = COALESCE($2, step_order),
             status = COALESCE($3, status),
             due_date = COALESCE($4, due_date),
             progress_percent = COALESCE($5, progress_percent),
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [step_name, step_order, status, due_date, progress_percent, id],
      );

      // ✅ Truyền worksTable để UPDATE đúng bảng
      const worksTable = getWorksTable(req);
      await recomputeWorkProgress(rows[0].work_id, worksTable);
      await logActivity(req, 'UPDATE_TASK_PLAN', id, existing.rows[0], rows[0]);
      return res.json(mapPlan(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'task-plans-update');
    }
  });

  // ✅ Delete plan — hỗ trợ type=roller
  router.delete('/api/plans/:id', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.query('SELECT * FROM "task_plans" WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Plan not found' });

      const access = await canAccessWork(req, existing.rows[0].work_id, true);
      if (!access.ok) return res.status(access.status).json({ message: access.message });

      await db.query('DELETE FROM "task_plans" WHERE id = $1', [id]);
      // ✅ Truyền worksTable để UPDATE đúng bảng
      const worksTable = getWorksTable(req);
      await recomputeWorkProgress(existing.rows[0].work_id, worksTable);
      await logActivity(req, 'DELETE_TASK_PLAN', id, existing.rows[0], null);
      return res.json({ success: true });
    } catch (error) {
      return handleServerError(res, error, 'task-plans-delete');
    }
  });

  return router;
};