'use strict';
const { createRenderer } = require('./community-preview');
const crypto = require('node:crypto');
function decodeUpload(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string' || value.length > 1400000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Upload must be a JPEG image under 1 MB');
  const data = Buffer.from(value.split(',')[1], 'base64');
  if (data.length > 1024 * 1024 || data.length < 4 || data[0] !== 255 || data[1] !== 216 || data[data.length - 2] !== 255 || data[data.length - 1] !== 217) throw new Error('Invalid JPEG image');
  return data;
}
function createThumbnails(db, options = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS project_thumbnails (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    source TEXT NOT NULL, url TEXT NOT NULL, image BLOB, attempted INTEGER NOT NULL, revision TEXT NOT NULL)`);
  const renderer = options.renderer || createRenderer(), pending = new Map();
  let closed = false;
  const read = id => db.prepare('SELECT * FROM project_thumbnails WHERE project_id=?').get(id);
  function save(id, source, url, image) {
    db.prepare('INSERT OR REPLACE INTO project_thumbnails VALUES(?,?,?,?,?,?)').run(id, source, url, image, Date.now(), crypto.randomUUID());
  }
  return {
    info(p) {
      const row = read(p.id), valid = row && (row.source === 'upload' || row.url === p.url);
      return { previewUrl: p.thumbnail_url || `/api/community/v1/projects/${p.id}/thumbnail?v=${valid ? row.revision : encodeURIComponent(p.updated_at)}`,
        thumbnailSource: p.thumbnail_url ? 'url' : valid && row.source === 'upload' ? 'upload' : 'automatic' };
    },
    update(p, upload) {
      if (upload) save(p.id, 'upload', p.url, upload);
      else if (upload === null || p.thumbnail_url) db.prepare('DELETE FROM project_thumbnails WHERE project_id=?').run(p.id);
    },
    async image(p) {
      const row = read(p.id);
      if (row?.source === 'upload' || row?.url === p.url && row.image) return row.image;
      if (pending.has(p.id)) return pending.get(p.id);
      if (closed || options.enabled === false || p.thumbnail_url || row?.url === p.url && Date.now() - row.attempted < 3600000) return null;
      save(p.id, 'automatic', p.url, null);
      const revision = read(p.id).revision;
      const task = renderer.render(p.url).then(image => {
        if (closed) return null;
        const current = db.prepare('SELECT url,thumbnail_url FROM projects WHERE id=?').get(p.id);
        if (!current || current.url !== p.url || current.thumbnail_url || read(p.id)?.revision !== revision) return null;
        save(p.id, 'automatic', p.url, image); return image;
      }).catch(() => null).finally(() => pending.delete(p.id));
      pending.set(p.id, task); return task;
    },
    close() { closed = true; renderer.close(); }
  };
}
module.exports = { createThumbnails, decodeUpload };
