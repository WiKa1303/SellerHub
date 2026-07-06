// ═══ TODO-SERVICE: Listen, Aufgaben, Kollaboration (Modul „To-Do") ═══
// Geschäftslogik + Rechteprüfung. Erwartbare Fehler kommen als {status, error}
// zurück (Muster wie services/auth); Routen delegieren nur. Jede Mutation
// schreibt Activity und published ein SSE-Event an alle Listen-Mitglieder.
import crypto from 'node:crypto';
import {
  insertFolder, updateFolder, deleteFolder, foldersForUser,
  insertList, updateList, deleteList, getList, listsForUser, getInbox,
  insertMember, updateMemberRole, removeMember, listMembers, memberRole, memberIds,
  insertTask, getTask, updateTaskFields, queryTasks, hardDeleteTask, maxTaskPosition,
  subtaskIds, openTaskCounts, metaCountsForTasks,
  insertChecklistItem, updateChecklistItem, deleteChecklistItem, getChecklistItem, checklistForTasks,
  insertTag, updateTag, deleteTag, tagsForUser, findTagByName, addTaskTag, removeTaskTag, tagsForTasks,
  insertComment, updateComment, deleteComment, commentsForTask,
  insertAttachment, attachmentsForTask, getAttachment, deleteAttachment, attachmentBytesForUser,
  insertReminder, deleteReminder, remindersForTask, dueReminders, markReminderFired,
  insertActivity, activityFor,
  insertSavedFilter, deleteSavedFilter, savedFiltersForUser,
  insertTodoNotification, todoNotificationsForUser, markTodoNotificationsRead,
  findByEmail,
} from '../../data/db.js';
import { publish } from './hub.js';
import { log } from '../../core/logger.js';

const uuid = () => crypto.randomUUID();
const now = () => new Date();

// ── Rollenmodell: aufsteigende Rechte ──
const ROLE_RANK = { viewer: 1, commenter: 2, editor: 3, admin: 4, owner: 5 };
export const ROLES = Object.keys(ROLE_RANK);
const atLeast = (role, min) => (ROLE_RANK[role] || 0) >= ROLE_RANK[min];

const PRIORITIES = ['keine', 'niedrig', 'mittel', 'hoch', 'dringend'];
const STATUSES = ['offen', 'in_arbeit', 'wartet', 'erledigt'];

// Limits (Kostenbremse Datenbank — Anhänge liegen in Postgres)
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;   // je Datei
const MAX_ATTACHMENT_TOTAL = 50 * 1024 * 1024;  // je Nutzer
const MAX_TITLE = 500, MAX_DESC = 100_000, MAX_COMMENT = 10_000;

// ── HTML-Sanitizer für Rich-Text-Beschreibungen (Whitelist) ──
const ALLOWED_TAGS = new Set(['p', 'br', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'blockquote', 'code', 'pre', 'span', 'hr']);
export function sanitizeHtml(html) {
  if (!html) return '';
  return String(html).slice(0, MAX_DESC).replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    const close = m.startsWith('</');
    if (close) return `</${t}>`;
    // Nur href auf <a> erlauben — und nur http(s)/mailto (kein javascript:)
    if (t === 'a') {
      const hrefM = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(attrs || '');
      const href = hrefM ? (hrefM[1] || hrefM[2] || '') : '';
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        return `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">`;
      }
      return '<a>';
    }
    return `<${t}>`;
  });
}

// ── interne Helfer ──

async function requireRole(listId, userId, min) {
  const role = await memberRole(listId, userId);
  if (!role) return { status: 404, error: 'Liste nicht gefunden' };
  if (!atLeast(role, min)) return { status: 403, error: 'Keine Berechtigung für diese Aktion' };
  return { role };
}

async function accessibleListIds(userId) {
  return (await listsForUser(userId)).map(l => l.id);
}

async function logActivity(userId, listId, taskId, action, detail) {
  try {
    await insertActivity({ id: uuid(), listId, taskId, userId, action, detail: detail ? JSON.stringify(detail) : null });
  } catch (e) { log.warn('Todo-Activity fehlgeschlagen:', e.message); } // fail-soft
}

async function emit(listId, event) {
  try { publish(await memberIds(listId), { module: 'todo', ...event }); }
  catch (e) { log.warn('Todo-Event fehlgeschlagen:', e.message); }
}

function taskDto(row, extras = {}) {
  return {
    id: row.id, listId: row.list_id, parentId: row.parent_id, title: row.title,
    description: row.description, status: row.status, priority: row.priority,
    starred: row.starred, completed: row.completed, completedAt: row.completed_at,
    dueDate: row.due_date, dueTime: row.due_time, repeatRule: row.repeat_rule ? JSON.parse(row.repeat_rule) : null,
    assignedTo: row.assigned_to, position: row.position, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
    ...extras,
  };
}

