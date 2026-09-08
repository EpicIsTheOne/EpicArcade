(() => {
  'use strict';
  const app = document.getElementById('app');
  const dialogRoot = document.getElementById('dialogRoot');
  const toasts = document.getElementById('toastRegion');
  const state = { catalog: { models: [], harnesses: [], tags: [] }, user: null, csrf: '', request: 0 };
  let modalClosed = null;
  const node = (tag, attributes = {}, ...children) => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'text') element.textContent = value;
      else if (key === 'class') element.className = value;
      else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== false && value !== null && value !== undefined) element.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined && child !== false && child !== 0) element.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return element;
  };
  const label = (type, id) => state.catalog[type].find(item => item.id === id)?.label || id;
  const date = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const link = (href, text, className = '') => node('a', { href, text, class: className });
  const button = (text, action, className = 'button button-quiet') => node('button', { type: 'button', class: className, text, onclick: action });
  const safeAction = action => async event => { try { await action(event); } catch (error) { notify(error.message, true); } };
  const routeUrl = (kind, id) => `/Community/${kind}/${encodeURIComponent(id)}`;
  const external = (url, text, className = '') => node('a', { href: url, text, class: className, target: '_blank', rel: 'noopener noreferrer' });
  const initials = creator => (creator.displayName || creator.username).split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  function notify(message, error = false) {
    const toast = node('div', { class: `toast${error ? ' error' : ''}`, text: message });
    toasts.append(toast); setTimeout(() => toast.remove(), 5500);
  }
  async function api(route, method = 'GET', body, extraHeaders = {}) {
    const headers = { Accept: 'application/json', ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    const response = await fetch('/api/community/v1' + route, { method, headers, credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(result.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return result;
  }
  function layout(...children) {
    app.replaceChildren(node('div', { class: 'wrap' }, ...children));
    document.getElementById('accountButton').textContent = state.user ? initials(state.user) : '↗';
    document.getElementById('accountButton').setAttribute('aria-label', state.user ? 'Your account' : 'Sign in');
  }
  function heading(kicker, title, copy) {
    return node('div', { class: 'page-heading' }, node('div', { class: 'kicker', text: kicker }), node('h1', { text: title }), copy && node('p', { class: 'detail-lede', text: copy }));
  }
  function empty(title, copy, publish = false) {
    return node('div', { class: 'empty-state' }, node('div', { class: 'empty-orbit', 'aria-hidden': 'true' }),
      node('h3', { text: title }), node('p', { text: copy }), publish && link('/Community/publish', 'Publish a project', 'button'));
  }
  function loading() { return node('div', { class: 'loading-screen', role: 'status' }, node('span', { class: 'spinner' }), 'Loading…'); }
  function navigate(url) { history.pushState({}, '', url); render(); window.scrollTo(0, 0); }

  function art(project, className = 'card-art') {
    const surface = node('div', { class: className, 'aria-hidden': 'true' });
    let hash = 0;
    for (const char of project.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    surface.dataset.palette = hash % 5;
    surface.append(node('span', { class: 'art-orbit' }), node('span', { class: 'art-mark', text: (project.tags?.[0] || 'BUILD').toUpperCase() }));
    if (project.previewUrl || project.thumbnailUrl) {
      const image = node('img', { src: project.previewUrl || project.thumbnailUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      image.addEventListener('error', () => image.remove()); surface.append(image);
    }
    return surface;
  }
  function projectCard(project) {
    // Keep construction explicit rather than extending DOM prototypes.
    const artLink = node('a', { class: 'card-art-link', href: routeUrl('projects', project.slug), 'aria-label': 'View ' + project.name }, art(project));
    return node('article', { class: 'project-card' }, artLink,
      node('div', { class: 'card-body' }, node('div', { class: 'card-eyebrow' },
        project.featured && node('span', { text: '✦ Featured' }), project.visibility === 'unlisted' && node('span', { text: 'Unlisted' }),
        project.moderation === 'hidden' && node('span', { text: 'Hidden by moderator' })),
        link(routeUrl('projects', project.slug), project.name, 'card-title'),
        project.description && node('p', { class: 'card-desc', text: project.description }),
        node('div', { class: 'chips' }, project.models.slice(0, 2).map(id => link(routeUrl('models', id), label('models', id), 'chip cyan')),
          project.models.length > 2 && node('span', { class: 'chip', text: `+${project.models.length - 2}` }),
          project.tags.slice(0, 2).map(id => link('/Community/?tag=' + encodeURIComponent(id), label('tags', id), 'chip'))),
        node('div', { class: 'card-meta' }, link(routeUrl('creators', project.creator.username), '@' + project.creator.username),
          node('span', { text: `♡ ${project.likes} · ${project.views} views` })),
        node('div', { class: 'publication-label', text: project.publication.method === 'agent' ? 'API published' : 'Manually published' })));
  }
  function picker(items, chosen, { title, name, custom = false, onchange = () => {} }) {
    const selected = new Set(chosen || []), options = [...items];
    for (const id of selected) if (!options.some(item => item.id === id)) options.push({ id, label: id });
    const search = node('input', { type: 'search', placeholder: `Search ${title.toLowerCase()}…`, 'aria-label': `Search ${title.toLowerCase()}` });
    const chips = node('div', { class: 'selected-chips' }), choices = node('div', { class: 'picker-options' });
    const hidden = node('div', { hidden: true });
    const add = button('Add custom model', () => {
      const value = search.value.trim();
      if (!value || value.length > 120 || !/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+\-]*$/.test(value)) return notify('Use a model name or identifier, up to 120 characters.', true);
      if (!options.some(item => item.id === value)) options.push({ id: value, label: value });
      selected.add(value); search.value = ''; draw(); update();
    }, 'button button-small button-quiet');
    add.hidden = true;
    function update() {
      chips.replaceChildren(...[...selected].map(id => button((options.find(item => item.id === id)?.label || id) + ' ×', () => {
        selected.delete(id); draw(); update();
      }, 'chip selected-chip')));
      hidden.replaceChildren(...[...selected].map(id => node('input', { type: 'hidden', name, value: id })));
      onchange([...selected]);
    }
    function draw() {
      const query = search.value.trim().toLowerCase();
      const results = options.filter(item => (item.label + ' ' + item.id).toLowerCase().includes(query));
      choices.replaceChildren(...results.map(item => {
        const input = node('input', { type: 'checkbox', value: item.id, checked: selected.has(item.id) });
        input.addEventListener('change', () => {
          if (input.checked && selected.size >= 8) { input.checked = false; return notify('Choose up to eight.', true); }
          input.checked ? selected.add(item.id) : selected.delete(item.id); update();
        });
        return node('label', { class: 'picker-option' }, input, node('span', { text: item.label }));
      }));
      if (!results.length) choices.append(node('p', { class: 'form-note', text: 'No matches.' }));
      add.hidden = !custom || !query || options.some(item => item.id.toLowerCase() === query);
      add.textContent = `Use “${search.value.trim()}”`;
    }
    search.addEventListener('input', draw);
    const element = node('fieldset', { class: 'model-picker' }, node('legend', { text: title }), chips, search, choices, add, hidden);
    element.values = () => [...selected];
    element.setValues = values => {
      selected.clear(); for (const value of values) { selected.add(value); if (!options.some(item => item.id === value)) options.push({ id: value, label: value }); }
      draw(); update();
    };
    draw(); update(); return element;
  }
  function selectField(title, name, items, value = '') {
    const input = node('select', { name, id: name }, items.map(item => node('option', { value: item.id, text: item.label })));
    input.value = value;
    return node('div', { class: 'form-field' }, node('label', { for: name, text: title }), input);
  }
  function field(title, name, { type = 'text', required = false, placeholder = '', value = '', max = 2048 } = {}) {
    const input = node(type === 'textarea' ? 'textarea' : 'input', { name, id: name, ...(type !== 'textarea' ? { type } : {}),
      required, placeholder, maxlength: max, ...(type !== 'textarea' ? { value } : {}) });
    if (type === 'textarea') input.value = value;
    return node('div', { class: 'form-field' }, node('label', { for: name, text: title + (required ? ' *' : '') }), input);
  }

  async function browse(modelId = null) {
    const params = new URLSearchParams(location.search);
    const filter = { creator: params.get('creator') || '', search: params.get('search') || '', models: modelId ? [modelId] : (params.get('models') || '').split(',').filter(Boolean),
      tag: params.get('tag') || '', harness: params.get('harness') || '', sort: params.get('sort') || 'new' };
    let items = [], total = 0, timer;
    const search = node('input', { id: 'projectSearch', type: 'search', value: filter.search, placeholder: 'Search projects, creators, or tags…', 'aria-label': 'Search community projects' });
    const filters = node('details', { class: 'browse-filters', open: !!(filter.models.length || filter.tag || filter.harness) },
      node('summary', { text: 'Filters' }));
    const models = picker(state.catalog.models, filter.models, { title: 'Models', name: 'filterModels', onchange: values => { filter.models = values; } });
    const tags = selectField('Category', 'tagFilter', [{ id: '', label: 'All categories' }, ...state.catalog.tags], filter.tag);
    const harnesses = selectField('Agent / harness', 'harnessFilter', [{ id: '', label: 'All harnesses' }, ...state.catalog.harnesses], filter.harness);
    filters.append(node('div', { class: 'filter-content' }, models, node('div', { class: 'form-stack' }, tags, harnesses,
      node('p', { class: 'form-note', text: 'Select multiple models to discover projects built with that combination.' }),
      button('Clear filters', () => { filter.models = []; filter.tag = ''; filter.harness = ''; models.setValues([]); tags.querySelector('select').value = ''; harnesses.querySelector('select').value = ''; refresh(); }))));
    const tabs = node('div', { class: 'sort-tabs', 'aria-label': 'Sort projects' }, ['new', 'trending', 'featured'].map(value =>
      button(value[0].toUpperCase() + value.slice(1), () => { filter.sort = value; refresh(); }, 'sort-tab')));
    const count = node('div', { class: 'section-label', role: 'status' }), grid = node('div', { class: 'project-grid' }, loading());
    const featured = node('div'), combinations = node('div', { class: 'combination-strip' });
    const more = button('Load more', () => refresh(true)); more.hidden = true;
    const mast = modelId ? heading('Community / Models', label('models', modelId), 'Real projects built with this model. See how creators put it to work.') :
      node('section', { class: 'masthead' }, node('div', { class: 'kicker', text: 'Epic Bench / Community' }),
        node('h1', {}, 'See what people and agents ', node('em', { text: 'build.' })),
        node('p', { text: 'Benchmarks measure capability. These are the projects people make with it: the games, tools, experiments and ideas that come next.' }));
    const modelLinks = modelId && node('div', { class: 'model-links' },
      link('/Tracker/results.html?model=' + encodeURIComponent(modelId), 'Benchmark results ↗', 'button button-small button-quiet'),
      link('/Arcade/#/m/' + encodeURIComponent(state.catalog.models.find(m => m.id === modelId)?.arcadeKey || modelId), 'Arcade builds ↗', 'button button-small button-quiet'));
    layout(mast, modelLinks, featured, combinations,
      node('div', { class: 'toolbar' }, node('label', { class: 'search-box' }, node('span', { text: '⌕', 'aria-hidden': 'true' }), search),
        link('/Community/publish', 'Publish a project +', 'button')), filters, tabs,
      node('div', { class: 'masthead-row' }, count, link('/Community/agent', 'Publish with your agent →', 'button button-small button-violet')), grid, more);
    async function refresh(append = false) {
      const sequence = ++state.request;
      const query = new URLSearchParams({ search: filter.search, sort: filter.sort, limit: '24', offset: String(append ? items.length : 0) });
      if (filter.models.length) query.set('models', filter.models.join(','));
      if (filter.creator) query.set('creator', filter.creator);
      if (filter.tag) query.set('tag', filter.tag);
      if (filter.harness) query.set('harness', filter.harness);
      const display = new URLSearchParams(query); display.delete('offset'); display.delete('limit');
      history.replaceState({}, '', location.pathname + '?' + display);
      tabs.querySelectorAll('button').forEach((tab, index) => { const active = ['new', 'trending', 'featured'][index] === filter.sort; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', active); });
      more.disabled = true; count.textContent = 'Finding projects…';
      try {
        const data = await api('/projects?' + query);
        if (sequence !== state.request || !grid.isConnected) return;
        items = append ? [...items, ...data.projects] : data.projects; total = data.total;
        count.textContent = `${total} project${total === 1 ? '' : 's'}${filter.models.length > 1 ? ' · model combination' : ''}`;
        grid.replaceChildren(...(items.length ? items.map(projectCard) : [empty(
          filter.search || filter.models.length || filter.tag || filter.harness ? 'No matching projects yet.' : filter.sort === 'featured' ? 'The next standout is still out there.' : 'The first build starts here.',
          filter.search || filter.models.length || filter.tag || filter.harness ? 'Try a different search or clear a filter.' : 'Share a project with just a name and a link.', true)]));
        more.hidden = items.length >= total; more.disabled = false;
        if (!modelId && !append && !filter.search && !filter.models.length && !filter.tag && !filter.harness) {
          const groups = new Map();
          for (const project of items) if (project.models.length > 1) {
            const ids = [...project.models].sort(), key = ids.join(',');
            groups.set(key, ids);
          }
          combinations.replaceChildren(...[...groups.entries()].slice(0, 4).map(([key, ids]) => link('/Community/?models=' + encodeURIComponent(key), ids.map(id => label('models', id)).join(' + '), 'chip combination-chip')));
        } else combinations.replaceChildren();
      } catch (error) {
        if (sequence !== state.request) return;
        count.textContent = 'Could not load projects';
        grid.replaceChildren(empty('The gallery is temporarily unavailable.', error.message), button('Try again', () => refresh()));
      }
    }
    search.addEventListener('input', () => { filter.search = search.value; clearTimeout(timer); timer = setTimeout(() => refresh(), 250); });
    models.addEventListener('change', () => refresh());
    models.querySelector('.selected-chips').addEventListener('click', () => refresh());
    tags.addEventListener('change', () => { filter.tag = tags.querySelector('select').value; refresh(); });
    harnesses.addEventListener('change', () => { filter.harness = harnesses.querySelector('select').value; refresh(); });
    refresh();
    if (!modelId && !filter.search && !filter.models.length && !filter.tag && !filter.harness) {
      api('/projects?sort=featured&limit=1').then(data => {
        if (!featured.isConnected || !data.projects.length) return;
        const project = data.projects[0];
        featured.append(node('a', { class: 'featured', href: routeUrl('projects', project.slug) },
          node('div', { class: 'featured-copy' }, node('div', { class: 'kicker', text: 'Selected by Epic Bench' }), node('h2', { text: project.name }),
            project.description && node('p', { text: project.description }), node('span', { class: 'button button-violet', text: 'Explore project →' })), art(project, 'featured-art')));
      }).catch(() => {});
    }
  }

  function info(title, value) { return value ? node('div', { class: 'meta-item' }, node('span', { class: 'meta-label', text: title }), value) : null; }
  async function detail(id) {
    layout(loading());
    const { project } = await api('/projects/' + encodeURIComponent(id));
    const owned = state.user?.id === project.creator.id;
    const like = button(`${project.liked ? '♥' : '♡'} ${project.likes}`, safeAction(async () => {
      if (!state.user && !await signIn()) return;
      const result = await api(`/projects/${project.id}/like`, 'POST', {});
      like.textContent = `${result.liked ? '♥' : '♡'} ${result.likes}`; like.setAttribute('aria-pressed', result.liked);
    }));
    like.id = 'likeButton'; like.setAttribute('aria-label', 'Like project'); like.setAttribute('aria-pressed', project.liked);
    const actions = node('div', { class: 'detail-actions' }, like, external(project.url, 'Open project ↗', 'button'),
      owned && link('/Community/publish?edit=' + project.id, 'Edit project', 'button button-quiet'),
      owned ? button('Delete', () => confirmDelete(project)) : button('Report', safeAction(async () => { if (state.user || await signIn()) report(project); })));
    const views = node('span', { text: `${project.views} views` });
    const published = project.publication.method === 'agent' ?
      `Published by ${project.publication.harness ? label('harnesses', project.publication.harness) : 'an agent'} · API submission` : 'Published manually';
    layout(node('article', { class: 'detail' }, node('div', { class: 'detail-head' },
      node('div', {}, node('div', { class: 'kicker', text: project.featured ? 'Featured Community project' : 'Community project' }),
        node('h1', { text: project.name }), node('div', { class: 'chips' },
          project.visibility === 'unlisted' && node('span', { class: 'chip', text: 'Unlisted · direct link only' }),
          project.moderation === 'hidden' && node('span', { class: 'chip', text: 'Hidden by moderation' }))), actions),
      art(project, 'detail-art'), node('div', { class: 'detail-cols' },
        node('div', {}, project.description && node('p', { class: 'detail-lede preserve-lines', text: project.description }),
          project.remixOf && info('Remix / inspiration', link(routeUrl('projects', project.remixOf), 'Explore the original →')),
          node('p', { class: 'form-note attribution-note', text: 'Publication method is recorded by Epic Bench. Model and harness credits are supplied by the creator; they are not independently verified.' })),
        node('div', { class: 'meta-list' }, info('Creator', link(routeUrl('creators', project.creator.username), project.creator.displayName + ' · @' + project.creator.username)),
          project.models.length && info('Built with', node('div', { class: 'chips' }, project.models.map(model => link(routeUrl('models', model), label('models', model), 'chip cyan')))),
          project.harness && info('Agent / harness', label('harnesses', project.harness)),
          project.tags.length && info('Categories', node('div', { class: 'chips' }, project.tags.map(tag => link('/Community/?tag=' + encodeURIComponent(tag), label('tags', tag), 'chip')))),
          info('Publication', node('div', {}, node('span', { text: published }), node('small', { text: date(project.createdAt) }))),
          info('Reach', views), project.sourceUrl && info('Source', external(project.sourceUrl, 'View source ↗')),
          info('Stable project ID', node('code', { class: 'project-id', text: project.id }))))));
    if (state.user?.isAdmin) app.querySelector('.detail-actions').append(button(project.featured ? 'Remove feature' : 'Feature project', safeAction(async () => {
      await api('/admin/projects/' + project.id, 'PATCH', { featured: !project.featured }); detail(project.id);
    })));
    api(`/projects/${project.id}/view`, 'POST', {}).then(result => { views.textContent = `${result.views} views`; }).catch(() => {});
  }
  function report(project) {
    const form = node('form', { class: 'form-stack' }, field('Reason for report', 'reason', { type: 'textarea', required: true, max: 500 }),
      node('button', { class: 'button', type: 'submit', text: 'Send report' }));
    openModal('Report ' + project.name, [node('p', { text: 'A moderator will review this project. Your report is not public.' }), form]);
    submit(form, async () => { await api(`/projects/${project.id}/report`, 'POST', Object.fromEntries(new FormData(form))); closeModal(); notify('Report received. Thank you.'); });
  }
  function confirmDelete(project) {
    openModal('Delete this project?', [node('p', { text: `“${project.name}” and its Community link will be removed. This cannot be undone.` }),
      button('Keep project', closeModal), button('Delete project', safeAction(async () => {
        await api('/projects/' + project.id, 'DELETE'); closeModal(); notify('Project deleted'); navigate('/Community/account');
      }), 'button danger')]);
  }
  function submit(form, action) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]'), original = button.textContent;
      button.disabled = true; button.textContent = 'Working…';
      form.querySelector('.inline-error')?.remove();
      try { await action(); }
      catch (error) { form.append(node('div', { class: 'inline-error', role: 'alert', text: error.message })); }
      finally { button.disabled = false; button.textContent = original; }
    });
  }
  async function publish() {
    const edit = new URLSearchParams(location.search).get('edit');
    const publicationKey = crypto.randomUUID();
    if (edit && !state.user && !await signIn()) return navigate('/Community/');
    let project = null;
    if (edit) { layout(loading()); project = (await api('/projects/' + encodeURIComponent(edit))).project; }
    if (project && project.creator.id !== state.user?.id) throw new Error('Only the creator can edit this project.');
    const models = picker(state.catalog.models, project?.models || [], { title: 'Models used', name: 'models', custom: true });
    const tags = picker(state.catalog.tags, project?.tags || [], { title: 'Categories', name: 'tags' });
    const harness = field('Agent / harness', 'harness', { value: project?.harness || '', placeholder: 'Codex, OpenCode, Claude Code, or another harness', max: 40 });
    harness.querySelector('input').setAttribute('list', 'harnessOptions');
    harness.append(node('datalist', { id: 'harnessOptions' }, state.catalog.harnesses.map(h => node('option', { value: h.id, label: h.label }))));
    let thumbnailData;
    const thumbnailUrl = field('Thumbnail URL', 'thumbnailUrl', { type: 'url', value: project?.thumbnailUrl || '', placeholder: 'https://… (optional)' });
    const thumbnailInput = thumbnailUrl.querySelector('input');
    const upload = node('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', id: 'thumbnailUpload' });
    const preview = node('img', { class: 'thumbnail-editor-preview', alt: 'Thumbnail preview', hidden: !project?.previewUrl, ...(project?.previewUrl ? { src: project.previewUrl } : {}) });
    preview.addEventListener('error', () => { preview.hidden = true; });
    const thumbnailStatus = node('p', { class: 'form-note', role: 'status', text: project?.thumbnailSource === 'upload' ? 'Your uploaded thumbnail is saved. You can replace it below.' : 'Leave this blank to use a screenshot of the first screen at your project link. You can change it anytime.' });
    upload.addEventListener('change', safeAction(async () => {
      const file = upload.files[0]; if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { upload.value = ''; throw new Error('Choose a PNG, JPEG or WebP image under 10 MB.'); }
      upload.disabled = true;
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1280 / bitmap.width, 1280 / bitmap.height);
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const drawing = canvas.getContext('2d'); drawing.fillStyle = '#101827'; drawing.fillRect(0, 0, canvas.width, canvas.height); drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const encoded = canvas.toDataURL('image/jpeg', 0.82);
        if (encoded.length > 1400000) throw new Error('This image is too detailed. Choose a smaller image.');
        thumbnailData = encoded; thumbnailInput.value = ''; preview.src = encoded; preview.hidden = false;
        thumbnailStatus.textContent = 'Image selected. Save your project to keep this thumbnail.';
      } finally { upload.disabled = false; }
    }));
    thumbnailInput.addEventListener('input', () => { thumbnailData = null; upload.value = ''; preview.hidden = true; });
    const thumbnailEditor = node('section', { class: 'thumbnail-editor' }, node('h2', { text: 'Thumbnail (optional)' }), thumbnailStatus, preview,
      node('label', { for: 'thumbnailUpload', text: 'Upload an image' }), upload, thumbnailUrl,
      button('Use automatic preview', () => { thumbnailData = null; thumbnailInput.value = ''; upload.value = ''; preview.hidden = true; thumbnailStatus.textContent = 'The linked page’s first screen will be used after you save. If it cannot load, a default cover is shown.'; }));
    const details = node('details', { class: 'optional-details', open: !!edit }, node('summary', { text: 'Add optional details' }),
      node('div', { class: 'form-stack' }, field('Description', 'description', { type: 'textarea', value: project?.description || '', max: 4000, placeholder: 'What did you make? What makes it interesting?' }),
        models, harness, tags,
        field('Source / repository link', 'sourceUrl', { type: 'url', value: project?.sourceUrl || '', placeholder: 'https://github.com/… (optional)' }),
        field('Original / remix project ID', 'remixOf', { value: project?.remixOf || '', max: 80, placeholder: 'Optional public Community project ID' }),
        selectField('Visibility', 'visibility', [{ id: 'public', label: 'Public — appears in discovery' }, { id: 'unlisted', label: 'Unlisted — accessible by direct link' }], project?.visibility || 'public')));
    const form = node('form', { class: 'publish-form form-stack' },
      field('Project name', 'name', { required: true, max: 140, value: project?.name || '', placeholder: 'Give your build a name' }),
      field('Project link', 'url', { required: true, type: 'url', value: project?.url || '', placeholder: 'https://your-project.example.com' }),
        node('p', { class: 'form-note', text: 'That is all you need. Your project will be public unless you choose Unlisted below.' }), thumbnailEditor, details,
      node('button', { type: 'submit', class: 'button', text: edit ? 'Save changes' : 'Publish project' }));
    layout(node('section', { class: 'page-block publish-page' }, heading(edit ? 'Your publication' : 'New publication', edit ? 'Update your build.' : 'Name. Link. Published.',
      'Share what you made. Add model credits and context whenever you are ready.'), node('div', { class: 'publish-grid' }, form,
        node('aside', { class: 'info-card' }, node('h2', { text: 'From benchmark to build.' }), node('p', { text: 'Games, music, tools, experiments. If AI helped you make it, there is room for it here.' }),
          node('p', { text: 'You can edit the link, credits and visibility later. Your Community project ID stays the same.' }), link('/Community/agent', 'Publishing with an agent? →')))));
    submit(form, async () => {
      if (!state.user && !await signIn()) return;
        const body = Object.fromEntries(new FormData(form)); body.models = models.values(); body.tags = tags.values();
        if (upload.disabled) throw new Error('Please wait for the image to finish processing.');
        if (thumbnailData !== undefined) body.thumbnailData = thumbnailData;
      const data = await api(edit ? '/projects/' + edit : '/projects', edit ? 'PATCH' : 'POST', body, edit ? {} : { 'Idempotency-Key': publicationKey });
      notify(edit ? 'Project updated' : 'Your project is published'); navigate(routeUrl('projects', data.project.slug));
    });
  }

  async function creator(username) {
    layout(loading());
    const data = await api('/creators/' + encodeURIComponent(username)), creator = data.creator;
    const grid = node('div', { class: 'project-grid' }, data.projects.length ? data.projects.map(projectCard) : empty('No public builds yet.', 'This creator has not shared a public project yet.'));
    layout(node('section', { class: 'profile-page' }, node('div', { class: 'profile-hero' }, node('div', { class: 'profile-avatar', text: initials(creator) }),
      node('div', {}, heading('Community creator', creator.displayName, '@' + creator.username), node('p', { class: 'form-note', text: 'Joined ' + date(creator.createdAt) }))),
      node('div', { class: 'stats-row' }, ['projects', 'likes', 'views'].map(key => node('div', { class: 'mini-stat' }, node('strong', { text: data.stats[key] }), node('span', { text: key })))),
      data.models.length && node('div', { class: 'chips' }, data.models.map(model => link(routeUrl('models', model.id), label('models', model.id) + ` · ${model.count}`, 'chip cyan'))),
      data.tags.length && node('div', { class: 'chips' }, data.tags.map(tag => node('span', { class: 'chip', text: label('tags', tag.id) }))),
      node('h2', { class: 'section-label', text: 'Public projects' }), grid,
      data.stats.projects > data.projects.length && link('/Community/?creator=' + encodeURIComponent(username), 'Explore all projects →', 'button')));
  }
  async function account() {
    if (!state.user && !await signIn()) return navigate('/Community/');
    layout(loading());
    const [mine, tokens] = await Promise.all([api('/projects?mine=1&limit=100'), api('/tokens')]);
    const submissions = node('div', { class: 'project-grid' }, mine.projects.length ? mine.projects.map(projectCard) : empty('Your first build is waiting.', 'Publish with a name and a link.', true));
    let offset = mine.projects.length;
    const more = button('Load more submissions', safeAction(async () => {
      more.disabled = true;
      try {
        const next = await api('/projects?mine=1&limit=100&offset=' + offset);
        next.projects.forEach(project => submissions.append(projectCard(project)));
        offset += next.projects.length;
        more.hidden = offset >= next.total || !next.projects.length;
      } finally { more.disabled = false; }
    }), 'button button-quiet');
    more.hidden = offset >= mine.total;
    const tokenList = node('div', { class: 'token-list' }, tokens.tokens.length ? tokens.tokens.map(token => node('div', { class: 'token-row' },
      node('div', {}, node('strong', { text: token.label }), node('small', { text: `${token.harness || 'API client'} · expires ${date(token.expiresAt)}` })),
      button('Revoke', safeAction(async () => { await api('/tokens/' + token.id, 'DELETE'); notify('Token revoked'); account(); })))) : node('p', { class: 'form-note', text: 'No agent tokens yet.' }));
    layout(node('section', { class: 'account-page' }, heading('Your Community account', state.user.displayName, '@' + state.user.username),
      node('div', { class: 'detail-actions' }, link(routeUrl('creators', state.user.username), 'Public profile', 'button button-quiet'), link('/Community/publish', 'Publish a project', 'button'),
        state.user.isAdmin && link('/Community/admin', 'Moderation', 'button button-violet'), button('Log out', safeAction(async () => {
          await api('/auth/logout', 'POST', {}); state.user = null; state.csrf = ''; notify('Logged out'); navigate('/Community/');
        }))),
      node('section', { class: 'info-card account-tokens' }, node('h2', { text: 'Agent access' }),
        node('p', { text: 'Give each agent a separate token. Tokens expire after 90 days and can be revoked here at any time.' }), tokenList,
        button('Create token', createToken, 'button button-small')),
      node('h2', { class: 'section-label', text: `Your submissions · ${mine.total}` }),
      submissions, more));
  }
  function createToken() {
    const form = node('form', { class: 'form-stack' }, field('Token label', 'label', { required: true, max: 80, placeholder: 'My local agent' }),
      field('Publishing harness', 'harness', { max: 40, placeholder: 'codex, opencode, or another agent' }),
      node('p', { class: 'form-note', text: 'The harness name is self-reported. The API publication method is recorded by the server.' }),
      node('button', { type: 'submit', class: 'button', text: 'Create token' }));
    openModal('Agent token', [form]);
    submit(form, async () => {
      const data = await api('/tokens', 'POST', Object.fromEntries(new FormData(form))); closeModal();
      showSecret('Save your agent token', { server: location.origin + '/api/community/v1', username: state.user.username, token: data.token, tokenId: data.id, expiresAt: data.expiresAt },
        'epic-bench-agent-token.json', () => account());
    });
  }
  function agent() {
    layout(node('section', { class: 'page-block agent-page' }, heading('Publish with your agent', 'Build → Publish → Done.',
      'Install one portable skill. Tell Codex, OpenCode, Claude Code, or another capable agent: “Publish this to Epic Bench.”'),
      node('div', { class: 'publish-grid' }, node('div', { class: 'info-card' }, node('h2', { text: '1. Get the skill' }),
        node('p', { text: 'Download and extract the folder into your agent’s reusable skills directory. For Codex, use ~/.agents/skills/epic-bench-community/.' }),
        node('a', { class: 'button', href: '/Community/skill/epic-bench-community.zip', download: 'epic-bench-community.zip', text: 'Download Community skill ↓' }),
        node('h2', { text: '2. Ask your agent' }), node('blockquote', { text: 'Publish this to Epic Bench.' }),
        node('p', { text: 'It checks local credentials, creates an account if needed, credits the models you used, and returns a stable project link. No browser automation is needed.' })),
      node('aside', { class: 'info-card' }, node('h2', { text: 'Your account, reusable.' }),
        node('p', { text: 'Credentials and project associations stay in a private local profile outside your repository. Agent tokens can be revoked from your account page.' }),
        node('p', { text: 'Ask to publish unlisted for a private review link, then make the same entry public. Later, update the deployment URL without starting another project.' }),
        node('p', { class: 'form-note', text: 'Unlisted links are accessible to anyone who has the link. They are not password protected.' }))),
      node('div', { class: 'info-card agent-commands' }, node('h2', { text: 'Prefer the command line?' }),
        node('pre', { text: 'python scripts/epic_bench_community.py register --harness codex\npython scripts/epic_bench_community.py publish --name "My project" --url https://example.com\npython scripts/epic_bench_community.py update --url https://example.com/new-version' }),
        node('p', { text: 'The bundled Python helper uses the same public API as other integrations. It can also recover accounts, rotate tokens, change visibility and delete owned publications.' }),
        node('a', { href: '/Community/api-docs', target: '_blank', rel: 'noopener', text: 'Read API and account documentation ↗' }))));
  }
  async function admin() {
    if (!state.user && !await signIn()) return navigate('/Community/');
    if (!state.user?.isAdmin) return layout(empty('Administrator access required.', 'This area is restricted to trusted Epic Bench administrators.'));
    const { reports } = await api('/admin/reports?limit=100');
    const manual = node('form', { class: 'form-stack' }, field('Project ID', 'projectId', { required: true, max: 80 }),
      selectField('Action', 'action', [{ id: 'feature', label: 'Feature' }, { id: 'unfeature', label: 'Remove feature' }, { id: 'hide', label: 'Hide' }, { id: 'restore', label: 'Restore' }], 'feature'),
      node('button', { class: 'button', type: 'submit', text: 'Apply project action' }));
    submit(manual, async () => {
      const values = Object.fromEntries(new FormData(manual));
      const body = values.action === 'feature' || values.action === 'unfeature' ? { featured: values.action === 'feature' } : { moderation: values.action === 'hide' ? 'hidden' : 'active' };
      await api('/admin/projects/' + encodeURIComponent(values.projectId), 'PATCH', body); notify('Project moderation updated');
    });
    const accounts = node('form', { class: 'form-stack' }, field('Creator account ID', 'accountId', { required: true, max: 80 }),
      selectField('Account state', 'disabled', [{ id: 'true', label: 'Disable account and revoke access' }, { id: 'false', label: 'Restore account' }], 'true'),
      node('button', { class: 'button', type: 'submit', text: 'Apply account action' }));
    submit(accounts, async () => { const body = Object.fromEntries(new FormData(accounts)); await api('/admin/accounts/' + encodeURIComponent(body.accountId), 'PATCH', { disabled: body.disabled === 'true' }); notify('Account state updated'); });
    layout(node('section', { class: 'admin-page' }, heading('Community operations', 'Keep the gallery useful.', 'Review reports, select standout projects and manage abusive accounts.'),
      node('div', { class: 'admin-table' }, reports.length ? reports.map(report => node('article', { class: 'report-row' },
        link(routeUrl('projects', report.projectId), report.projectName), node('p', { text: report.reason }),
        node('small', { text: `Creator ID: ${report.creatorId} · ${date(report.createdAt)}` }), node('div', { class: 'detail-actions' },
          button('Hide project', safeAction(async () => { await api('/admin/projects/' + report.projectId, 'PATCH', { moderation: 'hidden' }); notify('Project hidden'); })),
          button('Resolve report', safeAction(async () => { await api('/admin/reports/' + report.id, 'PATCH', { status: 'resolved' }); admin(); }))))) : node('p', { text: 'No open reports.' })),
      node('div', { class: 'publish-grid admin-tools' }, node('div', { class: 'info-card' }, node('h2', { text: 'Project controls' }), manual),
        node('div', { class: 'info-card' }, node('h2', { text: 'Account controls' }), accounts))));
  }

  function openModal(title, content, onClose = null) {
    closeModal();
    const previousFocus = document.activeElement;
    const modal = node('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      button('×', closeModal, 'modal-close'), node('h2', { text: title }), content);
    modal.querySelector('.modal-close').setAttribute('aria-label', 'Close dialog');
    const backdrop = node('div', { class: 'modal-backdrop' }, modal);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
    dialogRoot.replaceChildren(backdrop);
    app.inert = true; document.querySelector('.community-nav').inert = true;
    modalClosed = () => { app.inert = false; document.querySelector('.community-nav').inert = false; previousFocus?.focus?.(); onClose?.(); };
    setTimeout(() => modal.querySelector('input,textarea,select,button')?.focus(), 0);
  }
  function closeModal() { const callback = modalClosed; modalClosed = null; dialogRoot.replaceChildren(); callback?.(); }
  function showSecret(title, value, filename, done) {
    const content = JSON.stringify(value, null, 2), url = URL.createObjectURL(new Blob([content + '\n'], { type: 'application/json' }));
    openModal(title, [node('p', { text: 'Download this private file now. This secret is only shown once. Keep it outside your project repository.' }),
      node('a', { class: 'button', download: filename, href: url, text: 'Download private file' }),
      node('details', {}, node('summary', { text: 'Show secret' }), node('pre', { class: 'secret-value', text: content })),
      button('Done', closeModal)], () => { URL.revokeObjectURL(url); done?.(); });
  }
  function signIn() {
    return new Promise(resolve => {
      let mode = 'login', completed = false;
      const tabs = node('div', { class: 'modal-tabs' });
      const display = field('Display name (optional)', 'displayName', { max: 80 }); display.hidden = true;
      const form = node('form', { class: 'form-stack' }, field('Username', 'username', { required: true, max: 40, placeholder: 'Your handle' }),
        field('Password', 'password', { required: true, type: 'password', max: 256, placeholder: 'At least 15 characters' }), display,
        node('button', { class: 'button', type: 'submit', text: 'Log in' }));
      form.querySelector('#password').setAttribute('minlength', '15');
      form.querySelector('#username').autocomplete = 'username'; form.querySelector('#password').autocomplete = 'current-password';
      for (const value of ['login', 'register']) tabs.append(button(value === 'login' ? 'Log in' : 'Register', () => {
        mode = value; display.hidden = value !== 'register';
        form.querySelector('[type=submit]').textContent = value === 'login' ? 'Log in' : 'Create account';
        form.querySelector('#password').autocomplete = value === 'login' ? 'current-password' : 'new-password';
        [...tabs.children].forEach((tab, index) => tab.classList.toggle('active', index === (value === 'login' ? 0 : 1)));
      }));
      tabs.firstChild.classList.add('active');
      openModal('Welcome to Community', [node('p', { text: 'Sign in to publish, like and manage your projects.' }), tabs, form,
        button('Recover an account', recover)], () => { if (!completed) resolve(null); });
      submit(form, async () => {
        const body = { username: form.elements.username.value, password: form.elements.password.value };
        if (mode === 'register') body.displayName = form.elements.displayName.value;
        const data = await api('/auth/' + mode, 'POST', body);
        state.user = data.user; state.csrf = data.csrfToken; completed = true; closeModal();
        if (data.recoveryCode) showSecret('Save your recovery code', { server: location.origin, username: data.user.username, recoveryCode: data.recoveryCode }, 'epic-bench-recovery.json', () => resolve(data.user));
        else resolve(data.user);
      });
    });
  }
  function recover() {
    const form = node('form', { class: 'form-stack' }, field('Username', 'username', { required: true, max: 40 }),
      field('Recovery code', 'recoveryCode', { required: true, max: 100 }), field('New password', 'password', { type: 'password', required: true, max: 256, placeholder: 'At least 15 characters' }),
      node('button', { type: 'submit', class: 'button', text: 'Reset password' }));
    openModal('Recover your account', [node('p', { text: 'Your one-use recovery code resets your password and revokes existing sessions and agent tokens.' }), form]);
    submit(form, async () => {
      const body = Object.fromEntries(new FormData(form)), data = await api('/auth/recover', 'POST', body);
      state.user = null; state.csrf = ''; closeModal();
      showSecret('Save your new recovery code', { username: body.username, recoveryCode: data.recoveryCode, server: location.origin }, 'epic-bench-recovery.json', () => navigate('/Community/account'));
    });
  }
  document.addEventListener('keydown', event => {
    const modal = dialogRoot.querySelector('.modal'); if (!modal) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      const inputs = [...modal.querySelectorAll('a[href],button,input,textarea,select,summary')].filter(el => !el.disabled && el.getClientRects().length);
      if (!inputs.length) return;
      if (event.shiftKey && document.activeElement === inputs[0]) { event.preventDefault(); inputs.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === inputs.at(-1)) { event.preventDefault(); inputs[0].focus(); }
    }
  });
  async function render() {
    ++state.request;
    const path = location.pathname.replace(/\/$/, '');
    document.title = 'Community · Epic Bench';
    try {
      if (path === '/Community') await browse();
      else if (path === '/Community/publish') await publish();
      else if (path === '/Community/account') await account();
      else if (path === '/Community/agent') agent();
      else if (path === '/Community/admin') await admin();
      else if (path.startsWith('/Community/projects/')) await detail(decodeURIComponent(path.slice('/Community/projects/'.length)));
      else if (path.startsWith('/Community/creators/')) await creator(decodeURIComponent(path.slice('/Community/creators/'.length)));
      else if (path.startsWith('/Community/models/')) await browse(decodeURIComponent(path.slice('/Community/models/'.length)));
      else layout(empty('Page not found.', 'Return to the Community gallery.'));
    } catch (error) { layout(empty('This page is unavailable.', error.message), link('/Community/', 'Back to Community', 'button')); }
  }
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a');
    if (anchor && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
      !anchor.hasAttribute('download') && !anchor.target && anchor.origin === location.origin &&
      /^\/Community(?:\/?$|\/(?:publish|account|admin|agent)(?:\?|$)|\/(?:projects|creators|models)\/)/.test(anchor.pathname)) {
      event.preventDefault(); navigate(anchor.href);
    }
  });
  document.getElementById('accountButton').addEventListener('click', () => navigate('/Community/account'));
  document.getElementById('menuButton').addEventListener('click', event => {
    const opened = document.querySelector('.community-nav nav').classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', opened);
  });
  window.addEventListener('popstate', render);
  async function boot() {
    try {
      const [catalog, me] = await Promise.all([api('/catalog'), api('/auth/me')]);
      state.catalog = catalog; state.user = me.user; state.csrf = me.csrfToken || ''; await render();
    } catch (error) { layout(empty('Community is temporarily unavailable.', error.message), button('Try again', boot)); }
  }
  boot();
})();
