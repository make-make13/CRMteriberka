import {
  getArchivedTasks,
  getCompletedVisibleTasks,
  getTasksToArchiveOnLogout,
} from '../src/utils/taskArchive';
import type { TaskReminder } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const baseTask: TaskReminder = {
  id: 'base',
  title: 'Base',
  remindAt: new Date('2026-05-06T10:00:00.000Z').toISOString(),
  isDone: false,
  createdBy: 'Codex',
  createdAt: new Date('2026-05-06T09:00:00.000Z').toISOString(),
};

const activeTask: TaskReminder = { ...baseTask, id: 'active', title: 'Active' };
const completedTask: TaskReminder = {
  ...baseTask,
  id: 'done',
  title: 'Done',
  isDone: true,
  completedAt: new Date('2026-05-06T11:00:00.000Z').toISOString(),
};
const archivedTask: TaskReminder = {
  ...baseTask,
  id: 'archived',
  title: 'Archived',
  isDone: true,
  completedAt: new Date('2026-05-06T11:00:00.000Z').toISOString(),
  isArchived: true,
  archivedAt: new Date('2026-05-06T12:00:00.000Z').toISOString(),
};

const tasks = [activeTask, completedTask, archivedTask];

assert(getCompletedVisibleTasks(tasks).map(task => task.id).join(',') === 'done', 'Only completed non-archived tasks are visible before logout');
assert(getArchivedTasks(tasks).map(task => task.id).join(',') === 'archived', 'Archived tasks are separated from visible completed tasks');
assert(getTasksToArchiveOnLogout(tasks).map(task => task.id).join(',') === 'done', 'Only completed non-archived tasks are archived on logout');

console.log('Task archive tests passed.');