/** Tasks um Tags/Checklisten-Fortschritt/Zähler anreichern (Listen-Rendering). */
async function enrichTasks(rows) {
  const ids = rows.map(r => r.id);
  const [tagRows, checkRows, counts] = await Promise.all([
    tagsForTasks(ids), checklistForTasks(ids), metaCountsForTasks(ids),
  ]);
  const tagMap = {}, checkMap = {};
  for (const t of tagRows) (tagMap[t.task_id] = tagMap[t.task_id] || []).push({ id: t.id, name: t.name, color: t.color });
  for (const c of checkRows) {
    const m = checkMap[c.task_id] = checkMap[c.task_id] || { total: 0, done: 0 };
    m.total++; if (c.done) m.done++;
  }
  return rows.map(r => taskDto(r, {
    tags: tagMap[r.id] || [],
    checklist: checkMap[r.id] || { total: 0, done: 0 },
    counts: counts[r.id] || { subtasks: 0, subtasksDone: 0, comments: 0, attachments: 0 },
  }));
}

// ═══ Bootstrap ═══

/** Einstieg des Frontends: legt beim ersten Aufruf den „Eingang" an. */
export async function bootstrap(user) {
  let inbox = await getInbox(user.id);
  if (!inbox) {
    const id = uuid();
    await insertList({ id, ownerId: user.id, name: 'Eingang', icon: '📥', isInbox: true, position: -1 });
    await insertMember(id, user.id, 'owner');
    inbox = await getList(id);
  }
  const lists = await listsForUser(user.id);
  const counts = await openTaskCounts(lists.map(l => l.id));
  // Mitglieder aller Listen einsammeln → Namens-Auflösung für Zuweisungen/Kommentare
  const people = {};
  for (const l of lists) {
    for (const m of await listMembers(l.id)) {
      people[m.user_id] = { id: m.user_id, email: m.email, name: m.display_name || m.email };
    }
  }
  return {
    inboxId: inbox.id,
    folders: await foldersForUser(user.id),
    lists: lists.map(l => ({
      id: l.id, name: l.name, color: l.color, icon: l.icon, folderId: l.folder_id,
      isInbox: l.is_inbox, position: l.position, role: l.role, ownerId: l.owner_id,
      openCount: counts[l.id] || 0,
    })),
    tags: await tagsForUser(user.id),
    savedFilters: (await savedFiltersForUser(user.id)).map(f => ({ id: f.id, name: f.name, filter: JSON.parse(f.filter) })),
    people: Object.values(people),
    limits: { attachmentMax: MAX_ATTACHMENT_BYTES, attachmentTotal: MAX_ATTACHMENT_TOTAL },
  };
}

// ═══ Ordner ═══

export async function createFolder(user, { name, color, position }) {
  if (!name || !String(name).trim()) return { status: 400, error: 'Name erforderlich' };
  const f = { id: uuid(), ownerId: user.id, name: String(name).trim().slice(0, 120), color: color || null, position: position || 0 };
  await insertFolder(f);
  return { folder: f };
}

export async function renameFolder(user, id, fields) {
  const ok = await updateFolder(id, user.id, {
    ...(fields.name !== undefined ? { name: String(fields.name).trim().slice(0, 120) } : {}),
    ...(fields.color !== undefined ? { color: fields.color } : {}),
    ...(fields.position !== undefined ? { position: fields.position } : {}),
  });
  return ok ? { ok: true } : { status: 404, error: 'Ordner nicht gefunden' };
}

export async function removeFolder(user, id) {
  const ok = await deleteFolder(id, user.id);
  return ok ? { ok: true } : { status: 404, error: 'Ordner nicht gefunden' };
}

// ═══ Listen ═══

export async function createList(user, { name, color, icon, folderId, position }) {
  if (!name || !String(name).trim()) return { status: 400, error: 'Name erforderlich' };
  const id = uuid();
  await insertList({ id, ownerId: user.id, folderId: folderId || null, name: String(name).trim().slice(0, 120), color, icon, position: position || 0 });
  await insertMember(id, user.id, 'owner');
  await logActivity(user.id, id, null, 'list.created', { name });
  const list = await getList(id);
  await emit(id, { type: 'list', action: 'created', listId: id, by: user.id });
  return { list };
}

export async function editList(user, listId, fields) {
  const perm = await requireRole(listId, user.id, 'admin');
  if (perm.error) return perm;
  const patch = {};
  if (fields.name !== undefined) patch.name = String(fields.name).trim().slice(0, 120);
  if (fields.color !== undefined) patch.color = fields.color;
  if (fields.icon !== undefined) patch.icon = fields.icon;
  if (fields.folderId !== undefined) patch.folder_id = fields.folderId;
  if (fields.position !== undefined) patch.position = fields.position;
  const ok = await updateList(listId, patch, now());
  if (!ok) return { status: 404, error: 'Liste nicht gefunden' };
  await logActivity(user.id, listId, null, 'list.updated', patch);
  await emit(listId, { type: 'list', action: 'updated', listId, by: user.id });
  return { ok: true };
}

