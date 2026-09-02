/**
 * @jest-environment node
 */
import { readTasks, writeTasks } from "@/lib/tasks/storage";
import type { Task } from "@/types/task";

/** A valid task; override fields per case. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "0f1e2d3c-4b5a-4c6d-8e7f-a0b1c2d3e4f5",
    title: "Write the reducer tests",
    dueDate: "2026-09-03",
    completed: false,
    createdAt: "2026-09-02T10:00:00.000Z",
    sync: "confirmed",
    ...overrides,
  };
}

describe("storage adapter on the server", () => {
  it("AC-STATE-6: with no window, reading is empty and writing is a reported no-op", () => {
    expect(typeof window).toBe("undefined");
    expect(readTasks()).toEqual([]);
    expect(writeTasks([makeTask()])).toBe(false);
  });
});
