import { describe, expect, it } from "vitest";
import { FifoQueue, LifoStack, MinHeap } from "./frontier";

describe("FifoQueue", () => {
  it("pops in insertion order", () => {
    const q = new FifoQueue<number>();
    q.push(1);
    q.push(2);
    q.push(3);
    expect(q.shift()).toBe(1);
    expect(q.shift()).toBe(2);
    expect(q.length).toBe(1);
    expect(q.shift()).toBe(3);
    expect(q.shift()).toBeUndefined();
  });

  it("preserves order across a large number of interleaved pushes and shifts", () => {
    const q = new FifoQueue<number>();
    for (let i = 0; i < 3000; i += 1) q.push(i);
    for (let i = 0; i < 2000; i += 1) expect(q.shift()).toBe(i);
    q.push(9999);
    expect(q.length).toBe(1001);
    for (let i = 2000; i < 3000; i += 1) expect(q.shift()).toBe(i);
    expect(q.shift()).toBe(9999);
    expect(q.shift()).toBeUndefined();
  });
});

describe("LifoStack", () => {
  it("pops in reverse insertion order", () => {
    const s = new LifoStack<number>();
    s.push(1);
    s.push(2);
    s.push(3);
    expect(s.pop()).toBe(3);
    expect(s.pop()).toBe(2);
    expect(s.length).toBe(1);
    expect(s.pop()).toBe(1);
    expect(s.pop()).toBeUndefined();
  });
});

describe("MinHeap", () => {
  it("pops in ascending priority order", () => {
    const h = new MinHeap<number>((n) => n);
    for (const n of [5, 3, 8, 1, 9, 2]) h.push(n);
    const out: number[] = [];
    while (h.length > 0) out.push(h.pop() as number);
    expect(out).toEqual([1, 2, 3, 5, 8, 9]);
  });

  it("breaks ties by insertion order when priorities are equal and no tie-break is given", () => {
    const h = new MinHeap<{ id: string; p: number }>((item) => item.p);
    h.push({ id: "a", p: 1 });
    h.push({ id: "b", p: 1 });
    h.push({ id: "c", p: 1 });
    expect(h.pop()?.id).toBe("a");
    expect(h.pop()?.id).toBe("b");
    expect(h.pop()?.id).toBe("c");
  });

  it("uses a custom tie-breaker before falling back to insertion order", () => {
    const h = new MinHeap<{ id: string; p: number; tie: number }>(
      (item) => item.p,
      (a, b) => a.tie - b.tie,
    );
    h.push({ id: "a", p: 1, tie: 5 });
    h.push({ id: "b", p: 1, tie: 1 });
    h.push({ id: "c", p: 1, tie: 3 });
    expect(h.pop()?.id).toBe("b");
    expect(h.pop()?.id).toBe("c");
    expect(h.pop()?.id).toBe("a");
  });

  it("maintains the heap invariant under interleaved push/pop", () => {
    const h = new MinHeap<number>((n) => n);
    [10, 4, 15].forEach((n) => h.push(n));
    expect(h.pop()).toBe(4);
    [1, 20, 2].forEach((n) => h.push(n));
    const out: number[] = [];
    while (h.length > 0) out.push(h.pop() as number);
    expect(out).toEqual([1, 2, 10, 15, 20]);
  });
});