export async function removeList(user, listId) {
  const perm = await requireRole(listId, user.id, 'owner');
  if (perm.error) return perm;
  const list = await getList(listId);
  if (list && list.is_inbox) return { status: 400, error: 'Der Eingang kann nicht gelöscht werden' };
  const members = await memberIds(listId); // vor dem Löschen einsammeln (Cascade räumt members ab)
  await deleteList(listId);
  publish(members, { module: 'todo', type: 'list', action: 'deleted', listId, by: user.id });
  return { ok: true };
}

// ═══ Mitglieder / Einladungen ═══

export async function membersOf(user, listId) {
  const perm = await requireRole(listId, user.id, 'viewer');
  if (perm.error) return perm;
  const rows = await listMembers(listId);
  return { members: rows.map(m => ({ userId: m.user_id, role: m.role, email: m.email, name: m.display_name || m.email })) };
}

export async function inviteMember(user, listId, { email, role }) {
  const perm = await requireRole(listId, user.id, 'admin');
  if (perm.error) return perm;
  if (!ROLES.includes(role) || role === 'owner') return { status: 400, error: 'Ungültige Rolle' };
  const list = await getList(listId);
  if (list.is_inbox) return { status: 400, error: 'Der Eingang kann nicht geteilt werden' };
  const target = await findByEmail(String(email || '').trim().toLowerCase());
  if (!target) return { status: 404, error: 'Kein Konto mit dieser E-Mail gefunden' };
  const existing = await memberRole(listId, target.id);
  if (existing) return { status: 409, error: 'Nutzer ist bereits Mitglied' };
  await insertMember(listId, target.id, role);
  await logActivity(user.id, listId, null, 'member.added', { email: target.email, role });
  await insertTodoNotification({
    id: uuid(), userId: target.id, type: 'list.shared',
    payload: JSON.stringify({ listId, listName: list.name, by: user.displayName || user.email }),
  });
  await emit(listId, { type: 'member', action: 'added', listId, userId: target.id, by: user.id });
  return { member: { userId: target.id, role, email: target.email, name: target.display_name || target.email } };
}

export async function changeMemberRole(user, listId, targetUserId, role) {
  const perm = await requireRole(listId, user.id, 'admin');
  if (perm.error) return perm;
  if (!ROLES.includes(role) || role === 'owner') return { status: 400, error: 'Ungültige Rolle' };
  const current = await memberRole(listId, targetUserId);
  if (!current) return { status: 404, error: 'Mitglied nicht gefunden' };
  if (current === 'owner') return { status: 400, error: 'Die Rolle des Besitzers ist fest' };
  await updateMemberRole(listId, targetUserId, role);
  await logActivity(user.id, listId, null, 'member.role', { userId: targetUserId, role });
  await emit(listId, { type: 'member', action: 'updated', listId, userId: targetUserId, by: user.id });
  return { ok: true };
}

export async function kickMember(user, listId, targetUserId) {
  const self = targetUserId === user.id;
  if (!self) {
    const perm = await requireRole(listId, user.id, 'admin');
    if (perm.error) return perm;
  }
  const current = await memberRole(listId, targetUserId);
  if (!current) return { status: 404, error: 'Mitglied nicht gefunden' };
  if (current === 'owner') return { status: 400, error: 'Der Besitzer kann die Liste nicht verlassen' };
  await removeMember(listId, targetUserId);
  await logActivity(user.id, listId, null, self ? 'member.left' : 'member.removed', { userId: targetUserId });
  await emit(listId, { type: 'member', action: 'removed', listId, userId: targetUserId, by: user.id });
  publish([targetUserId], { module: 'todo', type: 'list', action: 'deleted', listId, by: user.id }); // aus dessen Sicht weg
  return { ok: true };
}

// ═══ Aufgaben ═══

function validateTaskFields(f) {
  if (f.priority !== undefined && !PRIORITIES.includes(f.priority)) return 'Ungültige Priorität';
  if (f.status !== undefined && !STATUSES.includes(f.status)) return 'Ungültiger Status';
  if (f.dueDate !== undefined && f.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(f.dueDate)) return 'Ungültiges Datum (YYYY-MM-DD)';
  if (f.dueTime !== undefined && f.dueTime !== null && f.dueTime !== '' && !/^\d{2}:\d{2}$/.test(f.dueTime)) return 'Ungültige Uhrzeit (HH:MM)';
  if (f.repeatRule !== undefined && f.repeatRule !== null) {
    const r = f.repeatRule;
    if (!['fixed', 'after_done'].includes(r.mode) || !(r.every >= 1) || !['day', 'week', 'month', 'year'].includes(r.unit)) {
      return 'Ungültige Wiederholungsregel';
    }
  }
  return null;
}

