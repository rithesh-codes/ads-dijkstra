// min_heap.hpp — INDEXED BINARY MIN-HEAP (a min-priority queue with decrease-key).
//
// Items are integers 0..capacity-1 (vertex indices). Each item has a key (its tentative
// distance). The heap is a complete binary tree stored in an array:
//
//         index i  ->  parent (i-1)/2,  left child 2i+1,  right child 2i+2
//
// HEAP PROPERTY: key(parent) <= key(child) at every node, so the minimum is at heap_[0].
//
// What makes it INDEXED: pos_[item] records where each item currently sits in heap_.
// That lets us find a vertex in O(1) and lower its key in O(log n) (decreaseKey), which
// Dijkstra needs during edge relaxation. Without the index, we would either scan the
// array in O(n) or push duplicate entries ("lazy deletion", as with std::priority_queue
// or Python heapq).
//
//   operation      cost
//   push           O(log n)   append at the end, then sift up
//   pop (min)      O(log n)   move the last node to the root, then sift down
//   decreaseKey    O(log n)   lower the key, then sift up
//   top / contains O(1)
#pragma once

#include <stdexcept>
#include <utility>
#include <vector>

namespace route {

class IndexedMinHeap {
public:
    struct Node {
        int item;
        double key;
    };

    explicit IndexedMinHeap(int capacity) : pos_(capacity, -1) {}

    bool empty() const { return heap_.empty(); }
    int size() const { return static_cast<int>(heap_.size()); }
    bool contains(int item) const { return pos_.at(item) != -1; }

    // Inserts an item that is not already in the heap.
    void push(int item, double key) {
        if (contains(item)) throw std::logic_error("item already in heap");
        heap_.push_back(Node{item, key});
        pos_[item] = size() - 1;
        siftUp(size() - 1);
    }

    const Node& top() const {
        if (empty()) throw std::logic_error("top() on empty heap");
        return heap_[0];
    }

    // Removes and returns the node with the smallest key.
    Node pop() {
        if (empty()) throw std::logic_error("pop() on empty heap");
        Node minNode = heap_[0];
        swapNodes(0, size() - 1);  // move the last leaf to the root
        heap_.pop_back();
        pos_[minNode.item] = -1;
        if (!empty()) siftDown(0);  // restore the heap property going down
        return minNode;
    }

    // Lowers the key of an item already in the heap.
    void decreaseKey(int item, double newKey) {
        int i = pos_.at(item);
        if (i == -1) throw std::logic_error("decreaseKey on item not in heap");
        if (newKey > heap_[i].key) throw std::logic_error("decreaseKey would increase key");
        heap_[i].key = newKey;
        siftUp(i);  // a smaller key can only move up
    }

    // Copy of the underlying array, in heap order (used by the Algorithm Lab trace).
    const std::vector<Node>& raw() const { return heap_; }

    // Checks the heap property over the whole array (used by unit tests).
    bool isValidHeap() const {
        for (int i = 1; i < size(); ++i)
            if (heap_[(i - 1) / 2].key > heap_[i].key) return false;
        for (int i = 0; i < size(); ++i)
            if (pos_[heap_[i].item] != i) return false;
        return true;
    }

private:
    // Ties are broken by item index, so the order of pops is deterministic.
    bool less(int a, int b) const {
        if (heap_[a].key != heap_[b].key) return heap_[a].key < heap_[b].key;
        return heap_[a].item < heap_[b].item;
    }

    void swapNodes(int a, int b) {
        std::swap(heap_[a], heap_[b]);
        pos_[heap_[a].item] = a;
        pos_[heap_[b].item] = b;
    }

    void siftUp(int i) {
        while (i > 0) {
            int parent = (i - 1) / 2;
            if (!less(i, parent)) break;
            swapNodes(i, parent);
            i = parent;
        }
    }

    void siftDown(int i) {
        const int n = size();
        while (true) {
            int left = 2 * i + 1, right = 2 * i + 2, smallest = i;
            if (left < n && less(left, smallest)) smallest = left;
            if (right < n && less(right, smallest)) smallest = right;
            if (smallest == i) break;
            swapNodes(i, smallest);
            i = smallest;
        }
    }

    std::vector<Node> heap_;  // the complete binary tree, stored as an array
    std::vector<int> pos_;    // pos_[item] = index in heap_, or -1 if absent
};

}  // namespace route
