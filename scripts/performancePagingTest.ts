import assert from 'node:assert/strict';
import { clampPage, getPageCount, getPageItems } from '../src/utils/pagination.ts';

assert.equal(getPageCount(0, 100), 1);
assert.equal(getPageCount(1, 100), 1);
assert.equal(getPageCount(101, 100), 2);
assert.equal(clampPage(0, 5), 1);
assert.equal(clampPage(10, 5), 5);
assert.deepEqual(getPageItems([1, 2, 3, 4, 5], 2, 2), [3, 4]);
assert.deepEqual(getPageItems([1, 2, 3, 4, 5], 99, 2), [5]);

console.log('performancePagingTest: ok');
