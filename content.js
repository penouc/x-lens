(() => {
  let states = new WeakMap(), generation = 0, running = false;
  let checked = 0, hits = 0, aiHits = 0, slopHits = 0, adHits = 0;
  const monitor = document.createElement('div');
  monitor.className = 'slope-monitor'; monitor.setAttribute('role', 'status');
  document.body.append(monitor);
  function report(text) { monitor.textContent = 'X Lens · ' + text; }
  report('正在连接插件…');
  function isOwnContent(node, article) {
    if (node.closest('article') !== article) return false;
    // Timestamp anchors themselves have role=link; only inspect their containers.
    for (let parent = node.parentElement; parent && parent !== article; parent = parent.parentElement) {
      if (parent.getAttribute('data-testid') === 'quoteTweet') return false;
      if (parent.getAttribute('role') === 'link' && parent.tagName !== 'A') return false;
    }
    return true;
  }
  function read(article, allowEmpty = false) {
    const links = [...article.querySelectorAll('a[href*="/status/"]')].filter(a =>
      isOwnContent(a, article));
    const link = links.find(a => a.querySelector('time')) || links.find(a => /\/status\/\d+\/?$/.test(new URL(a.href, location.href).pathname));
    const match = link && new URL(link.href, location.href).pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
    const text = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .find(el => isOwnContent(el, article))?.innerText?.trim() || '';
    if (!match || (!allowEmpty && (!text || text.length > 12000))) return null;
    return {handle: match[1], id: match[2], text, fingerprint: match[2] + ':' + text};
  }
  function visible(el) { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
  function placeBadge(article, badge) {
    const controls = [...article.querySelectorAll('button, [role="button"]')];
    const grok = controls.find(el =>
      /grok/i.test([el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('title')].join(' '))
      && el.getBoundingClientRect().width > 0);
    const anchor = grok || article.querySelector('[data-testid="caret"]');
    badge.classList.toggle('slope-badge-anchored', !!anchor);
    if (anchor) {
      const rect = anchor.getBoundingClientRect(), outer = article.getBoundingClientRect();
      badge.style.setProperty('left', (rect.left - outer.left - article.clientLeft - 6) + 'px', 'important');
      badge.style.setProperty('top', (rect.top - outer.top - article.clientTop + rect.height / 2) + 'px', 'important');
    } else {
      badge.style.removeProperty('left'); badge.style.removeProperty('top');
    }
  }
  function mark(article, tweet, result) {
    const existing = article.querySelector('.slope-badge');
    if (existing) { placeBadge(article, existing); return; }
    const badge = document.createElement('button'); badge.className = 'slope-badge'; badge.type = 'button';
    for (const [show, text, className] of [[result.isAI, 'AI', 'slop-ai'], [result.isSlop, 'slop', 'slop-junk'], [result.isAd, '广告', 'slop-ad']]) {
      if (!show) continue;
      const label = document.createElement('span'); label.className = className; label.textContent = text; badge.append(label);
    }
    badge.title = '疑似 AI ' + Math.round(result.ai*100) + '% · 垃圾内容 ' + Math.round(result.junk*100) + '% · 广告/软广 ' + Math.round(result.ad*100) + '%；点击查看评分';
    badge.setAttribute('aria-label', badge.textContent + '，' + badge.title);
    badge.onclick = event => { event.preventDefault(); event.stopPropagation(); report(badge.title.replace('；点击查看评分', '')); };
    article.classList.add('slope-marked'); article.append(badge);
    placeBadge(article, badge);
  }
  async function scan() {
    if (running || document.hidden) return;
    running = true;
    const epoch = generation;
    try {
      const config = await chrome.runtime.sendMessage({type:'config'});
      if (epoch !== generation) return;
      if (config?.error) throw new Error(config.error);
      if (!config?.configured || !config.enabled) {
        report(!config?.configured ? '请填写 API Key 并保存' : '已暂停，请在设置中启用自动检测');
        return;
      }
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      if (!articles.length) report('已启用，等待推文加载…');
      let readable = 0, visibleCards = 0, visibleTextCards = 0;
      for (const article of articles) {
        if (epoch !== generation) break;
        if (visible(article)) {
          visibleCards++;
          if (article.querySelector('[data-testid="tweetText"]')) visibleTextCards++;
        }
        const tweet = read(article); if (!tweet) continue;
        let state = states.get(article);
        if (state?.fingerprint !== tweet.fingerprint) { article.querySelector('.slope-badge')?.remove(); article.classList.remove('slope-marked'); state = null; }
        if (!visible(article)) continue;
        readable++;
        if (state?.result?.flagged) {
          mark(article, tweet, state.result);
          continue;
        }
        if (state && Date.now() < state.retryAt) continue;
        report('正在检测… 已检查 ' + checked + ' 条 / 标记 ' + hits + ' 条');
        const result = await chrome.runtime.sendMessage({type:'classify', text:tweet.text});
        if (epoch !== generation || !article.isConnected || read(article)?.fingerprint !== tweet.fingerprint) continue;
        if (!result) throw new Error('后台未返回结果，请重新加载插件并刷新页面');
        states.set(article, {fingerprint:tweet.fingerprint, result, retryAt:result?.error || result?.skip ? Date.now()+60000 : Infinity});
        if (result.error || result.skip) { report(result.error || result.reason); break; }
        checked++; if (result.flagged) hits++; if (result.isAI) aiHits++; if (result.isSlop) slopHits++; if (result.isAd) adHits++;
        report('已检查推文/评论 ' + checked + ' 条 · AI ' + aiHits + ' / slop ' + slopHits + ' / 广告 ' + adHits + ' · 最近 AI ' + Math.round(result.ai*100) + '% / 垃圾 ' + Math.round(result.junk*100) + '%');
        if (result?.flagged) { mark(article, tweet, result); }
      }
      if (articles.length && !readable) {
        if (visibleTextCards) report('发现文字，但未能识别推文链接；请刷新页面后重试');
        else if (visibleCards) report('当前可见内容没有文字正文；图片或视频暂不检测');
        else report('等待推文进入可见区域…');
      }
    } catch(error) { report(/context invalidated/i.test(error.message) ? '插件已更新，请刷新此页面' : '连接异常：' + error.message); }
    finally { running = false; }
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type !== 'reset') return;
    checked = 0; hits = 0; aiHits = 0; slopHits = 0; adHits = 0; report('设置已更新，准备检测…');
    generation++; states = new WeakMap();
    document.querySelectorAll('.slope-badge').forEach(el => el.remove());
    document.querySelectorAll('.slope-marked').forEach(el => el.classList.remove('slope-marked'));
    scan();
  });
  window.addEventListener('resize', () => {
    document.querySelectorAll('article.slope-marked').forEach(article => {
      const badge = article.querySelector('.slope-badge');
      if (badge) placeBadge(article, badge);
    });
  });
  setInterval(scan, 1500);
  scan();
})();
