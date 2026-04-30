import { describe, it, expect } from "vitest";
import {
  initialProgress,
  reduceProgress,
  type ProgressEvent,
  type ProgressSnapshot,
} from "./streaming";

describe("reduceProgress", () => {
  it("transitions idle → running on started", () => {
    const started: ProgressEvent = {
      event: "started",
      data: { total: 10, label: "Copying" },
    };
    const next = reduceProgress(initialProgress, started);
    expect(next).toEqual({
      status: "running",
      label: "Copying",
      current: 0,
      total: 10,
    });
  });

  it("updates running current/total on progress", () => {
    const started: ProgressSnapshot = {
      status: "running",
      label: "Copying",
      current: 0,
      total: 100,
    };
    const next = reduceProgress(started, {
      event: "progress",
      data: { current: 42, total: 100, label: "file.txt" },
    });
    expect(next).toEqual({
      status: "running",
      label: "file.txt",
      current: 42,
      total: 100,
    });
  });

  it("transitions to completed carrying message plus running base", () => {
    const base: ProgressSnapshot = {
      status: "running",
      label: "Copying",
      current: 50,
      total: 100,
    };
    const next = reduceProgress(base, {
      event: "completed",
      data: { message: "Done" },
    });
    expect(next).toEqual({
      status: "completed",
      label: "Copying",
      current: 50,
      total: 100,
      message: "Done",
    });
  });

  it("transitions to failed carrying error plus running base", () => {
    const base: ProgressSnapshot = {
      status: "running",
      label: "Copying",
      current: 3,
      total: 5,
    };
    const next = reduceProgress(base, {
      event: "failed",
      data: { error: "boom" },
    });
    expect(next).toEqual({
      status: "failed",
      label: "Copying",
      current: 3,
      total: 5,
      error: "boom",
    });
  });

  it("transitions to cancelled carrying running base", () => {
    const base: ProgressSnapshot = {
      status: "running",
      label: "Copying",
      current: 3,
      total: 5,
    };
    const next = reduceProgress(base, { event: "cancelled" });
    expect(next).toEqual({
      status: "cancelled",
      label: "Copying",
      current: 3,
      total: 5,
    });
  });

  it("handles completed when no prior running state exists", () => {
    const next = reduceProgress(initialProgress, {
      event: "completed",
      data: { message: "OK" },
    });
    expect(next).toEqual({
      status: "completed",
      label: "",
      current: 0,
      total: null,
      message: "OK",
    });
  });
});
