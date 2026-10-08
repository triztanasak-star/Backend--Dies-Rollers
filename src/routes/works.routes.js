const express = require('express');

module.exports = (context) => {
  const router = express.Router();
  const {
    db,
    notificationService,
    authMiddleware,
    requireManagerOrAdmin,
    isManagerOrAdmin,
    handleServerError,
    parsePagination,
    logActivity,
  } = context;

  // ✅ Hàm xác định tên bảng dựa vào query param type
  const getTableName = (req) => {
    return req.query.type === 'roller' ? 'digital_roller_works' : 'digital_works';
  };

  const mapWork = (row) => ({
    $id: String(row.id),
    id: row.id,
    task_name: row.task_name,
    description: row.description,
    factory_name: row.factory_name,
    status: row.status,
    workflow_status: row.workflow_status,
    priority: row.priority,
    progress_percent: row.progress_percent,
    expected_deadline: row.expected_deadline,
    desired_deadline: row.desired_deadline,
    completed_at: row.completed_at,
    lead_project: row.lead_project,
    assistant: row.assistant,
    representative_name: row.representative_name,
    representative_email: row.representative_email,
    representative_phone: row.representative_phone,
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
    support_request: row.support_request,
    has_feedback: row.has_feedback,
    feedback_comment: row.feedback_comment,
    rating: row.rating,
    created_at: row.created_at,
    updated_at: row.updated_at,

    dies_model: row.dies_model,
    dies_code: row.dies_code,
    symptom: row.symptom,
    supplier: row.supplier,

    dies_hole_mm: row.dies_hole_mm !== null && row.dies_hole_mm !== undefined
      ? row.dies_hole_mm
      : null,

    press_length_mm: row.press_length_mm ?? null,
    ld_ratio: row.ld_ratio !== null && row.ld_ratio !== undefined ? Number(row.ld_ratio) : null,
    dies_life_ton: row.dies_life_ton !== null && row.dies_life_ton !== undefined ? Number(row.dies_life_ton) : null,
    standard_ton: row.standard_ton !== null && row.standard_ton !== undefined ? Number(row.standard_ton) : null,
    remaining_tons: row.remaining_tons !== null && row.remaining_tons !== undefined ? Number(row.remaining_tons) : null,
    start_date: row.start_date,
    end_date: row.end_date,
    dies_price_vnd: row.dies_price_vnd !== null && row.dies_price_vnd !== undefined ? Number(row.dies_price_vnd) : null,
    price_per_ton_vnd: row.price_per_ton_vnd !== null && row.price_per_ton_vnd !== undefined ? Number(row.price_per_ton_vnd) : null,
    result_cost_per_ton_vnd: row.result_cost_per_ton_vnd !== null && row.result_cost_per_ton_vnd !== undefined ? Number(row.result_cost_per_ton_vnd) : null,
    line_in_use: row.line_in_use,
    image_before: row.image_before,
    image_after: row.image_after,
  });

  const getWorksQueryBase = (tableName) => `
    SELECT dw.*, leader.name AS assigned_to_name, support.name AS support_name
    FROM "${tableName}" dw
    LEFT JOIN "users" leader ON leader.id = dw.assigned_to
    LEFT JOIN "users" support ON support.id = dw.support_id
  `;

  const canModifyWork = (req, work) => {
    const userId = Number(req.user.id);
    return isManagerOrAdmin(req) ||
      (work.assigned_to !== null && Number(work.assigned_to) === userId) ||
      (work.support_id !== null && Number(work.support_id) === userId);
  };

  const resolveUserId = async (idOrName, fallbackName) => {
    if (idOrName !== undefined && idOrName !== null && idOrName !== '') {
      const num = Number(idOrName);
      if (!isNaN(num) && num > 0) return num;
    }
    const searchValue = idOrName || fallbackName;
    if (!searchValue || typeof searchValue !== 'string') return null;

    try {
      const { rows } = await db.query(
        'SELECT id FROM "users" WHERE name = $1 OR email = $1 LIMIT 1',
        [searchValue.trim()]
      );
      if (rows.length) {
        console.log(`[AUTO-CONVERT] "${searchValue}" → user_id=${rows[0].id}`);
        return rows[0].id;
      }
    } catch (err) {
      console.error('[AUTO-CONVERT] Lỗi lookup:', err);
    }
    return null;
  };

  // ✅ GET /api/works — Hỗ trợ ?type=roller
  router.get('/api/works', authMiddleware, async (req, res) => {
    try {
      const tableName = getTableName(req);
      const worksQueryBase = getWorksQueryBase(tableName);

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
      const countQuery = `SELECT COUNT(*)::int AS total FROM "${tableName}" dw ${whereClause}`;
      const rowsQuery = `${worksQueryBase} ${whereClause}
        ORDER BY dw.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

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

  // ✅ GET /api/works/:id/public — Hỗ trợ ?type=roller
  router.get('/api/works/:id/public', async (req, res) => {
    try {
      const tableName = getTableName(req);
      const id = Number(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const { rows } = await db.query(
        `SELECT 
          id, task_name, dies_model, dies_code, supplier,
          dies_hole_mm, press_length_mm, ld_ratio, line_in_use,
          standard_ton, dies_life_ton, remaining_tons,
          dies_price_vnd, price_per_ton_vnd, result_cost_per_ton_vnd,
          symptom, status,
          created_at, expected_deadline, completed_at
         FROM "${tableName}" 
         WHERE id = $1 AND is_deleted = false`,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({ message: 'Work not found' });
      }

      return res.json(mapWork(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'works-get-public');
    }
  });

  // ✅ GET /api/works/:id — Hỗ trợ ?type=roller
  router.get('/api/works/:id', authMiddleware, async (req, res) => {
    try {
      const tableName = getTableName(req);
      const worksQueryBase = getWorksQueryBase(tableName);
      const id = Number(req.params.id);

      const { rows } = await db.query(
        `${worksQueryBase} WHERE dw.id = $1 AND dw.is_deleted = false`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ message: 'Work not found' });

      return res.json(mapWork(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'works-get');
    }
  });

  // ✅ POST /api/works — Hỗ trợ ?type=roller
  router.post('/api/works', authMiddleware, async (req, res) => {
    try {
      // ✅ DEBUG: Log ra để biết chính xác req.body có gì
      console.log('--- [works-create] req.body ---', req.body);
      console.log('--- [works-create] req.headers["content-type"] ---', req.headers['content-type']);

      const tableName = getTableName(req);

      const {
        task_name, description, factory_name, expected_deadline, desired_deadline, priority,
        status,
        project_id, lead_project, assistant,
        representative_name, representative_email, representative_phone,
        dies_model, dies_code, symptom, supplier,
        dies_hole_mm, press_length_mm, ld_ratio, dies_life_ton, standard_ton, remaining_tons,
        dies_price_vnd, price_per_ton_vnd, result_cost_per_ton_vnd, line_in_use,
      } = req.body || {}; // ✅ Fallback về {} nếu req.body undefined

      const isReviewer = isManagerOrAdmin(req);

      if (!task_name) return res.status(400).json({ 
        message: 'Missing task_name',
        received: req.body 
      });
      if (priority && !['high', 'medium', 'low'].includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority' });
      }

      let nextProjectID = isReviewer ? (project_id || null) : null;
      let nextAssignedTo = null;
      let nextSupportId = null;

      if (isReviewer) {
        nextAssignedTo = await resolveUserId(req.body.assigned_to, lead_project);
        nextSupportId = await resolveUserId(req.body.support_id, assistant);
      }

      const { rows } = await db.query(
        `INSERT INTO "${tableName}"
           (task_name, description, factory_name, project_id, assigned_to, support_id, created_by,
            expected_deadline, desired_deadline, priority, lead_project, assistant,
            representative_name, representative_email, representative_phone, workflow_status,
            status,
            dies_model, dies_code, symptom, supplier,
            dies_hole_mm, press_length_mm, ld_ratio, dies_life_ton, standard_ton, remaining_tons,
            dies_price_vnd, price_per_ton_vnd, result_cost_per_ton_vnd, line_in_use)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'medium'), $11, $12, $13, $14, $15, 'requested',
                 COALESCE($30, 0),
                 $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
         RETURNING *`,
        [
          task_name, description || null, factory_name || null,
          nextProjectID, nextAssignedTo, nextSupportId, req.user.id,
          expected_deadline || null, desired_deadline || null, priority || null,
          lead_project || null, assistant || null,
          representative_name || null, representative_email || null, representative_phone || null,
          dies_model || null, dies_code || null, symptom || null, supplier || null,
          dies_hole_mm ?? null,
          press_length_mm ?? null,
          ld_ratio ?? null,
          dies_life_ton ?? null,
          standard_ton ?? null,
          remaining_tons ?? null,
          dies_price_vnd ?? null,
          price_per_ton_vnd ?? null,
          result_cost_per_ton_vnd ?? null,
          line_in_use || null,
          Number(status) || 0,
        ],
      );

      await logActivity(req, 'CREATE_WORK', rows[0].id, null, rows[0]);

      try {
        await notificationService.notifyWorkCreated(rows[0]);
      } catch (notifyError) {
        console.error('[works-create-notify]', notifyError);
      }

      return res.status(201).json(mapWork(rows[0]));
    } catch (error) {
      if (db.isForeignKeyViolation(error)) {
        return res.status(409).json({ message: 'project_id, assigned_to hoặc support_id không hợp lệ' });
      }
      return handleServerError(res, error, 'works-create');
    }
  });

  // ✅ PUT /api/works/:id — Hỗ trợ ?type=roller
  router.put('/api/works/:id', authMiddleware, async (req, res) => {
    try {
      const tableName = getTableName(req);
      const id = Number(req.params.id);

      const existing = await db.query(
        `SELECT * FROM "${tableName}" WHERE id = $1 AND is_deleted = false`,
        [id]
      );
      if (!existing.rows.length) return res.status(404).json({ message: 'Work not found' });

      const work = existing.rows[0];
      if (!canModifyWork(req, work)) {
        return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa công việc này' });
      }

      const {
        task_name, description, factory_name, project_id,
        lead_project, assistant,
        representative_name, representative_email, representative_phone,
        expected_deadline, desired_deadline, priority,
        status,
        capex_amount, estimated_saving_per_year, payback_years,
        workflow_status,
        dies_model, dies_code, symptom, supplier,
        dies_hole_mm, press_length_mm, ld_ratio, dies_life_ton, standard_ton, remaining_tons,
        dies_price_vnd, price_per_ton_vnd, result_cost_per_ton_vnd, line_in_use,
      } = req.body || {};

      if (priority && !['high', 'medium', 'low'].includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority' });
      }

      const VALID_WORKFLOW_STATUSES = ['requested', 'approved', 'in_progress', 'completed'];
      if (workflow_status && !VALID_WORKFLOW_STATUSES.includes(workflow_status)) {
        return res.status(400).json({ message: 'Invalid workflow_status' });
      }

      const isReviewer = isManagerOrAdmin(req);

      let nextAssignedTo = work.assigned_to;
      let nextSupportId = work.support_id;

      if (isReviewer) {
        if (req.body.assigned_to !== undefined || lead_project !== undefined) {
          nextAssignedTo = await resolveUserId(req.body.assigned_to, lead_project);
        }
        if (req.body.support_id !== undefined || assistant !== undefined) {
          nextSupportId = await resolveUserId(req.body.support_id, assistant);
        }
      }

      const nextProjectID = isReviewer
        ? (project_id !== undefined ? project_id : work.project_id)
        : work.project_id;

      const { rows } = await db.query(
        `UPDATE "${tableName}"
         SET task_name = COALESCE($1, task_name),
             description = COALESCE($2, description),
             factory_name = COALESCE($3, factory_name),
             project_id = $4,
             assigned_to = $5,
             support_id = $6,
             lead_project = COALESCE($7, lead_project),
             assistant = COALESCE($8, assistant),
             representative_name = COALESCE($9, representative_name),
             representative_email = COALESCE($10, representative_email),
             representative_phone = COALESCE($11, representative_phone),
             expected_deadline = COALESCE($12, expected_deadline),
             desired_deadline = COALESCE($13, desired_deadline),
             priority = COALESCE($14, priority),
             capex_amount = COALESCE($15, capex_amount),
             estimated_saving_per_year = COALESCE($16, estimated_saving_per_year),
             payback_years = COALESCE($17, payback_years),
             workflow_status = COALESCE($18, workflow_status),
             status = COALESCE($19, status),
             dies_model = COALESCE($20, dies_model),
             dies_code = COALESCE($21, dies_code),
             symptom = COALESCE($22, symptom),
             supplier = COALESCE($23, supplier),
             dies_hole_mm = COALESCE($24, dies_hole_mm),
             press_length_mm = COALESCE($25, press_length_mm),
             ld_ratio = COALESCE($26, ld_ratio),
             dies_life_ton = COALESCE($27, dies_life_ton),
             standard_ton = COALESCE($28, standard_ton),
             remaining_tons = COALESCE($29, remaining_tons),
             dies_price_vnd = COALESCE($30, dies_price_vnd),
             price_per_ton_vnd = COALESCE($31, price_per_ton_vnd),
             result_cost_per_ton_vnd = COALESCE($32, result_cost_per_ton_vnd),
             line_in_use = COALESCE($33, line_in_use),
             updated_at = NOW()
         WHERE id = $34
         RETURNING *`,
        [
          task_name, description, factory_name, nextProjectID, nextAssignedTo, nextSupportId,
          lead_project, assistant,
          representative_name, representative_email, representative_phone,
          expected_deadline, desired_deadline, priority,
          capex_amount, estimated_saving_per_year, payback_years, workflow_status || null,
          status !== undefined && status !== null ? Number(status) : null,
          dies_model, dies_code, symptom, supplier,
          dies_hole_mm,
          press_length_mm, ld_ratio, dies_life_ton, standard_ton, remaining_tons,
          dies_price_vnd, price_per_ton_vnd, result_cost_per_ton_vnd, line_in_use,
          id
        ],
      );

      await logActivity(req, 'UPDATE_WORK', id, work, rows[0]);

      const justApproved = work.workflow_status !== 'approved' && rows[0].workflow_status === 'approved';
      if (justApproved) {
        try {
          const recipientIds = [rows[0].assigned_to, rows[0].support_id].filter(
            (v) => v !== null && v !== undefined,
          );
          let recipientEmails = [];
          if (recipientIds.length > 0) {
            const { rows: userRows } = await db.query(
              'SELECT email FROM "users" WHERE id = ANY($1::int[])',
              [recipientIds],
            );
            recipientEmails = userRows.map((u) => u.email).filter(Boolean);
          }
          await notificationService.notifyWorkApproved(rows[0], recipientEmails);
        } catch (notifyError) {
          console.error('[works-approve-notify]', notifyError);
        }
      }

      return res.json(mapWork(rows[0]));
    } catch (error) {
      if (db.isForeignKeyViolation(error)) {
        return res.status(409).json({ message: 'project_id, assigned_to hoặc support_id không hợp lệ' });
      }
      return handleServerError(res, error, 'works-update');
    }
  });

  // ✅ PATCH /api/works/:id/progress — Hỗ trợ ?type=roller
  router.patch('/api/works/:id/progress', authMiddleware, async (req, res) => {
    try {
      const tableName = getTableName(req);
      const id = Number(req.params.id);

      const existing = await db.query(
        `SELECT * FROM "${tableName}" WHERE id = $1 AND is_deleted = false`,
        [id]
      );
      if (!existing.rows.length) return res.status(404).json({ message: 'Work not found' });

      const work = existing.rows[0];
      if (!canModifyWork(req, work)) {
        return res.status(403).json({ message: 'Bạn không có quyền cập nhật tiến độ công việc này' });
      }

      const {
        status, progress_percent, progress_comment,
        manager_comment, rating, has_feedback, feedback_comment,
        capex_amount, estimated_saving_per_year, payback_years,
        support_request, workflow_status,
        dies_model, dies_code, supplier,
        dies_hole_mm, press_length_mm, ld_ratio,
        line_in_use, standard_ton, dies_life_ton, dies_price_vnd,
        remaining_tons, price_per_ton_vnd, result_cost_per_ton_vnd,
        symptom,
        expected_deadline,
        desired_deadline,
        completed_at,
      } = req.body || {};

      if (progress_percent !== undefined && progress_percent !== null && Number(progress_percent) < 0) {
        return res.status(400).json({ message: 'Số tấn không được âm' });
      }
      if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
        return res.status(400).json({ message: 'rating phải từ 1 đến 5' });
      }

      const VALID_WORKFLOW_STATUSES = ['requested', 'approved', 'in_progress', 'completed'];
      if (workflow_status && !VALID_WORKFLOW_STATUSES.includes(workflow_status)) {
        return res.status(400).json({ message: 'Invalid workflow_status' });
      }

      const isReviewer = isManagerOrAdmin(req);
      const nextManagerComment = isReviewer ? manager_comment : work.manager_comment;
      const nextRating = isReviewer ? rating : work.rating;
      const nextHasFeedback = isReviewer ? has_feedback : work.has_feedback;
      const nextFeedbackComment = isReviewer ? feedback_comment : work.feedback_comment;

      let completedAtValue;
      if (status !== undefined && Number(status) >= 2) {
        completedAtValue = new Date();
      } else if (completed_at !== undefined) {
        completedAtValue = completed_at;
      } else {
        completedAtValue = work.completed_at;
      }

      const nextWorkflowStatus = Number(status) >= 2 ? 'completed' : (workflow_status || work.workflow_status);

      const { rows } = await db.query(
        `UPDATE "${tableName}"
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
             support_request = COALESCE($11, support_request),
             workflow_status = $12,
             completed_at = $13,
             dies_model = COALESCE($14, dies_model),
             dies_code = COALESCE($15, dies_code),
             supplier = COALESCE($16, supplier),
             dies_hole_mm = COALESCE($17, dies_hole_mm),
             press_length_mm = COALESCE($18, press_length_mm),
             ld_ratio = COALESCE($19, ld_ratio),
             line_in_use = COALESCE($20, line_in_use),
             standard_ton = COALESCE($21, standard_ton),
             dies_life_ton = COALESCE($22, dies_life_ton),
             dies_price_vnd = COALESCE($23, dies_price_vnd),
             remaining_tons = COALESCE($24, remaining_tons),
             price_per_ton_vnd = COALESCE($25, price_per_ton_vnd),
             result_cost_per_ton_vnd = COALESCE($26, result_cost_per_ton_vnd),
             symptom = COALESCE($27, symptom),
             expected_deadline = COALESCE($28, expected_deadline),
             desired_deadline = COALESCE($29, desired_deadline),
             updated_at = NOW()
         WHERE id = $30
         RETURNING *`,
        [
          status, progress_percent, progress_comment, nextManagerComment, nextRating,
          nextHasFeedback, nextFeedbackComment,
          capex_amount, estimated_saving_per_year, payback_years,
          support_request, nextWorkflowStatus, completedAtValue,

          dies_model ?? null,
          dies_code ?? null,
          supplier ?? null,
          dies_hole_mm ?? null,
          press_length_mm ?? null,
          ld_ratio ?? null,
          line_in_use ?? null,
          standard_ton ?? null,
          dies_life_ton ?? null,
          dies_price_vnd ?? null,
          remaining_tons ?? null,
          price_per_ton_vnd ?? null,
          result_cost_per_ton_vnd ?? null,
          symptom ?? null,
          expected_deadline ?? null,
          desired_deadline ?? null,
          id,
        ],
      );

      await logActivity(req, 'UPDATE_WORK_PROGRESS', id, work, rows[0]);

      const prevWorkflowStatus = work.workflow_status;
      const newWorkflowStatus = rows[0].workflow_status;
      if (prevWorkflowStatus !== newWorkflowStatus) {
        try {
          if (newWorkflowStatus === 'in_progress') {
            await notificationService.notifyWorkInProgress(rows[0]);
          } else if (newWorkflowStatus === 'completed') {
            await notificationService.notifyWorkCompleted(rows[0]);
          }
        } catch (notifyError) {
          console.error('[works-progress-notify]', notifyError);
        }
      }

      return res.json(mapWork(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'works-progress-update');
    }
  });

  // ✅ DELETE /api/works/:id — Hỗ trợ ?type=roller
  router.delete('/api/works/:id', authMiddleware, async (req, res) => {
    try {
      const tableName = getTableName(req);
      const id = Number(req.params.id);

      const existing = await db.query(
        `SELECT * FROM "${tableName}" WHERE id = $1 AND is_deleted = false`,
        [id]
      );
      if (!existing.rows.length) return res.status(404).json({ message: 'Work not found' });

      if (!isManagerOrAdmin(req)) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa công việc này' });
      }

      const { rows } = await db.query(
        `UPDATE "${tableName}" SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING *`,
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