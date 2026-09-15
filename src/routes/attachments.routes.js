const express = require('express');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    return cb(null, true);
  },
});

const uploadToCloudinary = (file) => {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  
  // Ép kiểu resource_type thành 'raw' nếu là file PDF để tránh bị Cloudinary nhận diện nhầm thành image
  const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'auto';

  return cloudinary.uploader.upload(dataUri, {
    folder: 'digital_work/works',
    resource_type: resourceType,
    use_filename: true,
    unique_filename: true,
  });
};

module.exports = (context) => {
  const router = express.Router();
  const { db, authMiddleware, isManagerOrAdmin, handleServerError, logActivity } = context;

  const canAccessWork = async (req, workId) => {
    const { rows } = await db.query('SELECT * FROM "digital_works" WHERE id = $1 AND is_deleted = false', [workId]);
    if (!rows.length) return { ok: false, status: 404, message: 'Work not found' };
    const work = rows[0];
    const allowed = isManagerOrAdmin(req)
      || work.assigned_to === req.user.id
      || work.support_id === req.user.id
      || work.created_by === req.user.id;
    if (!allowed) return { ok: false, status: 403, message: 'No permission on this work' };
    return { ok: true, work };
  };

  const mapAttachment = (row) => ({
    $id: String(row.id),
    id: row.id,
    work_id: row.work_id,
    url: row.file_path,
    original_name: row.original_name,
    mime_type: row.mime_type,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
  });

  router.get('/api/works/:workId/attachments', authMiddleware, async (req, res) => {
    try {
      const workId = Number(req.params.workId);
      const access = await canAccessWork(req, workId);
      if (!access.ok) return res.status(access.status).json({ message: access.message });

      const { rows } = await db.query(
        'SELECT * FROM "work_attachments" WHERE work_id = $1 ORDER BY id DESC',
        [workId],
      );
      return res.json({ documents: rows.map(mapAttachment) });
    } catch (error) {
      return handleServerError(res, error, 'attachments-list');
    }
  });

  router.post('/api/works/:workId/attachments', authMiddleware, upload.array('files', 5), async (req, res) => {
    try {
      const workId = Number(req.params.workId);
      const access = await canAccessWork(req, workId);
      if (!access.ok) return res.status(access.status).json({ message: access.message });

      const files = req.files || [];
      const inserted = [];
      for (const file of files) {
        const result = await uploadToCloudinary(file);

        const { rows } = await db.query(
          `INSERT INTO "work_attachments" (work_id, file_path, public_id, resource_type, format, original_name, mime_type, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [workId, result.secure_url, result.public_id, result.resource_type, result.format, file.originalname, file.mimetype, req.user.id],
        );
        inserted.push(rows[0]);
      }

      await logActivity(req, 'UPLOAD_WORK_ATTACHMENT', workId, null, { count: inserted.length });
      return res.status(201).json({ documents: inserted.map(mapAttachment) });
    } catch (error) {
      if (error.message === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(400).json({ message: 'Chỉ hỗ trợ PDF hoặc ảnh (PNG/JPEG/WEBP)' });
      }
      return handleServerError(res, error, 'attachments-upload');
    }
  });

  router.get('/api/attachments/:id/download', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await db.query('SELECT * FROM "work_attachments" WHERE id = $1', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Attachment not found' });

      const attachment = rows[0];
      const access = await canAccessWork(req, attachment.work_id);
      if (!access.ok) return res.status(access.status).json({ message: access.message });

      const fileUrl = attachment.file_path;
      if (!fileUrl) {
        return res.status(404).json({ message: 'File not found on storage' });
      }

      // Điều hướng thẳng trình duyệt đến link Cloudinary để tải hoặc xem trực tiếp siêu mượt
      return res.redirect(fileUrl);
    } catch (error) {
      return handleServerError(res, error, 'attachments-download');
    }
  });
  router.delete('/api/attachments/:id', authMiddleware, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await db.query('SELECT * FROM "work_attachments" WHERE id = $1', [id]);
      if (!rows.length) return res.status(404).json({ message: 'Attachment not found' });

      const attachment = rows[0];
      if (!isManagerOrAdmin(req) && attachment.uploaded_by !== req.user.id) {
        return res.status(403).json({ message: 'No permission to delete this attachment' });
      }

      await db.query('DELETE FROM "work_attachments" WHERE id = $1', [id]);
      if (attachment.public_id) {
        cloudinary.uploader
          .destroy(attachment.public_id, { resource_type: attachment.resource_type || 'image' })
          .catch((error) => console.error('[attachments-cloudinary-destroy]', error));
      }

      await logActivity(req, 'DELETE_WORK_ATTACHMENT', id, attachment, null);
      return res.json({ success: true });
    } catch (error) {
      return handleServerError(res, error, 'attachments-delete');
    }
  });

  return router;
};