export async function createTask(user, input) {
  const { listId, parentId, title } = input;
  if (!title || !String(title).trim()) return { status: 400, error: 'Titel erforderlich' };
  const perm = await requireRole(listId, user.id, 'editor');
  if (perm.error) return perm;
  const invalid = validateTaskFields(input);
  if (invalid) return { status: 400, error: invalid };
  if (parentId) {
    const parent = await getTask(parentId);
    if (!parent || parent.list_id !== listId) return { status: 400, error: 'Übergeordnete Aufgabe nicht in dieser Liste' };
    if (parent.parent_id) return { status: 400, error: 'Subtasks können keine eigenen Subtasks haben' };
  }
  if (input.assignedTo && !(await memberRole(listId, input.assignedTo))) {
    return { status: 400, error: 'Zuweisung nur an Listen-Mitglieder möglich' };
  }
  const t = {
    id: uuid(), listId, parentId, title: String(title).trim().slice(0, MAX_TITLE),
    description: sanitizeHtml(input.description), status: input.status, priority: input.priority,
    starred: input.starred, dueDate: input.dueDate, dueTime: input.dueTime,
    repeatRule: input.repeatRule ? JSON.stringify(input.repeatRule) : null,
    assignedTo: input.assignedTo, createdBy: user.id,
    position: input.position !== undefined ? input.position : (await maxTaskPosition(listId)) + 1,
  };
  await insertTask(t);
  await logActivity(user.id, listId, t.id, 'task.created', { title: t.title });
  if (t.assignedTo && t.assignedTo !== user.id) {
    await insertTodoNotification({
      id: uuid(), userId: t.assignedTo, type: 'task.assigned',
      payload: JSON.stringify({ taskId: t.id, title: t.title, by: user.displayName || user.email }),
    });
  }
  const row = await getTask(t.id);
  const [dto] = await enrichTasks([row]);
  await emit(listId, { type: 'task', action: 'created', listId, taskId: t.id, task: dto, by: user.id });
  return { task: dto };
}

