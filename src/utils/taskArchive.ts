import type { TaskReminder } from '../types';

function completedAtTime(task: TaskReminder) {
  return new Date(task.completedAt || task.createdAt).getTime();
}

function archivedAtTime(task: TaskReminder) {
  return new Date(task.archivedAt || task.completedAt || task.createdAt).getTime();
}

export function getActiveVisibleTasks(tasks: TaskReminder[]) {
  return tasks.filter(task => !task.isArchived && !task.isDone);
}

export function getCompletedVisibleTasks(tasks: TaskReminder[]) {
  return tasks
    .filter(task => !task.isArchived && task.isDone)
    .sort((a, b) => completedAtTime(b) - completedAtTime(a));
}

export function getArchivedTasks(tasks: TaskReminder[]) {
  return tasks
    .filter(task => task.isArchived)
    .sort((a, b) => archivedAtTime(b) - archivedAtTime(a));
}

export function getTasksToArchiveOnLogout(tasks: TaskReminder[]) {
  return tasks.filter(task => task.isDone && !task.isArchived);
}
