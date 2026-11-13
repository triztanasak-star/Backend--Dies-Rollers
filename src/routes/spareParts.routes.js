const express = require('express');
const statuses = ['Trong kho', 'Đang sử dụng', 'Hết tuổi thọ', 'Hư bể', 'Đang đặt'];
const lines = ['PL#1', 'PL#2', 'PL#3', 'PL#4', 'PL#5', 'FFS', 'CORN'];
const fields = ['system', 'equipment', 'specifications', 'stock_quantity', 'in_use_quantity', 'supplier', 'price_vnd', 'standard_ton', 'life_ton', 'line_in_use', 'created_at', 'image_before', 'status', 'note', 'image_after', 'execution_plans'];
const mapPart = row => ({ ...row, price_vnd: Number(row.price_vnd), standard_ton: Number(row.standard_ton), life_ton: Number(row.life_ton) });

function validate(body) {
  if (!body || typeof body !== 'object') return false;
  for (const key of ['system', 'equipment', 'specifications', 'supplier', 'image_before', 'note']) {
    if (typeof body[key] !== 'string') return false;
  }
  if (!body.system.trim() || !body.equipment.trim() || !statuses.includes(body.status)) return false;
  for (const key of ['stock_quantity', 'in_use_quantity', 'price_vnd', 'standard_ton', 'life_ton']) {
    if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < 0) return false;
  }
  if (![body.stock_quantity, body.in_use_quantity].every(v => Number.isSafeInteger(v) && v <= 2147483647)) return false;
  if (!Array.isArray(body.line_in_use) || !body.line_in_use.every(v => lines.includes(v))) return false;
  if (typeof body.created_at !== 'string' || !Number.isFinite(Date.parse(body.created_at))) return false;
  if (body.image_before && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image_before)) return false;
  if (body.image_after !== undefined && (typeof body.image_after !== 'string' || (body.image_after && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image_after)))) return false;
  if (body.execution_plans !== undefined) {
    if (!Array.isArray(body.execution_plans) || body.execution_plans.length > 500) return false;
    if (!body.execution_plans.every(plan => plan && typeof plan.id === 'string' && plan.id.length <= 100
      && typeof plan.name === 'string' && plan.name.trim().length > 0 && plan.name.length <= 2000
      && typeof plan.tons === 'number' && Number.isFinite(plan.tons) && plan.tons >= 0
      && typeof plan.due_date === 'string' && (plan.due_date === '' || (/^\d{4}-\d{2}-\d{2}$/.test(plan.due_date) && Number.isFinite(Date.parse(plan.due_date)))))) return false;
    if (new Set(body.execution_plans.map(plan => plan.id)).size !== body.execution_plans.length) return false;
  }
  return true;
}

module.exports = ({ db, authMiddleware, requireManagerOrAdmin, handleServerError, logActivity }) => {
  const router = express.Router();
  router.get('/api/spare-parts/:id/public', async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ.' });
    try {
      const { rows } = await db.query(`SELECT id, system, equipment, specifications, stock_quantity, in_use_quantity,
        supplier, price_vnd, standard_ton, life_ton, line_in_use, created_at, image_before, image_after, execution_plans
        FROM spare_parts WHERE id=$1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phụ tùng.' });
      return res.json(mapPart(rows[0]));
    } catch (error) { return handleServerError(res, error, 'spare-part-public'); }
  });
  router.use('/api/spare-parts', authMiddleware);
  router.get('/api/spare-parts', async (req, res) => {
    try {
      const { rows } = await db.query('SELECT * FROM spare_parts ORDER BY created_at DESC, id DESC');
      res.json(rows.map(mapPart));
    } catch (error) { handleServerError(res, error, 'spare-parts-list'); }
  });
  for (const method of ['post', 'put']) {
    router[method](method === 'post' ? '/api/spare-parts' : '/api/spare-parts/:id', requireManagerOrAdmin, async (req, res) => {
      if (!validate(req.body)) return res.status(400).json({ message: 'Thông tin phụ tùng không hợp lệ.' });
      if (method === 'put' && !/^\d+$/.test(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ.' });
      try {
        // Older clients may omit the new fields; preserve them on updates.
        const saveFields = fields.filter(key => method === 'post' || req.body[key] !== undefined);
        const values = saveFields.map(key => key === 'execution_plans' ? JSON.stringify(req.body[key] ?? []) : key === 'image_after' ? req.body[key] ?? '' : req.body[key]);
        const sql = method === 'post'
          ? `INSERT INTO spare_parts (${saveFields.join(',')}) VALUES (${saveFields.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`
          : `UPDATE spare_parts SET ${saveFields.map((key, i) => `${key}=$${i + 1}`).join(',')} WHERE id=$${saveFields.length + 1} RETURNING *`;
        if (method === 'put') values.push(req.params.id);
        const { rows } = await db.query(sql, values);
        if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phụ tùng.' });
        await logActivity(req, `spare-part-${method === 'post' ? 'create' : 'update'}`, rows[0].id);
        res.status(method === 'post' ? 201 : 200).json(mapPart(rows[0]));
      } catch (error) { handleServerError(res, error, 'spare-parts-save'); }
    });
  }
  router.delete('/api/spare-parts/:id', requireManagerOrAdmin, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ message: 'ID không hợp lệ.' });
    try {
      const { rows } = await db.query('DELETE FROM spare_parts WHERE id=$1 RETURNING id', [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phụ tùng.' });
      await logActivity(req, 'spare-part-delete', rows[0].id);
      res.sendStatus(204);
    } catch (error) { handleServerError(res, error, 'spare-parts-delete'); }
  });
  return router;
};
