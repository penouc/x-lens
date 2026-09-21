import {requestBody, parseAnswers, flagged} from './classifier.js';
const ready = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
const cache = new Map();
let tail = Promise.resolve(), cooldown = 0;
async function classify(text) {
  await ready;
  const {apiKey, enabled = false, labelThreshold = 0.65} = await chrome.storage.local.get(['apiKey', 'enabled', 'labelThreshold']);
  if (!enabled || !apiKey) return {skip: true, reason: !apiKey ? '请填写 API Key 并保存' : '请勾选启用自动检测并保存'};
  if (typeof text !== 'string' || !text.trim() || text.length > 12000) throw new Error('推文文本无效或过长');
  if (Date.now() < cooldown) throw new Error('接口暂时不可用，稍后自动重试');
  let scores = cache.get(text);
  if (!scores) {
    let response;
    try {
      response = await fetch('https://api.typesafe.ai/v1/systemone', {method: 'POST', headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'}, body: JSON.stringify(requestBody(text)), signal: AbortSignal.timeout(20000), credentials: 'omit', redirect: 'error'});
    } catch { cooldown = Date.now() + 30000; throw new Error('无法连接 Jev，请检查网络后重试'); }
    if (!response.ok) {
      cooldown = Date.now() + 60000;
      throw new Error(response.status === 401 || response.status === 403 ? 'API Key 无效或无权限' : `Jev 请求失败（${response.status}），一分钟后重试`);
    }
    scores = parseAnswers(await response.json());
    cache.set(text, scores);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  await chrome.storage.local.remove('lastError');
  const threshold = Number.isFinite(labelThreshold) && labelThreshold >= 0.5 && labelThreshold <= 0.99 ? labelThreshold : 0.65;
  return {...scores, isAI: scores.ai >= threshold, isSlop: scores.junk >= threshold, isAd: scores.ad >= threshold, flagged: flagged(scores, threshold)};
}
function enqueueClassification(text) {
  const job = tail.then(() => classify(text));
  tail = job.catch(() => {});
  return job;
}
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiKey || changes.labelThreshold || changes.enabled) {
    cache.clear(); cooldown = 0;
  }
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'config') {
    ready.then(() => chrome.storage.local.get(['apiKey','enabled','autoBlockPrompt'])).then(data => reply({configured:!!data.apiKey, enabled:!!data.enabled, autoBlockPrompt:data.autoBlockPrompt === true})).catch(error => reply({error:error.message}));
    return true;
  }
  if (message?.type === 'testConnection' && !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(''))) {
    (async () => {
      await ready;
      const {apiKey} = await chrome.storage.local.get('apiKey');
      if (!apiKey) throw new Error('请先保存 API Key');
      const response = await fetch('https://api.typesafe.ai/v1/systemone', {method:'POST', headers:{Authorization:'Bearer ' + apiKey, 'Content-Type':'application/json'}, body:JSON.stringify(requestBody('Today I repaired my bicycle and rode to the library.')), signal:AbortSignal.timeout(20000), credentials:'omit', redirect:'error'});
      if (!response.ok) throw new Error('连接失败：HTTP ' + response.status + '（请检查密钥、余额及接口权限）');
      const scores = parseAnswers(await response.json());
      cooldown = 0;
      await chrome.storage.local.remove('lastError');
      return {ok:true, ...scores};
    })().then(reply).catch(error => reply({error:error.message}));
    return true;
  }
  if (message?.type !== 'classify' || !sender.tab || !/^https:\/\/(x|twitter)\.com\//.test(sender.url || '')) return;
  const job = enqueueClassification(message.text);
  job.then(reply).catch(async error => { await chrome.storage.local.set({lastError: error.message}); reply({error: error.message}); });
  return true;
});
