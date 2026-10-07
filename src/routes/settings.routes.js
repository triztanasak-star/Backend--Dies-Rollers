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

  const mapSetting = (row) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    press_length_mm: row.press_length_mm ?? null,
    standard_ton: row.standard_ton !== null && row.standard_ton !== undefined
      ? Number(row.standard_ton) : null,
    dies_model: row.dies_model ?? null,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  });

  // GET all settings
  router.get('/api/settings', authMiddleware, async (req, res) => {
    try {
      const { rows } = await db.query(
        'SELECT * FROM "app_settings" ORDER BY dies_model NULLS FIRST, press_length_mm NULLS FIRST, key ASC'
      );
      return res.json({ documents: rows.map(mapSetting) });
    } catch (error) {
      return handleServerError(res, error, 'settings-list');
    }
  });

  // GET one setting by key
  router.get('/api/settings/:key', authMiddleware, async (req, res) => {
    try {
      const { rows } = await db.query(
        'SELECT * FROM "app_settings" WHERE key = $1',
        [req.params.key]
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'Setting not found' });
      }
      return res.json(mapSetting(rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'settings-get');
    }
  });

  // PUT update or insert setting
  router.put('/api/settings/:key', authMiddleware, async (req, res) => {
    try {
      if (!isManagerOrAdmin(req)) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa cấu hình' });
      }

      const { value, description, press_length_mm, standard_ton, dies_model } = req.body;
      if (value === undefined || value === null || value === '') {
        return res.status(400).json({ message: 'Missing value' });
      }

      const existing = await db.query(
        'SELECT * FROM "app_settings" WHERE key = $1',
        [req.params.key]
      );

      let result;
      if (existing.rows.length) {
        result = await db.query(
          `UPDATE "app_settings"
           SET value = $1,
               description = COALESCE($2, description),
               press_length_mm = COALESCE($3, press_length_mm),
               standard_ton = COALESCE($4, standard_ton),
               dies_model = COALESCE($5, dies_model),
               updated_at = NOW(),
               updated_by = $6
           WHERE key = $7
           RETURNING *`,
          [
            String(value),
            description ?? null,
            press_length_mm ?? null,
            standard_ton ?? null,
            dies_model ?? null,
            req.user.id,
            req.params.key,
          ]
        );
        await logActivity(req, 'UPDATE_SETTING', null, existing.rows[0], result.rows[0]);
      } else {
        result = await db.query(
          `INSERT INTO "app_settings" 
             (key, value, description, press_length_mm, standard_ton, dies_model, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            req.params.key,
            String(value),
            description ?? null,
            press_length_mm ?? null,
            standard_ton ?? null,
            dies_model ?? null,
            req.user.id,
          ]
        );
        await logActivity(req, 'CREATE_SETTING', null, null, result.rows[0]);
      }

      return res.json(mapSetting(result.rows[0]));
    } catch (error) {
      return handleServerError(res, error, 'settings-update');
    }
  });

  // DELETE setting by key
  router.delete('/api/settings/:key', authMiddleware, async (req, res) => {
    try {
      if (!isManagerOrAdmin(req)) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa cấu hình' });
      }

      const existing = await db.query(
        'SELECT * FROM "app_settings" WHERE key = $1',
        [req.params.key]
      );
      if (!existing.rows.length) {
        return res.status(404).json({ message: 'Setting not found' });
      }

      await db.query('DELETE FROM "app_settings" WHERE key = $1', [req.params.key]);
      await logActivity(req, 'DELETE_SETTING', null, existing.rows[0], null);

      return res.json({ success: true });
    } catch (error) {
      return handleServerError(res, error, 'settings-delete');
    }
  });

  return router;
};