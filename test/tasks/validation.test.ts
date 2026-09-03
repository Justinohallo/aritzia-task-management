import { TASK_TITLE_MAX_LENGTH, persistedTaskSchema } from "@/lib/tasks/schema";
import {
  DUE_DATE_INVALID_MESSAGE,
  DUE_DATE_REQUIRED_MESSAGE,
  TITLE_REQUIRED_MESSAGE,
  TITLE_TOO_LONG_MESSAGE,
  isOverdue,
  localToday,
  validateTaskInput,
} from "@/lib/tasks/validation";

describe("validateTaskInput", () => {
  it("AC-ADD-1: accepts a title and a due date, and the value satisfies the persisted task schema", () => {
    const result = validateTaskInput({ title: "Order the lookbook", dueDate: "2026-09-10" });
    expect(result).toEqual({ ok: true, value: { title: "Order the lookbook", dueDate: "2026-09-10" } });
    if (!result.ok) throw new Error("unreachable");
    expect(
      persistedTaskSchema.safeParse({
        id: "0f1e2d3c-4b5a-4c6d-8e7f-a0b1c2d3e4f5",
        completed: false,
        createdAt: "2026-09-02T10:00:00.000Z",
        ...result.value,
      }).success,
    ).toBe(true);
  });

  it("AC-ADD-2: rejects an empty title with a message on the title field", () => {
    expect(validateTaskInput({ title: "", dueDate: "2026-09-10" })).toEqual({
      ok: false,
      errors: { title: TITLE_REQUIRED_MESSAGE },
    });
  });

  it("AC-ADD-3: rejects a missing due date with a message on the due-date field", () => {
    expect(validateTaskInput({ title: "Order the lookbook", dueDate: "" })).toEqual({
      ok: false,
      errors: { dueDate: DUE_DATE_REQUIRED_MESSAGE },
    });
  });

  it("AC-ADD-3: rejects a due date that is not a calendar day", () => {
    expect(validateTaskInput({ title: "Order the lookbook", dueDate: "10/09/2026" })).toEqual({
      ok: false,
      errors: { dueDate: DUE_DATE_INVALID_MESSAGE },
    });
  });

  it("AC-ADD-2, AC-ADD-3: reports both fields when both fail", () => {
    expect(validateTaskInput({ title: "   ", dueDate: "" })).toEqual({
      ok: false,
      errors: { title: TITLE_REQUIRED_MESSAGE, dueDate: DUE_DATE_REQUIRED_MESSAGE },
    });
  });

  it("AC-ADD-4: rejects a whitespace-only title as empty", () => {
    expect(validateTaskInput({ title: " \t\n ", dueDate: "2026-09-10" })).toEqual({
      ok: false,
      errors: { title: TITLE_REQUIRED_MESSAGE },
    });
  });

  it("AC-ADD-4: trims leading and trailing whitespace from the title", () => {
    expect(validateTaskInput({ title: "  Order the lookbook \n", dueDate: "2026-09-10" })).toEqual({
      ok: true,
      value: { title: "Order the lookbook", dueDate: "2026-09-10" },
    });
  });

  it(`AC-ADD-5: rejects a title longer than ${TASK_TITLE_MAX_LENGTH} characters with a message stating the limit`, () => {
    const result = validateTaskInput({ title: "x".repeat(TASK_TITLE_MAX_LENGTH + 1), dueDate: "2026-09-10" });
    expect(result).toEqual({ ok: false, errors: { title: TITLE_TOO_LONG_MESSAGE } });
    expect(TITLE_TOO_LONG_MESSAGE).toContain(String(TASK_TITLE_MAX_LENGTH));
  });

  it(`AC-ADD-5: accepts a title of exactly ${TASK_TITLE_MAX_LENGTH} characters`, () => {
    expect(validateTaskInput({ title: "x".repeat(TASK_TITLE_MAX_LENGTH), dueDate: "2026-09-10" }).ok).toBe(true);
  });

  it("AC-ADD-5: the bound applies after trimming", () => {
    const padded = ` ${"x".repeat(TASK_TITLE_MAX_LENGTH)} `;
    expect(validateTaskInput({ title: padded, dueDate: "2026-09-10" }).ok).toBe(true);
  });

  it("AC-ADD-7: accepts a due date in the past", () => {
    expect(validateTaskInput({ title: "Return the samples", dueDate: "2020-01-01" })).toEqual({
      ok: true,
      value: { title: "Return the samples", dueDate: "2020-01-01" },
    });
  });
});

describe("isOverdue", () => {
  it("AC-ADD-7: a due date before today is overdue", () => {
    expect(isOverdue("2026-09-01", "2026-09-02")).toBe(true);
    expect(isOverdue("2025-12-31", "2026-09-02")).toBe(true);
  });

  it("AC-ADD-7: a due date today or later is not overdue", () => {
    expect(isOverdue("2026-09-02", "2026-09-02")).toBe(false);
    expect(isOverdue("2026-09-03", "2026-09-02")).toBe(false);
  });

  it("AC-ADD-7: defaults to the local calendar day, not a UTC instant", () => {
    // 23:30 local on the 2nd. In any timezone ahead of UTC this instant is
    // already the 3rd in UTC; the local day is what counts.
    const lateEvening = new Date(2026, 8, 2, 23, 30);
    expect(localToday(lateEvening)).toBe("2026-09-02");
    expect(localToday(new Date(2026, 0, 5, 0, 15))).toBe("2026-01-05");
  });
});