// Wiederholung: nächstes Fälligkeitsdatum berechnen (fixed: ab bisherigem Termin, after_done: ab heute)
function nextDue(rule, fromDateStr) {
  const d = fromDateStr ? new Date(fromDateStr + 'T00:00:00Z') : new Date();
  const n = rule.every || 1;
  if (rule.unit === 'day') d.setUTCDate(d.getUTCDate() + n);
  if (rule.unit === 'week') d.setUTCDate(d.getUTCDate() + 7 * n);
  if (rule.unit === 'month') d.setUTCMonth(d.getUTCMonth() + n);
  if (rule.unit === 'year') d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

export async function updateTask(user, taskId, input) {
  const task = await getTask(taskId);
  if (!task || task.deleted_at) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  const invalid = validateTaskFields(input);
  if (invalid) return { status: 400, error: invalid };

  const patch = {}, changes = [];
  const map = {
    title: v => String(v).trim().slice(0, MAX_TITLE),
    description: v => sanitizeHtml(v),
    status: v => v, priority: v => v, starred: v => !!v,
    dueDate: v => v, dueTime: v => v, position: v => v, assignedTo: v => v,
  };
  const colOf = { title: 'title', description: 'description', status: 'status', priority: 'priority', starred: 'starred', dueDate: 'due_date', dueTime: 'due_time', position: 'position', assignedTo: 'assigned_to' };
  for (const [k, fn] of Object.entries(map)) {
    if (input[k] !== undefined) { patch[colOf[k]] = fn(input[k]); if (k !== 'position') changes.push(k); }
  }
  if (input.repeatRule !== undefined) {
    patch.repeat_rule = input.repeatRule ? JSON.stringify(input.repeatRule) : null;
    changes.push('repeatRule');
  }

  // Listen-Wechsel (Verschieben): Zielliste braucht ebenfalls editor-Recht
  if (input.listId !== undefined && input.listId !== task.list_id) {
    const permTarget = await requireRole(input.listId, user.id, 'editor');
    if (permTarget.error) return permTarget;
    patch.list_id = input.listId;
    changes.push('list');
    // Subtasks wandern mit
    for (const sid of await subtaskIds(taskId)) await updateTaskFields(sid, { list_id: input.listId }, now());
  }
  if (input.assignedTo !== undefined && input.assignedTo !== null) {
    const targetList = patch.list_id || task.list_id;
    if (!(await memberRole(targetList, input.assignedTo))) return { status: 400, error: 'Zuweisung nur an Listen-Mitglieder möglich' };
  }

  // Erledigt-Übergang
  let spawned = null;
  if (input.completed !== undefined && input.completed !== task.completed) {
    patch.completed = !!input.completed;
    patch.completed_at = input.completed ? now() : null;
    patch.completed_by = input.completed ? user.id : null;
    if (input.completed) patch.status = 'erledigt';
    else if (patch.status === undefined && task.status === 'erledigt') patch.status = 'offen';
    changes.push(input.completed ? 'completed' : 'reopened');
    // Wiederholende Aufgabe: beim Erledigen nächste Instanz erzeugen
    const rule = task.repeat_rule ? JSON.parse(task.repeat_rule) : null;
    if (input.completed && rule && !task.parent_id) {
      const due = rule.mode === 'fixed' ? nextDue(rule, task.due_date) : nextDue(rule, null);
      const copy = {
        id: uuid(), listId: task.list_id, parentId: null, title: task.title,
        description: task.description, status: 'offen', priority: task.priority,
        starred: task.starred, dueDate: due, dueTime: task.due_time,
        repeatRule: task.repeat_rule, assignedTo: task.assigned_to, createdBy: user.id,
        position: (await maxTaskPosition(task.list_id)) + 1,
      };
      await insertTask(copy);
      // Checkliste zurückgesetzt mitkopieren
      for (const c of await checklistForTasks([taskId])) {
        await insertChecklistItem({ id: uuid(), taskId: copy.id, title: c.title, done: false, position: c.position });
      }
      for (const tg of await tagsForTasks([taskId])) await addTaskTag(copy.id, tg.id);
      spawned = copy.id;
      await logActivity(user.id, task.list_id, copy.id, 'task.repeated', { title: task.title, dueDate: due });
    }
  }

  if (!Object.keys(patch).length) return { status: 400, error: 'Keine Änderungen übergeben' };
  await updateTaskFields(taskId, patch, now());
  const action = changes.includes('completed') ? 'task.completed'
    : changes.includes('reopened') ? 'task.reopened'
    : changes.includes('list') ? 'task.moved' : 'task.updated';
  if (action !== 'task.updated' || changes.length) {
    await logActivity(user.id, task.list_id, taskId, action, { title: task.title, changes });
  }
  if (input.assignedTo && input.assignedTo !== task.assigned_to && input.assignedTo !== user.id) {
    await insertTodoNotification({
      id: uuid(), userId: input.assignedTo, type: 'task.assigned',
      payload: JSON.stringify({ taskId, title: task.title, by: user.displayName || user.email }),
    });
  }
  const row = await getTask(taskId);
  const [dto] = await enrichTasks([row]);
  await emit(row.list_id, { type: 'task', action: 'updated', listId: row.list_id, taskId, task: dto, by: user.id });
  if (patch.list_id && patch.list_id !== task.list_id) {
    await emit(task.list_id, { type: 'task', action: 'moved-away', listId: task.list_id, taskId, by: user.id });
  }
  if (spawned) {
    const srow = await getTask(spawned);
    const [sdto] = await enrichTasks([srow]);
    await emit(task.list_id, { type: 'task', action: 'created', listId: task.list_id, taskId: spawned, task: sdto, by: user.id });
  }
  return { task: dto, spawnedTaskId: spawned };
}

export async function trashTask(user, taskId) {
  const task = await getTask(taskId);
  if (!task || task.deleted_at) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  const ts = now();
  await updateTaskFields(taskId, { deleted_at: ts }, ts);
  for (const sid of await subtaskIds(taskId)) await updateTaskFields(sid, { deleted_at: ts }, ts);
  await logActivity(user.id, task.list_id, taskId, 'task.deleted', { title: task.title });
  await emit(task.list_id, { type: 'task', action: 'deleted', listId: task.list_id, taskId, by: user.id });
  return { ok: true };
}

export async function restoreTask(user, taskId) {
  const task = await getTask(taskId);
  if (!task || !task.deleted_at) return { status: 404, error: 'Aufgabe nicht im Papierkorb' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  await updateTaskFields(taskId, { deleted_at: null }, now());
  for (const sid of await subtaskIds(taskId)) await updateTaskFields(sid, { deleted_at: null }, now());
  await logActivity(user.id, task.list_id, taskId, 'task.restored', { title: task.title });
  const row = await getTask(taskId);
  const [dto] = await enrichTasks([row]);
  await emit(task.list_id, { type: 'task', action: 'created', listId: task.list_id, taskId, task: dto, by: user.id });
  return { task: dto };
}

export async function purgeTask(user, taskId) {
  const task = await getTask(taskId);
  if (!task) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  await hardDeleteTask(taskId);
  await logActivity(user.id, task.list_id, null, 'task.purged', { title: task.title });
  await emit(task.list_id, { type: 'task', action: 'deleted', listId: task.list_id, taskId, by: user.id });
  return { ok: true };
}

/** Bulk-Aktionen: complete | reopen | delete | purge | restore | patch (Teilmenge der Felder). */
export async function bulkTasks(user, { ids, action, patch }) {
  if (!Array.isArray(ids) || !ids.length) return { status: 400, error: 'ids erforderlich' };
  if (ids.length > 200) return { status: 400, error: 'Maximal 200 Aufgaben je Bulk-Aktion' };
  const results = { ok: [], failed: [] };
  for (const id of ids) {
    let r;
    if (action === 'delete') r = await trashTask(user, id);
    else if (action === 'purge') r = await purgeTask(user, id);
    else if (action === 'restore') r = await restoreTask(user, id);
    else if (action === 'complete') r = await updateTask(user, id, { completed: true });
    else if (action === 'reopen') r = await updateTask(user, id, { completed: false });
    else if (action === 'patch' && patch) r = await updateTask(user, id, patch);
    else return { status: 400, error: 'Unbekannte Bulk-Aktion' };
    (r.error ? results.failed : results.ok).push(id);
  }
  return results;
}

/** Zentrale Abfrage: Smart-Lists, Filter, Suche, Delta-Sync, Papierkorb, Pagination. */
export async function listTasks(user, q) {
  let listIds;
  if (q.listId) {
    const perm = await requireRole(q.listId, user.id, 'viewer');
    if (perm.error) return perm;
    listIds = [q.listId];
  } else {
    listIds = await accessibleListIds(user.id);
  }
  const limit = Math.min(500, parseInt(q.limit || '200', 10) || 200);
  const rows = await queryTasks({
    listIds,
    parentId: q.withSubtasks ? undefined : (q.parentId || null),
    completed: q.completed === undefined ? undefined : q.completed === 'true' || q.completed === true,
    search: q.search, tagId: q.tag, priority: q.priority, status: q.status,
    starred: q.starred === undefined ? undefined : q.starred === 'true' || q.starred === true,
    assignedTo: q.assigned === 'me' ? user.id : q.assigned,
    dueFrom: q.dueFrom, dueTo: q.dueTo, hasDue: q.hasDue === 'true' || q.hasDue === true,
    deletedOnly: q.trash === 'true' || q.trash === true,
    since: q.since,
    limit: limit + 1, offset: parseInt(q.offset || '0', 10) || 0,
  });
  const hasMore = rows.length > limit;
  const tasks = await enrichTasks(rows.slice(0, limit));
  return { tasks, hasMore };
}

/** Detail einer Aufgabe inkl. Subtasks, Checkliste, Kommentare, Anhänge, Erinnerungen. */
export async function taskDetail(user, taskId) {
  const task = await getTask(taskId);
  if (!task) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'viewer');
  if (perm.error) return perm;
  const [dto] = await enrichTasks([task]);
  const subRows = await queryTasks({ listIds: [task.list_id], parentId: taskId, limit: 200 });
  const checklist = await checklistForTasks([taskId]);
  const comments = await commentsForTask(taskId);
  const attachments = await attachmentsForTask(taskId);
  const reminders = (await remindersForTask(taskId)).filter(r => r.user_id === user.id);
  return {
    task: dto,
    subtasks: await enrichTasks(subRows),
    checklist: checklist.map(c => ({ id: c.id, title: c.title, done: c.done, position: c.position })),
    comments: comments.map(c => ({ id: c.id, userId: c.user_id, name: c.display_name || c.email, body: c.body, createdAt: c.created_at, editedAt: c.edited_at })),
    attachments: attachments.map(a => ({ id: a.id, filename: a.filename, mime: a.mime, sizeBytes: a.size_bytes, userId: a.user_id, createdAt: a.created_at })),
    reminders: reminders.map(r => ({ id: r.id, remindAt: r.remind_at, firedAt: r.fired_at })),
    myRole: perm.role,
  };
}

// ═══ Checkliste ═══

export async function addChecklistItem(user, taskId, { title, position }) {
  if (!title || !String(title).trim()) return { status: 400, error: 'Titel erforderlich' };
  const task = await getTask(taskId);
  if (!task || task.deleted_at) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  const item = { id: uuid(), taskId, title: String(title).trim().slice(0, MAX_TITLE), done: false, position: position || 0 };
  await insertChecklistItem(item);
  await emit(task.list_id, { type: 'checklist', action: 'created', listId: task.list_id, taskId, by: user.id });
  return { item };
}

export async function editChecklistItem(user, itemId, fields) {
  const item = await getChecklistItem(itemId);
  if (!item) return { status: 404, error: 'Eintrag nicht gefunden' };
  const task = await getTask(item.task_id);
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  const patch = {};
  if (fields.title !== undefined) patch.title = String(fields.title).trim().slice(0, MAX_TITLE);
  if (fields.done !== undefined) patch.done = !!fields.done;
  if (fields.position !== undefined) patch.position = fields.position;
  await updateChecklistItem(itemId, patch);
  await emit(task.list_id, { type: 'checklist', action: 'updated', listId: task.list_id, taskId: task.id, by: user.id });
  return { ok: true };
}

export async function removeChecklistItem(user, itemId) {
  const item = await getChecklistItem(itemId);
  if (!item) return { status: 404, error: 'Eintrag nicht gefunden' };
  const task = await getTask(item.task_id);
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  await deleteChecklistItem(itemId);
  await emit(task.list_id, { type: 'checklist', action: 'deleted', listId: task.list_id, taskId: task.id, by: user.id });
  return { ok: true };
}

// ═══ Tags ═══

export async function createTagFor(user, { name, color }) {
  if (!name || !String(name).trim()) return { status: 400, error: 'Name erforderlich' };
  const clean = String(name).trim().slice(0, 60);
  const existing = await findTagByName(user.id, clean);
  if (existing) return { status: 409, error: 'Tag existiert bereits', tag: existing };
  const tag = { id: uuid(), ownerId: user.id, name: clean, color: color || null };
  await insertTag(tag);
  return { tag: { id: tag.id, name: tag.name, color: tag.color } };
}

export async function editTag(user, tagId, fields) {
  const ok = await updateTag(tagId, user.id, {
    ...(fields.name !== undefined ? { name: String(fields.name).trim().slice(0, 60) } : {}),
    ...(fields.color !== undefined ? { color: fields.color } : {}),
  });
  return ok ? { ok: true } : { status: 404, error: 'Tag nicht gefunden' };
}

export async function removeTag(user, tagId) {
  const ok = await deleteTag(tagId, user.id);
  return ok ? { ok: true } : { status: 404, error: 'Tag nicht gefunden' };
}

export async function tagTask(user, taskId, tagId) {
  const task = await getTask(taskId);
  if (!task || task.deleted_at) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  await addTaskTag(taskId, tagId);
  await emit(task.list_id, { type: 'task', action: 'updated', listId: task.list_id, taskId, by: user.id });
  return { ok: true };
}

export async function untagTask(user, taskId, tagId) {
  const task = await getTask(taskId);
  if (!task) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  await removeTaskTag(taskId, tagId);
  await emit(task.list_id, { type: 'task', action: 'updated', listId: task.list_id, taskId, by: user.id });
  return { ok: true };
}

// ═══ Kommentare ═══

export async function addComment(user, taskId, body) {
  if (!body || !String(body).trim()) return { status: 400, error: 'Kommentar darf nicht leer sein' };
  const task = await getTask(taskId);
  if (!task || task.deleted_at) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'commenter');
  if (perm.error) return perm;
  const c = { id: uuid(), taskId, userId: user.id, body: String(body).trim().slice(0, MAX_COMMENT) };
  await insertComment(c);
  await logActivity(user.id, task.list_id, taskId, 'comment.added', { title: task.title });
  await emit(task.list_id, { type: 'comment', action: 'created', listId: task.list_id, taskId, by: user.id });
  return { comment: { id: c.id, userId: user.id, name: user.displayName || user.email, body: c.body } };
}

