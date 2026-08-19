document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.querySelector('.news-grid');
  const empty = document.querySelector('.news-empty');
  const feature = document.querySelector('.news-feature');
  if (!grid) return;

  try {
    const response = await fetch('data/news.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('news unavailable');
    const news = await response.json();

    if (!Array.isArray(news) || news.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.textContent = 'Новых публикаций пока нет.';
      return;
    }

    grid.innerHTML = news.map(item => `
      <article class="news-card" data-category="${escapeHtml(item.category)}">
        <div class="news-card-top">
          <span>${label(item.category)}</span>
          <small>${escapeHtml(item.date || '')}</small>
        </div>
        <b>${escapeHtml(item.title || '')}</b>
        <p>${escapeHtml(item.text || '')}</p>
        ${item.link ? `<a href="${safeLink(item.link)}">Открыть →</a>` : ''}
      </article>
    `).join('');

    if (feature && news[0]) {
      const item = news[0];
      feature.querySelector('.news-meta').textContent = `EPM COMMUNITY · ${item.date || ''}`;
      feature.querySelector('h2').textContent = item.title || '';
      feature.querySelector('p').textContent = item.text || '';
      const link = feature.querySelector('a');
      if (link && item.link) link.href = safeLink(item.link);
    }

    document.querySelectorAll('.news-filter button').forEach(button => {
      button.onclick = () => {
        document.querySelectorAll('.news-filter button').forEach(x => x.classList.remove('active'));
        button.classList.add('active');
        const filter = button.dataset.filter;
        document.querySelectorAll('.news-card').forEach(card => {
          card.style.display = filter === 'all' || card.dataset.category === filter ? 'flex' : 'none';
        });
      };
    });
  } catch (error) {
    console.error('EPM news:', error);
    if (empty) empty.textContent = 'Новости временно недоступны.';
  }

  function label(category) {
    return ({ forum: 'ФОРУМ', rewards: 'НАГРАДЫ', community: 'СООБЩЕСТВО' })[category] || 'EPM';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char]);
  }

  function safeLink(value) {
    const link = String(value || '');
    return /^[a-zA-Z0-9_./#-]+\.html(?:#[a-zA-Z0-9_-]+)?$/.test(link) ? link : '#';
  }
});
