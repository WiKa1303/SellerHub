// ═══ REPO: To-Do-Modul (todo_*-Tabellen) ═══
// EINZIGE SQL-Stelle des To-Do-Moduls. Rechteprüfung passiert im Service
// (services/todo/index.js) — hier nur Queries. pg-mem-Konventionen: IDs und
// Zeitstempel kommen aus JS, keine SQL-Datums-Arithmetik, nur einfache Features.
import { db } from '../schema.js';

// ── Helfer: dynamisches UPDATE aus Feld-Whitelist ──
function buildSet(fields, allowed, startIdx) {
  const sets = [], params = [];
  let i = startIdx;
  for (const [col, val] of Object.entries(fields)) {
    if (!allowed.includes(col)) continue;
    sets.push(`${col} = $${i++}`);
    params.push(val);
  }
  return { sets, params, next: i };
}

// ═══ Ordner ═══

export async function insertFolder(f) {
  await db().query(
    `INSERT INTO todo_folders (id, owner_id, name, color, position) VALUES ($1,$2,$3,$4,$5)`,
    [f.id, f.ownerId, f.name, f.color || null, f.position || 0]);
}

export async function updateFolder(id, ownerId, fields) {
  const { sets, params, next } = buildSet(fields, ['name', 'color', 'position'], 1);
  if (!sets.length) return false;
  const r = await db().query(
    `UPDATE todo_folders SET ${sets.join(', ')} WHERE id = $${next} AND owner_id = $${next + 1}`,
    [...params, id, ownerId]);
  return r.rowCount === 1;
}

export async function deleteFolder(id, ownerId) {
  // Listen bleiben erhalten und rutschen auf oberste Ebene
  await db().query(`UPDATE todo_lists SET folder_id = NULL WHERE folder_id = $1 AND owner_id = $2`, [id, ownerId]);
  const r = await db().query(`DELETE FROM todo_folders WHERE id = $1 AND owner_id = $2`, [id, ownerId]);
  return r.rowCount === 1;
}

export async function foldersForUser(ownerId) {
  const r = await db().query(
    `SELECT id, name, color, position FROM todo_folders WHERE owner_id = $1 ORDER BY position, created_at`,
    [ownerId]);
  return r.rows;
}

// ═══ Listen & Mitglieder ═══