export async function editComment(user, commentId, body) {
  if (!body || !String(body).trim()) return { status: 400, error: 'Kommentar darf nicht leer sein' };
  const ok = await updateComment(commentId, user.id, String(body).trim().slice(0, MAX_COMMENT), now());
  return ok ? { ok: true } : { status: 404, error: 'Kommentar nicht gefunden (nur eigene bearbeitbar)' };
}

export async function removeComment(user, commentId) {
  const ok = await deleteComment(commentId, user.id);
  return ok ? { ok: true } : { status: 404, error: 'Kommentar nicht gefunden (nur eigene löschbar)' };
}

// ═══ Anhänge ═══

export async function addAttachment(user, taskId, { filename, mime, dataBase64 }) {
  if (!filename || !dataBase64) return { status: 400, error: 'filename und dataBase64 erforderlich' };
  const task = await getTask(taskId);
  if (!task || task.deleted_at) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'editor');
  if (perm.error) return perm;
  const size = Math.floor(String(dataBase64).length * 3 / 4);
  if (size > MAX_ATTACHMENT_BYTES) return { status: 413, error: 'Datei zu groß (max. 5 MB)' };
  const used = await attachmentBytesForUser(user.id);
  if (used + size > MAX_ATTACHMENT_TOTAL) return { status: 413, error: 'Speicherkontingent für Anhänge erschöpft (50 MB)' };
  const a = {
    id: uuid(), taskId, userId: user.id,
    filename: String(filename).slice(0, 200),
    mime: String(mime || 'application/octet-stream').slice(0, 100),
    sizeBytes: size, data: dataBase64,
  };
  await insertAttachment(a);
  await logActivity(user.id, task.list_id, taskId, 'attachment.added', { filename: a.filename });
  await emit(task.list_id, { type: 'attachment', action: 'created', listId: task.list_id, taskId, by: user.id });
  return { attachment: { id: a.id, filename: a.filename, mime: a.mime, sizeBytes: size } };
}

