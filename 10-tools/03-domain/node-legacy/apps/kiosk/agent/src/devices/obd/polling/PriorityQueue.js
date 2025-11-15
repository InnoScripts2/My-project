/**
 * Priority Queue
 * Generic priority-based queue implementation
 */
export class PriorityQueue {
    items = [];
    /**
     * Add item with priority (higher number = higher priority)
     */
    enqueue(item, priority) {
        const queueItem = { item, priority };
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
    dequeue() {
        return this.items.shift()?.item;
    }
    /**
     * View highest priority item without removing
     */
    peek() {
        return this.items[0]?.item;
    }
    /**
     * Get queue size
     */
    size() {
        return this.items.length;
    }
    /**
     * Check if empty
     */
    isEmpty() {
        return this.items.length === 0;
    }
    /**
     * Clear all items
     */
    clear() {
        this.items = [];
    }
    /**
     * Update priority of existing item
     */
    updatePriority(item, newPriority) {
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
