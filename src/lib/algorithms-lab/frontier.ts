/**
 * Small, generic frontier data structures for the Algorithms Lab's search engine.
 * Written fresh here (rather than reusing the production solver's private PriorityFrontier
 * in src/lib/solver/solver.ts) so that file stays completely untouched.
 */

export class FifoQueue<T> {
  private items: T[] = [];
  private head = 0;

  push(item: T): void {
    this.items.push(item);
  }

  shift(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const item = this.items[this.head];
    this.items[this.head] = undefined as unknown as T;
    this.head += 1;
    // Reclaim memory once the consumed prefix dominates the array.
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }

  get length(): number {
    return this.items.length - this.head;
  }
}

export class LifoStack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  get length(): number {
    return this.items.length;
  }
}

/**
 * Binary min-heap ordered by `priorityOf(item)`, with an optional tie-breaker for equal
 * priorities (defaults to insertion order, i.e. stable FIFO among ties).
 */
export class MinHeap<T> {
  private heap: T[] = [];
  private seqCounter = 0;
  private seqs: number[] = [];

  constructor(
    private readonly priorityOf: (item: T) => number,
    private readonly tieBreak?: (a: T, b: T) => number,
  ) {}

  get length(): number {
    return this.heap.length;
  }

  push(item: T): void {
    this.heap.push(item);
    this.seqs.push(this.seqCounter++);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    const first = this.heap[0];
    const lastItem = this.heap.pop();
    const lastSeq = this.seqs.pop();
    if (first === undefined || lastItem === undefined) return first;
    if (this.heap.length > 0) {
      this.heap[0] = lastItem;
      this.seqs[0] = lastSeq as number;
      this.bubbleDown(0);
    }
    return first;
  }

  private isBefore(i: number, j: number): boolean {
    const a = this.heap[i];
    const b = this.heap[j];
    const pa = this.priorityOf(a);
    const pb = this.priorityOf(b);
    if (pa !== pb) return pa < pb;
    if (this.tieBreak) {
      const t = this.tieBreak(a, b);
      if (t !== 0) return t < 0;
    }
    return this.seqs[i] < this.seqs[j];
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    [this.seqs[i], this.seqs[j]] = [this.seqs[j], this.seqs[i]];
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (!this.isBefore(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let best = i;
      if (left < this.heap.length && this.isBefore(left, best)) best = left;
      if (right < this.heap.length && this.isBefore(right, best)) best = right;
      if (best === i) break;
      this.swap(i, best);
      i = best;
    }
  }
}
