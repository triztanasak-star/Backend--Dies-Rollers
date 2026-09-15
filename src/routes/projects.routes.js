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

  const mapProject = (row) => ({
    $id: String(row.id),
    id: row.id,
    project_name: row.project_name,
    description: row.description,
    manager_id: row.manager_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  // List - Admin/Manager thay tat ca; User chi thay project co task cua minh.
  router.get('/api/projects', authMiddleware, async (req, res) => {
    try {
      const { page, limit, offset } = parsePagination(req);
      const filters = ['p.is_deleted = false'];
      const params = [];

      if (!isManagerOrAdmin(req)) {
        params.push(req.user.id);
        filters.push(
          `EXISTS (SELECT 1 FROM "digital_works" dw WHERE dw.project_id = p.id AND dw.assigned_to = $${params.length})`,
        );
      }

      const whereClause = `WHERE ${filters.join(' AND ')}`;
      const countQuery = `SELECT COUNT(*)::int AS total FROM "projects" p ${whereClause}`;
      const rowsQuery = `SELECT p.* FROM "projects" p ${whereClause}
        ORDER BY p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

      const [countResult, rowsResult] = await Promise.all([
        db.query(countQuery, params),
        db.query(rowsQuery, [...params, limit, offset]),
      ]);

      return res.json({
        documents: rowsResult.rows.map(mapProject),
        total: countResult.rows[0].total,
        page,
        limit,
      });
    } catch (error) {
      return handleServerError(res, error, 'projects-list');
    }
  });

  router.get('/api/projects/:id', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await db.query('SELECT * FROM "projects" WHERE id = $1 AND is_deleted = false', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Project not found' });

      if (!isManagerOrAdmin(req)) {
        const owned = await db.query(
          'SELECT 1 FROM "digital_works" WHERE project_id = $1 AND assigned_to = $2 LIMIT 1',
          [id, req.user.id],
        );
        if (!owned.rows.length) return res.status(403).json({ message: 'No permission to view this project' });
      }

      return res.json(mapProject(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'projects-get');
    }
  });

  router.post('/api/projects', authMiddleware, requireManagerOrAdmin, async (req, res) => {
    try {
      const { project_name, description, manager_id } = req.body;
      if (!project_name) return res.status(400).json({ message: 'Missing project_name' });

      const { rows } = await db.query(
        `INSERT INTO "projects" (project_name, description, manager_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [project_name, description || null, manager_id || req.user.id],
      );

      await logActivity(req, 'CREATE_PROJECT', rows[0].id, null, rows[0]);
      return res.status(201).json(mapProject(rows[0]));
    } catch (error) {
      if (db.isForeignKeyViolation(error)) {
        return res.status(409).json({ message: 'manager_id khong hop le' });
      }
      return handleServerError(res, error, 'projects-create');
    }
  });

  router.put('/api/projects/:id', authMiddleware, requireManagerOrAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { project_name, description, manager_id, status } = req.body;
      if (status && !['active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const existing = await db.query('SELECT * FROM "projects" WHERE id = $1 AND is_deleted = false', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Project not found' });

      const { rows } = await db.query(
        `UPDATE "projects"
         SET project_name = COALESCE($1, project_name),
             description = COALESCE($2, description),
             manager_id = COALESCE($3, manager_id),
             status = COALESCE($4, status),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [project_name, description, manager_id, status, id],
      );

      await logActivity(req, 'UPDATE_PROJECT', id, existing.rows[0], rows[0]);
      return res.json(mapProject(rows[0]));
    } catch (error) {
      if (db.isForeignKeyViolation(error)) {
        return res.status(409).json({ message: 'manager_id khong hop le' });
      }
      return handleServerError(res, error, 'projects-update');
    }
  });

  router.delete('/api/projects/:id', authMiddleware, requireManagerOrAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.query('SELECT * FROM "projects" WHERE id = $1 AND is_deleted = false', [id]);
      if (!existing.rows.length) return res.status(404).json({ message: 'Project not found' });

      const { rows } = await db.query(
        'UPDATE "projects" SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id],
      );

      await logActivity(req, 'DELETE_PROJECT', id, existing.rows[0], rows[0]);
      return res.json({ success: true });
    } catch (error) {
      return handleServerError(res, error, 'projects-delete');
    }
  });

  return router;
};
