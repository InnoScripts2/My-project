/**
 * Priority Queue
 * Generic priority-based queue implementation
 */

interface QueueItem<T> {
  item: T;
  priority: number;
}

export class PriorityQueue<T> {
  private items: QueueItem<T>[] = [];

  /**
   * Add item with priority (higher number = higher priority)
   */
  enqueue(item: T, priority: number): void {
    const queueItem: QueueItem<T> = { item, priority };
    
    // Find insertion point
    let insertIndex = this.items.length;
    for (let i = 0; i < this.items.length; i++) {
      if (priority > this.items[i].priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.items.splice(insertIndex, 0, queueItem);
  }

  /**
   * Remove and return highest priority item
   */
  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  /**
   * View highest priority item without removing
   */
  peek(): T | undefined {
    return this.items[0]?.item;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Check if empty
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items = [];
  }

  /**
   * Update priority of existing item
   */
  updatePriority(item: T, newPriority: number): boolean {
    const index = this.items.findIndex(qi => qi.item === item);
    if (index === -1) {
      return false;
    }
    
    // Remove and re-insert
    this.items.splice(index, 1);
    this.enqueue(item, newPriority);
    return true;
  }
}