export async function downloadAttachment(user, attachmentId) {
  const a = await getAttachment(attachmentId);
  if (!a) return { status: 404, error: 'Anhang nicht gefunden' };
  const task = await getTask(a.task_id);
  const perm = await requireRole(task.list_id, user.id, 'viewer');
  if (perm.error) return perm;
  return { filename: a.filename, mime: a.mime, buffer: Buffer.from(a.data, 'base64') };
}

export async function removeAttachment(user, attachmentId) {
  const a = await getAttachment(attachmentId);
  if (!a) return { status: 404, error: 'Anhang nicht gefunden' };
  const task = await getTask(a.task_id);
  const min = a.user_id === user.id ? 'editor' : 'admin'; // fremde Anhänge nur als Admin
  const perm = await requireRole(task.list_id, user.id, min);
  if (perm.error) return perm;
  await deleteAttachment(attachmentId);
  await emit(task.list_id, { type: 'attachment', action: 'deleted', listId: task.list_id, taskId: task.id, by: user.id });
  return { ok: true };
}

// ═══ Erinnerungen ═══

export async function addReminder(user, taskId, remindAtIso) {
  const ts = new Date(remindAtIso);
  if (isNaN(ts.getTime())) return { status: 400, error: 'Ungültiger Zeitpunkt' };
  const task = await getTask(taskId);
  if (!task || task.deleted_at) return { status: 404, error: 'Aufgabe nicht gefunden' };
  const perm = await requireRole(task.list_id, user.id, 'viewer'); // Erinnerung ist persönlich
  if (perm.error) return perm;
  const r = { id: uuid(), taskId, userId: user.id, remindAt: ts };
  await insertReminder(r);
  return { reminder: { id: r.id, remindAt: ts.toISOString() } };
}

