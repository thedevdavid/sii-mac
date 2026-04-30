import { describe, it, expect } from "vitest";
import { classifySave, getSaveType, prettifySaveDir } from "./save-utils";

describe("classifySave", () => {
  it("labels numeric directories as Manual saves", () => {
    expect(classifySave("1")).toEqual({ label: "Save #1", type: "Manual" });
    expect(classifySave("42")).toEqual({ label: "Save #42", type: "Manual" });
  });

  it("labels autosave and autosave_job", () => {
    expect(classifySave("autosave")).toEqual({
      label: "Autosave",
      type: "Autosave",
    });
    expect(classifySave("autosave_job")).toEqual({
      label: "Autosave (Job)",
      type: "Job Autosave",
    });
  });

  it("handles numbered autosave_job_N variants", () => {
    expect(classifySave("autosave_job_2")).toEqual({
      label: "Autosave Job 2",
      type: "Job Autosave",
    });
  });

  it("handles autosave_drive and numbered variants", () => {
    expect(classifySave("autosave_drive")).toEqual({
      label: "Autosave (Drive)",
      type: "Drive Autosave",
    });
    expect(classifySave("autosave_drive_3")).toEqual({
      label: "Autosave Drive 3",
      type: "Drive Autosave",
    });
  });

  it("recognizes multiplayer backups by prefix", () => {
    expect(classifySave("multiplayer")).toEqual({
      label: "Multiplayer Backup",
      type: "Multiplayer",
    });
    expect(classifySave("multiplayer_backup_1")).toEqual({
      label: "Multiplayer Backup",
      type: "Multiplayer",
    });
  });

  it("falls back to underscore-replaced label for other names", () => {
    expect(classifySave("some_custom_save")).toEqual({
      label: "some custom save",
      type: "Other",
    });
  });
});

describe("prettifySaveDir / getSaveType wrappers", () => {
  it("return the label and type of classifySave", () => {
    expect(prettifySaveDir("autosave_job")).toBe("Autosave (Job)");
    expect(getSaveType("autosave_drive_1")).toBe("Drive Autosave");
  });
});