export async function insertList(l) {
  await db().query(
    `INSERT INTO todo_lists (id, owner_id, folder_id, name, color, icon, is_inbox, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [l.id, l.ownerId, l.folderId || null, l.name, l.color || null, l.icon || null, !!l.isInbox, l.position || 0]);
}

export async function updateList(id, fields, now) {
  const { sets, params, next } = buildSet(fields, ['name', 'color', 'icon', 'folder_id', 'position'], 1);
  if (!sets.length) return false;
  const r = await db().query(
    `UPDATE todo_lists SET ${sets.join(', ')}, updated_at = $${next} WHERE id = $${next + 1}`,
    [...params, now, id]);
  return r.rowCount === 1;
}

export async function deleteList(id) {
  const r = await db().query(`DELETE FROM todo_lists WHERE id = $1`, [id]);
  return r.rowCount === 1;
}

export async function getList(id) {
  const r = await db().query(`SELECT * FROM todo_lists WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

/** Alle Listen, auf die der Nutzer Zugriff hat (eigene + geteilte), inkl. Rolle. */
export async function listsForUser(userId) {
  const r = await db().query(
    `SELECT l.id, l.owner_id, l.folder_id, l.name, l.color, l.icon, l.is_inbox, l.position, m.role
     FROM todo_lists l JOIN todo_list_members m ON m.list_id = l.id
     WHERE m.user_id = $1 ORDER BY l.position, l.created_at`,
    [userId]);
  return r.rows;
}

export async function getInbox(userId) {
  const r = await db().query(
    `SELECT * FROM todo_lists WHERE owner_id = $1 AND is_inbox = true`, [userId]);
  return r.rows[0] || null;
}

export async function insertMember(listId, userId, role) {
  await db().query(
    `INSERT INTO todo_list_members (list_id, user_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (list_id, user_id) DO NOTHING`,
    [listId, userId, role]);
}

export async function updateMemberRole(listId, userId, role) {
  const r = await db().query(
    `UPDATE todo_list_members SET role = $3 WHERE list_id = $1 AND user_id = $2`,
    [listId, userId, role]);
  return r.rowCount === 1;
}

export async function removeMember(listId, userId) {
  const r = await db().query(
    `DELETE FROM todo_list_members WHERE list_id = $1 AND user_id = $2`, [listId, userId]);
  return r.rowCount === 1;
}

export async function listMembers(listId) {
  const r = await db().query(
    `SELECT m.user_id, m.role, u.email, u.display_name
     FROM todo_list_members m JOIN users u ON u.id = m.user_id
     WHERE m.list_id = $1 ORDER BY m.created_at`,
    [listId]);
  return r.rows;
}

export async function memberRole(listId, userId) {
  const r = await db().query(
    `SELECT role FROM todo_list_members WHERE list_id = $1 AND user_id = $2`, [listId, userId]);
  return r.rows[0] ? r.rows[0].role : null;
}

export async function memberIds(listId) {
  const r = await db().query(`SELECT user_id FROM todo_list_members WHERE list_id = $1`, [listId]);
  return r.rows.map(x => x.user_id);
}

// ═══ Aufgaben ═══

export async function insertTask(t) {
  await db().query(
    `INSERT INTO todo_tasks (id, list_id, parent_id, title, description, status, priority, starred,
       completed, due_date, due_time, repeat_rule, assigned_to, position, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [t.id, t.listId, t.parentId || null, t.title, t.description || null, t.status || 'offen',
     t.priority || 'keine', !!t.starred, !!t.completed, t.dueDate || null, t.dueTime || null,
     t.repeatRule || null, t.assignedTo || null, t.position || 0, t.createdBy]);
}

export async function getTask(id) {
  const r = await db().query(`SELECT * FROM todo_tasks WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

const TASK_COLS = ['list_id', 'parent_id', 'title', 'description', 'status', 'priority', 'starred',
  'completed', 'completed_at', 'completed_by', 'due_date', 'due_time', 'repeat_rule',
  'assigned_to', 'position', 'deleted_at'];

export async function updateTaskFields(id, fields, now) {
  const { sets, params, next } = buildSet(fields, TASK_COLS, 1);
  if (!sets.length) return false;
  const r = await db().query(
    `UPDATE todo_tasks SET ${sets.join(', ')}, updated_at = $${next} WHERE id = $${next + 1}`,
    [...params, now, id]);
  return r.rowCount === 1;
}

/**
 * Zentrale Task-Suche. listIds ist PFLICHT (Zugriffs-Scope aus dem Service).
 * since = Delta-Sync (updated_at >), inkl. gelöschter (Client räumt lokal auf).
 */
export async function queryTasks(opts) {
  const { listIds, listId, parentId, completed, search, tagId, priority, starred, status,
    assignedTo, dueFrom, dueTo, hasDue, deletedOnly, since, limit = 200, offset = 0 } = opts;
  if (!listIds || !listIds.length) return [];
  const params = [];
  const where = [];
  const idList = listIds.map(x => { params.push(x); return `$${params.length}`; });
  where.push(`t.list_id IN (${idList.join(',')})`);
  if (since) { params.push(since); where.push(`t.updated_at > $${params.length}`); }
  else if (deletedOnly) where.push(`t.deleted_at IS NOT NULL`);
  else where.push(`t.deleted_at IS NULL`);
  if (listId) { params.push(listId); where.push(`t.list_id = $${params.length}`); }
  if (parentId !== undefined) {
    if (parentId === null) where.push(`t.parent_id IS NULL`);
    else { params.push(parentId); where.push(`t.parent_id = $${params.length}`); }
  }
  if (completed !== undefined) { params.push(completed); where.push(`t.completed = $${params.length}`); }
  if (priority) { params.push(priority); where.push(`t.priority = $${params.length}`); }
  if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
  if (starred !== undefined) { params.push(starred); where.push(`t.starred = $${params.length}`); }
  if (assignedTo) { params.push(assignedTo); where.push(`t.assigned_to = $${params.length}`); }
  if (hasDue) where.push(`t.due_date IS NOT NULL`);
  if (dueFrom) { params.push(dueFrom); where.push(`t.due_date >= $${params.length}`); }
  if (dueTo) { params.push(dueTo); where.push(`t.due_date <= $${params.length}`); }
  if (search) {
    params.push('%' + String(search).toLowerCase() + '%');
    where.push(`(LOWER(t.title) LIKE $${params.length} OR LOWER(COALESCE(t.description,'')) LIKE $${params.length})`);
  }
  if (tagId) {
    params.push(tagId);
    where.push(`t.id IN (SELECT task_id FROM todo_task_tags WHERE tag_id = $${params.length})`);
  }
  params.push(limit); const pLimit = params.length;
  params.push(offset); const pOffset = params.length;
  const r = await db().query(
    `SELECT t.* FROM todo_tasks t WHERE ${where.join(' AND ')}
     ORDER BY t.completed, t.position, t.created_at
     LIMIT $${pLimit} OFFSET $${pOffset}`,
    params);
  return r.rows;
}

export async function hardDeleteTask(id) {
  // Subtasks hängen per parent_id (keine FK-Cascade) → explizit mitlöschen
  await db().query(`DELETE FROM todo_tasks WHERE parent_id = $1`, [id]);
  const r = await db().query(`DELETE FROM todo_tasks WHERE id = $1`, [id]);
  return r.rowCount === 1;
}

export async function maxTaskPosition(listId) {
  const r = await db().query(
    `SELECT MAX(position) AS m FROM todo_tasks WHERE list_id = $1`, [listId]);
  return (r.rows[0] && r.rows[0].m) || 0;
}

export async function subtaskIds(parentId) {
  const r = await db().query(`SELECT id FROM todo_tasks WHERE parent_id = $1`, [parentId]);
  return r.rows.map(x => x.id);
}

export async function openTaskCounts(listIds) {
  if (!listIds.length) return {};
  const params = listIds.slice();
  const idList = listIds.map((_, i) => `$${i + 1}`);
  const r = await db().query(
    `SELECT list_id, COUNT(*) AS n FROM todo_tasks
     WHERE list_id IN (${idList.join(',')}) AND completed = false AND deleted_at IS NULL AND parent_id IS NULL
     GROUP BY list_id`, params);
  const out = {};
  for (const row of r.rows) out[row.list_id] = parseInt(row.n, 10);
  return out;
}

/** Zähler je Task (Subtasks/Kommentare/Anhänge) für Listen-Badges — 3 GROUP-BY-Queries statt N+1. */
export async function metaCountsForTasks(taskIds) {
  const out = {};
  if (!taskIds.length) return out;
  const idList = taskIds.map((_, i) => `$${i + 1}`);
  for (const t of taskIds) out[t] = { subtasks: 0, subtasksDone: 0, comments: 0, attachments: 0 };
  const subs = await db().query(
    `SELECT parent_id AS k, COUNT(*) AS n, SUM(CASE WHEN completed THEN 1 ELSE 0 END) AS d
     FROM todo_tasks WHERE parent_id IN (${idList.join(',')}) AND deleted_at IS NULL GROUP BY parent_id`, taskIds);
  for (const r of subs.rows) { out[r.k].subtasks = parseInt(r.n, 10); out[r.k].subtasksDone = parseInt(r.d, 10) || 0; }
  const coms = await db().query(
    `SELECT task_id AS k, COUNT(*) AS n FROM todo_comments WHERE task_id IN (${idList.join(',')}) GROUP BY task_id`, taskIds);
  for (const r of coms.rows) out[r.k].comments = parseInt(r.n, 10);
  const atts = await db().query(
    `SELECT task_id AS k, COUNT(*) AS n FROM todo_attachments WHERE task_id IN (${idList.join(',')}) GROUP BY task_id`, taskIds);
  for (const r of atts.rows) out[r.k].attachments = parseInt(r.n, 10);
  return out;
}

// ═══ Checkliste ═══

export async function insertChecklistItem(c) {
  await db().query(
    `INSERT INTO todo_checklist_items (id, task_id, title, done, position) VALUES ($1,$2,$3,$4,$5)`,
    [c.id, c.taskId, c.title, !!c.done, c.position || 0]);
}

export async function updateChecklistItem(id, fields) {
  const { sets, params, next } = buildSet(fields, ['title', 'done', 'position'], 1);
  if (!sets.length) return false;
  const r = await db().query(
    `UPDATE todo_checklist_items SET ${sets.join(', ')} WHERE id = $${next}`, [...params, id]);
  return r.rowCount === 1;
}

export async function deleteChecklistItem(id) {
  const r = await db().query(`DELETE FROM todo_checklist_items WHERE id = $1`, [id]);
  return r.rowCount === 1;
}

export async function getChecklistItem(id) {
  const r = await db().query(`SELECT * FROM todo_checklist_items WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

export async function checklistForTasks(taskIds) {
  if (!taskIds.length) return [];
  const idList = taskIds.map((_, i) => `$${i + 1}`);
  const r = await db().query(
    `SELECT * FROM todo_checklist_items WHERE task_id IN (${idList.join(',')}) ORDER BY position, created_at`,
    taskIds);
  return r.rows;
}

// ═══ Tags ═══

export async function insertTag(t) {
  await db().query(
    `INSERT INTO todo_tags (id, owner_id, name, color) VALUES ($1,$2,$3,$4)`,
    [t.id, t.ownerId, t.name, t.color || null]);
}

export async function updateTag(id, ownerId, fields) {
  const { sets, params, next } = buildSet(fields, ['name', 'color'], 1);
  if (!sets.length) return false;
  const r = await db().query(
    `UPDATE todo_tags SET ${sets.join(', ')} WHERE id = $${next} AND owner_id = $${next + 1}`,
    [...params, id, ownerId]);
  return r.rowCount === 1;
}

export async function deleteTag(id, ownerId) {
  const r = await db().query(`DELETE FROM todo_tags WHERE id = $1 AND owner_id = $2`, [id, ownerId]);
  return r.rowCount === 1;
}

export async function tagsForUser(ownerId) {
  const r = await db().query(
    `SELECT id, name, color FROM todo_tags WHERE owner_id = $1 ORDER BY name`, [ownerId]);
  return r.rows;
}

export async function findTagByName(ownerId, name) {
  const r = await db().query(
    `SELECT * FROM todo_tags WHERE owner_id = $1 AND LOWER(name) = LOWER($2)`, [ownerId, name]);
  return r.rows[0] || null;
}

export async function addTaskTag(taskId, tagId) {
  await db().query(
    `INSERT INTO todo_task_tags (task_id, tag_id) VALUES ($1,$2) ON CONFLICT (task_id, tag_id) DO NOTHING`,
    [taskId, tagId]);
}

export async function removeTaskTag(taskId, tagId) {
  const r = await db().query(
    `DELETE FROM todo_task_tags WHERE task_id = $1 AND tag_id = $2`, [taskId, tagId]);
  return r.rowCount === 1;
}

export async function tagsForTasks(taskIds) {
  if (!taskIds.length) return [];
  const idList = taskIds.map((_, i) => `$${i + 1}`);
  const r = await db().query(
    `SELECT tt.task_id, g.id, g.name, g.color
     FROM todo_task_tags tt JOIN todo_tags g ON g.id = tt.tag_id
     WHERE tt.task_id IN (${idList.join(',')})`, taskIds);
  return r.rows;
}

// ═══ Kommentare ═══

export async function insertComment(c) {
  await db().query(
    `INSERT INTO todo_comments (id, task_id, user_id, body) VALUES ($1,$2,$3,$4)`,
    [c.id, c.taskId, c.userId, c.body]);
}

export async function updateComment(id, userId, body, now) {
  const r = await db().query(
    `UPDATE todo_comments SET body = $3, edited_at = $4 WHERE id = $1 AND user_id = $2`,
    [id, userId, body, now]);
  return r.rowCount === 1;
}

export async function deleteComment(id, userId) {
  const r = await db().query(
    `DELETE FROM todo_comments WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rowCount === 1;
}

export async function commentsForTask(taskId) {
  const r = await db().query(
    `SELECT c.*, u.email, u.display_name FROM todo_comments c JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1 ORDER BY c.created_at`, [taskId]);
  return r.rows;
}

// ═══ Anhänge ═══

export async function insertAttachment(a) {
  await db().query(
    `INSERT INTO todo_attachments (id, task_id, user_id, filename, mime, size_bytes, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [a.id, a.taskId, a.userId, a.filename, a.mime, a.sizeBytes, a.data]);
}

export async function attachmentsForTask(taskId) {
  const r = await db().query(
    `SELECT id, task_id, user_id, filename, mime, size_bytes, created_at
     FROM todo_attachments WHERE task_id = $1 ORDER BY created_at`, [taskId]);
  return r.rows;
}

export async function getAttachment(id) {
  const r = await db().query(`SELECT * FROM todo_attachments WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

export async function deleteAttachment(id) {
  const r = await db().query(`DELETE FROM todo_attachments WHERE id = $1`, [id]);
  return r.rowCount === 1;
}

export async function attachmentBytesForUser(userId) {
  const r = await db().query(
    `SELECT COALESCE(SUM(size_bytes),0) AS total FROM todo_attachments WHERE user_id = $1`, [userId]);
  return parseInt(r.rows[0].total, 10) || 0;
}

// ═══ Erinnerungen ═══

export async function insertReminder(rm) {
  await db().query(
    `INSERT INTO todo_reminders (id, task_id, user_id, remind_at) VALUES ($1,$2,$3,$4)`,
    [rm.id, rm.taskId, rm.userId, rm.remindAt]);
}

export async function deleteReminder(id, userId) {
  const r = await db().query(
    `DELETE FROM todo_reminders WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rowCount === 1;
}

export async function remindersForTask(taskId) {
  const r = await db().query(
    `SELECT * FROM todo_reminders WHERE task_id = $1 ORDER BY remind_at`, [taskId]);
  return r.rows;
}

/** Fällige, noch nicht gefeuerte Erinnerungen (Worker). now kommt aus JS. */
export async function dueReminders(now) {
  const r = await db().query(
    `SELECT rm.id, rm.task_id, rm.user_id, rm.remind_at, t.title, t.list_id
     FROM todo_reminders rm JOIN todo_tasks t ON t.id = rm.task_id
     WHERE rm.fired_at IS NULL AND rm.remind_at <= $1 AND t.deleted_at IS NULL AND t.completed = false`,
    [now]);
  return r.rows;
}

export async function markReminderFired(id, now) {
  await db().query(`UPDATE todo_reminders SET fired_at = $2 WHERE id = $1`, [id, now]);
}

// ═══ Activity-Log ═══

export async function insertActivity(a) {
  await db().query(
    `INSERT INTO todo_activity (id, list_id, task_id, user_id, action, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [a.id, a.listId, a.taskId || null, a.userId, a.action, a.detail || null]);
}

export async function activityFor({ listId, taskId, limit = 50 }) {
  const params = [];
  let where;
  if (taskId) { params.push(taskId); where = `a.task_id = $1`; }
  else { params.push(listId); where = `a.list_id = $1`; }
  params.push(limit);
  const r = await db().query(
    `SELECT a.*, u.email, u.display_name FROM todo_activity a JOIN users u ON u.id = a.user_id
     WHERE ${where} ORDER BY a.created_at DESC LIMIT $2`, params);
  return r.rows;
}

// ═══ Gespeicherte Filter ═══

export async function insertSavedFilter(f) {
  await db().query(
    `INSERT INTO todo_saved_filters (id, user_id, name, filter) VALUES ($1,$2,$3,$4)`,
    [f.id, f.userId, f.name, f.filter]);
}

export async function deleteSavedFilter(id, userId) {
  const r = await db().query(
    `DELETE FROM todo_saved_filters WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rowCount === 1;
}

export async function savedFiltersForUser(userId) {
  const r = await db().query(
    `SELECT id, name, filter FROM todo_saved_filters WHERE user_id = $1 ORDER BY created_at`, [userId]);
  return r.rows;
}

// ═══ Benachrichtigungen ═══

export async function insertTodoNotification(n) {
  await db().query(
    `INSERT INTO todo_notifications (id, user_id, type, payload) VALUES ($1,$2,$3,$4)`,
    [n.id, n.userId, n.type, n.payload || null]);
}

export async function todoNotificationsForUser(userId, { unreadOnly = false, limit = 50 } = {}) {
  const r = await db().query(
    `SELECT * FROM todo_notifications WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
     ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
  return r.rows;
}

export async function markTodoNotificationsRead(userId, now) {
  await db().query(
    `UPDATE todo_notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL`, [userId, now]);
}
