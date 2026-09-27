import { getPlatform } from './platform/index.js';
export { demoCacheId } from './demo/browserCache.js';

export const getCachedDemo = (...args) => getPlatform().cache.getCachedDemo(...args);
export const inspectCachedDemo = (...args) => (getPlatform().cache.inspectCachedDemo || getPlatform().cache.getCachedDemo)(...args);
export const getCachedDemoRound = (...args) => getPlatform().cache.getCachedDemoRound(...args);
export const countCachedDemoRounds = (...args) => getPlatform().cache.countCachedDemoRounds(...args);
export const listCachedDemos = (...args) => getPlatform().cache.listCachedDemos(...args);
export const putCachedDemo = (...args) => getPlatform().cache.putCachedDemo(...args);
export const putCachedDemoRound = (...args) => getPlatform().cache.putCachedDemoRound(...args);
export const deleteCachedDemo = (...args) => getPlatform().cache.deleteCachedDemo(...args);
