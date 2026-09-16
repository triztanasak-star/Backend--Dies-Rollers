const express = require('express');

module.exports = (context) => {
  const router = express.Router();
  const {
    db,
    authMiddleware,
    requireManagerOrAdmin,
    isManagerOrAdmin,
    handleServerError,
    parsePagination,
    logActivity,
  } = context;

  const mapWork = (row) => ({
    $id: String(row.id),
    id: row.id,
    task_name: row.task_name,
    description: row.description,
    factory_name: row.factory_name,
    status: row.status,
    priority: row.priority,
    progress_percent: row.progress_percent,
    expected_deadline: row.expected_deadline,
    desired_deadline: row.desired_deadline,
    completed_at: row.completed_at,
    lead_project: row.lead_project,
    assistant: row.assistant,
    project_id: row.project_id,
    assigned_to: row.assigned_to,
    assigned_to_name: row.assigned_to_name ?? null,
    support_id: row.support_id,
    support_name: row.support_name ?? null,
    created_by: row.created_by,
    capex_amount: row.capex_amount !== null && row.capex_amount !== undefined ? Number(row.capex_amount) : null,
    estimated_saving_per_year: row.estimated_saving_per_year !== null && row.estimated_saving_per_year !== undefined
      ? Number(row.estimated_saving_per_year) : null,
    payback_years: row.payback_years !== null && row.payback_years !== undefined ? Number(row.payback_years) : null,
    manager_comment: row.manager_comment,
    progress_comment: row.progress_comment,
    has_feedback: row.has_feedback,
    feedback_comment: row.feedback_comment,
    rating: row.rating,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  const worksQueryBase = `
    SELECT dw.*, leader.name AS assigned_to_name, support.name AS support_name
    FROM "digital_works" dw
    LEFT JOIN "users" leader ON leader.id = dw.assigned_to
    LEFT JOIN "users" support ON support.id = dw.support_id
  `;

  // Kiểm tra quyền: Chỉ Admin/Manager HOẶC PIC (assigned_to), người hỗ trợ (support_id)
  // Đã fix lỗi 403 bằng cách ép kiểu Number cho cả 2 vế so sánh
  const canModifyWork = (req, work) => {
    const userId = Number(req.user.id);
    return isManagerOrAdmin(req) ||
      (work.assigned_to !== null && Number(work.assigned_to) === userId) ||
      (work.support_id !== null && Number(work.support_id) === userId);
  };

  // List - Tất cả các role đều lấy toàn bộ danh sách dùng chung
  router.get('/api/works', authMiddleware, async (req, res) => {
    try {
      const { page, limit, offset } = parsePagination(req);
      const filters = ['dw.is_deleted = false'];
      const params = [];

      if (req.query.assigned_to) {
        params.push(Number(req.query.assigned_to));
        filters.push(`dw.assigned_to = $${params.length}`);
      }

      if (req.query.project_id) {
        params.push(Number(req.query.project_id));
        filters.push(`dw.project_id = $${params.length}`);
      }
      if (req.query.status !== undefined && req.query.status !== '') {
        params.push(Number(req.query.status));
        filters.push(`dw.status = $${params.length}`);
      }

      const whereClause = `WHERE ${filters.join(' AND ')}`;
      const countQuery = `SELECT COUNT(*)::int AS total FROM "digital_works" dw ${whereClause}`;
      const rowsQuery = `${worksQueryBase} ${whereClause}
        ORDER BY dw.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

      const [countResult, rowsResult] = await Promise.all([
        db.query(countQuery, params),
        db.query(rowsQuery, [...params, limit, offset]),
      ]);

      return res.json({
        documents: rowsResult.rows.map(mapWork),
        total: countResult.rows[0].total,
        page,
        limit,
      });
    } catch (error) {
      return handleServerError(res, error, 'works-list');
    }
  });

  router.get('/api/works/:id', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await db.query(`${worksQueryBase} WHERE dw.id = $1 AND dw.is_deleted = false`, [id]);
      if (!rows.length) return res.status(404).json({ message: 'Work not found' });

      return res.json(mapWork(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'works-get');
    }
  });

  // Tạo công việc mới
  router.post('/api/works', authMiddleware, async (req, res) => {
    try {
      const {
        task_name, description, factory_name, expected_deadline, desired_deadline,
      } = req.body;
      const isReviewer = isManagerOrAdmin(req);
      const { project_id, assigned_to, support_id, priority } = isReviewer
        ? req.body
        : { project_id: null, assigned_to: null, support_id: null, priority: null };

      if (!task_name) return res.status(400).json({ message: 'Missing task_name' });
      if (priority && !['high', 'medium', 'low'].includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority' });
      }

      const { rows } = await db.query(
        `INSERT INTO "digital_works"
           (task_name, description, factory_name, project_id, assigned_to, support_id, created_by,
            expected_deadline, desired_deadline, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'medium'))
         RETURNING *`,
        [task_name, description || null, factory_name || null, project_id || null,
          assigned_to || null, support_id || null, req.user.id, expected_deadline || null,
          desired_deadline || null, priority || null],
      );

      await logActivity(req, 'CREATE_WORK', rows[0].id, null, rows[0]);
      return res.status(201).json(mapWork(rows[0]));
    } catch (error) {
      if (db.isForeignKeyViolation(error)) {
        return res.status(409).json({ message: 'project_id, assigned_to hoặc support_id không hợp lệ' });
      }
      return handleServerError(res, error, 'works-create');
    }
  });

  // Sửa thông tin task
  router.put('/api/works/:id', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      const existing = await db.query('SELECT * FROM "digital_works" WHERE id = $1 AND is_deleted = false', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Work not found' });

      const work = existing.rows[0];
      if (!canModifyWork(req, work)) {
        return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa công việc này' });
      }

      const {
        task_name, description, factory_name, project_id, assigned_to, support_id,
        lead_project, assistant,
        expected_deadline, desired_deadline, priority,
        capex_amount, estimated_saving_per_year, payback_years,
      } = req.body;

      if (priority && !['high', 'medium', 'low'].includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority' });
      }

      const isReviewer = isManagerOrAdmin(req);
      const nextProjectID = isReviewer ? (project_id !== undefined ? project_id : work.project_id) : work.project_id;
      const nextAssignedTo = isReviewer ? (assigned_to !== undefined ? assigned_to : work.assigned_to) : work.assigned_to;
      const nextSupportId = isReviewer ? (support_id !== undefined ? support_id : work.support_id) : work.support_id;

      const { rows } = await db.query(
        `UPDATE "digital_works"
         SET task_name = COALESCE($1, task_name),
             description = COALESCE($2, description),
             factory_name = COALESCE($3, factory_name),
             project_id = $4,
             assigned_to = $5,
             support_id = $6,
             lead_project = COALESCE($7, lead_project),
             assistant = COALESCE($8, assistant),
             expected_deadline = COALESCE($9, expected_deadline),
             desired_deadline = COALESCE($10, desired_deadline),
             priority = COALESCE($11, priority),
             capex_amount = COALESCE($12, capex_amount),
             estimated_saving_per_year = COALESCE($13, estimated_saving_per_year),
             payback_years = COALESCE($14, payback_years),
             updated_at = NOW()
         WHERE id = $15
         RETURNING *`,
        [
          task_name, description, factory_name, nextProjectID, nextAssignedTo, nextSupportId,
          lead_project, assistant,
          expected_deadline, desired_deadline, priority,
          capex_amount, estimated_saving_per_year, payback_years, id
        ],
      );

      await logActivity(req, 'UPDATE_WORK', id, work, rows[0]);
      return res.json(mapWork(rows[0]));
    } catch (error) {
      if (db.isForeignKeyViolation(error)) {
        return res.status(409).json({ message: 'project_id, assigned_to hoặc support_id không hợp lệ' });
      }
      return handleServerError(res, error, 'works-update');
    }
  });

  // Cập nhật tiến độ
  router.patch('/api/works/:id/progress', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.query('SELECT * FROM "digital_works" WHERE id = $1 AND is_deleted = false', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Work not found' });

      const work = existing.rows[0];
      if (!canModifyWork(req, work)) {
        return res.status(403).json({ message: 'Bạn không có quyền cập nhật tiến độ công việc này' });
      }

      const {
        status, progress_percent, progress_comment,
        manager_comment, rating, has_feedback, feedback_comment,
        capex_amount, estimated_saving_per_year, payback_years,
      } = req.body;

      if (progress_percent !== undefined && (progress_percent < 0 || progress_percent > 100)) {
        return res.status(400).json({ message: 'progress_percent phải từ 0 đến 100' });
      }
      if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
        return res.status(400).json({ message: 'rating phải từ 1 đến 5' });
      }

      const isReviewer = isManagerOrAdmin(req);
      const nextManagerComment = isReviewer ? manager_comment : work.manager_comment;
      const nextRating = isReviewer ? rating : work.rating;
      const nextHasFeedback = isReviewer ? has_feedback : work.has_feedback;
      const nextFeedbackComment = isReviewer ? feedback_comment : work.feedback_comment;

      const completedAt = status !== undefined && Number(status) >= 2 ? new Date() : work.completed_at;

      const { rows } = await db.query(
        `UPDATE "digital_works"
         SET status = COALESCE($1, status),
             progress_percent = COALESCE($2, progress_percent),
             progress_comment = COALESCE($3, progress_comment),
             manager_comment = $4,
             rating = $5,
             has_feedback = $6,
             feedback_comment = $7,
             capex_amount = COALESCE($8, capex_amount),
             estimated_saving_per_year = COALESCE($9, estimated_saving_per_year),
             payback_years = COALESCE($10, payback_years),
             completed_at = $11,
             updated_at = NOW()
         WHERE id = $12
         RETURNING *`,
        [
          status, progress_percent, progress_comment, nextManagerComment, nextRating,
          nextHasFeedback, nextFeedbackComment, 
          capex_amount, estimated_saving_per_year, payback_years,
          completedAt, id
        ],
      );

      await logActivity(req, 'UPDATE_WORK_PROGRESS', id, work, rows[0]);
      return res.json(mapWork(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'works-progress-update');
    }
  });

  // Xóa (soft delete) - Chỉ Admin/Manager
  router.delete('/api/works/:id', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.query('SELECT * FROM "digital_works" WHERE id = $1 AND is_deleted = false', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Work not found' });

      if (!isManagerOrAdmin(req)) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa công việc này' });
      }

      const { rows } = await db.query(
        'UPDATE "digital_works" SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id],
      );

      await logActivity(req, 'DELETE_WORK', id, existing.rows[0], rows[0]);
      return res.json({ success: true });
    } catch (error) {
      return handleServerError(res, error, 'works-delete');
    }
  });

  return router;
};