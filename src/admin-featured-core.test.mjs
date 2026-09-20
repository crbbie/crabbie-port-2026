import assert from 'node:assert/strict';
import { enforceFeaturedLimit } from './admin-featured-core.js';

const portfolio = Array.from({ length: 6 }, (_, index) => ({ id: `p${index + 1}`, featured: true }));
const portfolioResult = enforceFeaturedLimit(portfolio, 'p6', 5);
assert.equal(portfolioResult.records.filter((record) => record.featured).length, 5, 'portfolio never exceeds five featured records');
assert.equal(portfolioResult.records.find((record) => record.id === 'p6').featured, true, 'the newly featured portfolio record is retained');
assert.equal(portfolioResult.evictedId, 'p5', 'the last pre-existing featured portfolio record is evicted deterministically');
assert.equal(portfolioResult.records.find((record) => record.id === 'p5').featured, false);

const assets = Array.from({ length: 9 }, (_, index) => ({ id: `a${index + 1}`, featured: true }));
const assetResult = enforceFeaturedLimit(assets, 'a9', 8);
assert.equal(assetResult.records.filter((record) => record.featured).length, 8, 'assets never exceed eight featured records');
assert.equal(assetResult.records.find((record) => record.id === 'a9').featured, true, 'the newly featured asset is retained');
assert.equal(assetResult.evictedId, 'a8', 'the last pre-existing featured asset is evicted deterministically');

const underLimit = enforceFeaturedLimit([{ id: 'one', featured: true }, { id: 'two', featured: false }], 'two', 5);
assert.equal(underLimit.evictedId, null, 'nothing is evicted when capacity remains');
assert.equal(underLimit.records.find((record) => record.id === 'two').featured, true);

console.log('Admin featured-limit core tests passed.');
