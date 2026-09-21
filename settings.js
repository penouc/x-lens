const key = document.querySelector('#key'), enabled = document.querySelector('#enabled'), threshold = document.querySelector('#threshold');
const value = document.querySelector('#value'), status = document.querySelector('#status');
chrome.storage.local.get(['apiKey','enabled','labelThreshold','lastError']).then(data => { key.value = data.apiKey || ''; enabled.checked = data.enabled || false; threshold.value = Math.round((data.labelThreshold || 0.65) * 100); value.textContent = threshold.value + '%'; document.querySelector('#error').textContent = data.lastError || ''; });
threshold.addEventListener('input', () => value.textContent = threshold.value + '%');
document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault();
  if (enabled.checked && !key.value.trim()) { status.textContent = '请先填写 API Key。'; return; }
  await chrome.storage.local.set({apiKey: key.value.trim(), enabled: enabled.checked, labelThreshold: Number(threshold.value)/100});
  const tabs = await chrome.tabs.query({});
  const results = await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {type: 'reset'})));
  const connected = results.some(result => result.status === 'fulfilled');
  status.textContent = !enabled.checked ? '已保存，但自动检测处于关闭状态。请勾选后再次保存。' : connected ? '已保存并通知页面。请查看 X 右上角的运行状态。' : '已保存。请刷新 X 页面使插件生效，然后查看右上角运行状态。';
});

const testButton = document.createElement('button');
testButton.type = 'button'; testButton.textContent = '测试 Jev 连接（一次 API 请求）'; testButton.style.marginTop = '12px';
document.querySelector('form').append(testButton);
testButton.onclick = async () => {
  testButton.disabled = true; status.textContent = '正在测试已保存的密钥…';
  try {
    const result = await chrome.runtime.sendMessage({type:'testConnection'});
    status.textContent = result?.ok ? 'Jev 连接成功，已收到有效评分。' : result?.error || '后台没有响应，请重新加载插件。';
  } catch(error) { status.textContent = '连接失败：' + error.message; }
  finally { testButton.disabled = false; }
};
chrome.storage.onChanged.addListener(changes => { if (changes.lastError) document.querySelector('#error').textContent = changes.lastError.newValue || ''; });