export async function removeReminder(user, reminderId) {
  const ok = await deleteReminder(reminderId, user.id);
  return ok ? { ok: true } : { status: 404, error: 'Erinnerung nicht gefunden' };
}

/** Worker-Lauf: fällige Erinnerungen als Notification + SSE zustellen. */
export const reminderState = { lastRun: null, fired: 0 };
export async function fireDueReminders() {
  const due = await dueReminders(now());
  for (const r of due) {
    await insertTodoNotification({
      id: uuid(), userId: r.user_id, type: 'reminder',
      payload: JSON.stringify({ taskId: r.task_id, title: r.title, remindAt: r.remind_at }),
    });
    publish([r.user_id], { module: 'todo', type: 'reminder', taskId: r.task_id, title: r.title, listId: r.list_id });
    await markReminderFired(r.id, now());
    reminderState.fired++;
  }
  reminderState.lastRun = new Date().toISOString();
  return due.length;
}

// ═══ Activity, Filter, Benachrichtigungen ═══

export async function activityLog(user, { listId, taskId, limit }) {
  let lid = listId;
  if (taskId) {
    const task = await getTask(taskId);
    if (!task) return { status: 404, error: 'Aufgabe nicht gefunden' };
    lid = task.list_id;
  }
  const perm = await requireRole(lid, user.id, 'viewer');
  if (perm.error) return perm;
  const rows = await activityFor({ listId: lid, taskId, limit: Math.min(200, limit || 50) });
  return {
    items: rows.map(a => ({
      id: a.id, taskId: a.task_id, action: a.action,
      detail: a.detail ? JSON.parse(a.detail) : null,
      by: a.display_name || a.email, createdAt: a.created_at,
    })),
  };
}

export async function saveFilter(user, { name, filter }) {
  if (!name || !filter) return { status: 400, error: 'name und filter erforderlich' };
  const f = { id: uuid(), userId: user.id, name: String(name).trim().slice(0, 80), filter: JSON.stringify(filter) };
  await insertSavedFilter(f);
  return { filter: { id: f.id, name: f.name, filter } };
}

export async function removeSavedFilter(user, id) {
  const ok = await deleteSavedFilter(id, user.id);
  return ok ? { ok: true } : { status: 404, error: 'Filter nicht gefunden' };
}

export async function myNotifications(user, { unreadOnly } = {}) {
  const rows = await todoNotificationsForUser(user.id, { unreadOnly: !!unreadOnly });
  return {
    items: rows.map(n => ({
      id: n.id, type: n.type, payload: n.payload ? JSON.parse(n.payload) : null,
      readAt: n.read_at, createdAt: n.created_at,
    })),
  };
}

export async function markNotificationsRead(user) {
  await markTodoNotificationsRead(user.id, now());
  return { ok: true };
}
