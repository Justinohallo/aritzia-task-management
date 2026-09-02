/**
 * @jest-environment node
 */
import { readTasks, writeTasks } from "@/lib/tasks/storage";

import { makeTask } from "./fixtures";

describe("storage adapter on the server", () => {
  it("AC-STATE-6: with no window, reading is empty and writing is a reported no-op", () => {
    expect(typeof window).toBe("undefined");
    expect(readTasks()).toEqual([]);
    expect(writeTasks([makeTask()])).toBe(false);
  });
});
