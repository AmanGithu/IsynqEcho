/* ============================================================
   ISYNQ — Resume rendering + shared UI helpers
   Renders the same ATS-safe template markup (see resume-templates.css)
   for both the dashboard thumbnail and the editor's live preview, so
   they never drift. Also provides a score-ring builder and a toast
   helper used across all resume-* pages instead of blocking alert().
   ============================================================ */

/* Sample resume used for style-preview thumbnails on the list page — the
   same "Arjun Mehta" placeholder the source app renders for every thumbnail
   (a real per-resume render would mean fetching every resume's full body
   just to show a card list). */
const RESUME_SAMPLE_DATA = {
  name: 'Arjun Mehta', target: 'Senior Frontend Engineer',
  contact: ['arjun.mehta@gmail.com', '(415) 555-0142', 'San Francisco, CA'],
  summary: 'Frontend-focused software engineer with 4 years building fast, accessible web applications in React and TypeScript.',
  experience: [
    { role: 'Software Engineer', company: 'Northwind Labs', location: 'San Francisco, CA', meta: 'May 2022 — Present',
      bullets: ['Built and shipped a customer-facing React dashboard used by 20,000+ monthly active users.', 'Reworked the client rendering pipeline, cutting median page load time by ~40%.'] },
    { role: 'Frontend Engineer', company: 'Brightside Software', location: 'Remote', meta: 'Jun 2021 — May 2022',
      bullets: ['Developed reusable UI components in React and TypeScript adopted across 4 product teams.'] },
  ],
  skills: [['Languages', 'JavaScript, TypeScript, HTML, CSS'], ['Frameworks & Tools', 'React, Node.js, REST APIs']],
  education: [{ degree: 'B.E., Computer Engineering', school: 'Savitribai Phule Pune University', meta: '2017 — 2021' }],
};

const ResumeUI = {
  SAMPLE_DATA: RESUME_SAMPLE_DATA,

  escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  DEFAULT_SECTION_ORDER: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications'],

  resolveSectionOrder(d) {
    const customKeys = (d.custom || []).map((c) => `custom:${c.id}`);
    const known = [...this.DEFAULT_SECTION_ORDER, ...customKeys];
    if (!d.sectionOrder || !d.sectionOrder.length) return known;
    const saved = d.sectionOrder.filter((k) => known.includes(k));
    const missing = known.filter((k) => !saved.includes(k));
    return [...saved, ...missing];
  },

  /** Builds the inner HTML of a single ATS-safe resume page (no pagination —
      matches MindSync's non-paginated <Resume/> used for thumbnails/previews). */
  toHTML(data, variant) {
    const esc = (s) => this.escapeHtml(s);
    const rowHeader = variant === 'compact' || variant === 'developer';
    const contact = (data.contact || []).filter((c) => c && c.trim());
    const contactHtml = contact.length ? `<div class="r-contact">${contact.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : '';

    const head = rowHeader
      ? `<header class="r-head"><div class="r-head-row"><div class="r-name">${esc(data.name)}</div><div class="r-target">${esc(data.target)}</div></div>${contactHtml}</header>`
      : `<header class="r-head"><div class="r-name">${esc(data.name)}</div><div class="r-target">${esc(data.target)}</div>${contactHtml}</header>`;

    const heading = (title) => `<section class="r-section"><div class="r-h">${esc(title)}</div></section>`;

    const jobBlock = (role, meta, sub, bullets) => `
      <div class="r-job">
        <div class="r-job-top"><div class="r-role">${esc(role)}</div>${meta ? `<div class="r-meta">${esc(meta)}</div>` : ''}</div>
        ${sub && sub.trim() ? `<div class="r-sub">${esc(sub)}</div>` : ''}
        ${bullets && bullets.length ? `<ul class="r-bullets">${bullets.map((b) => `<li class="r-bullet">${esc(b)}</li>`).join('')}</ul>` : ''}
      </div>`;

    const emit = {
      summary: () => {
        if (!data.summary || !data.summary.trim()) return '';
        return heading('Summary') + `<p class="r-summary">${esc(data.summary)}</p>`;
      },
      experience: () => {
        if (!data.experience || !data.experience.length) return '';
        return heading('Experience') + data.experience.map((job) => {
          const bullets = (job.bullets || []).filter((b) => b.trim());
          const sub = [job.company, job.location].filter((s) => s && s.trim()).join(' — ');
          return jobBlock(job.role, job.meta, sub, bullets);
        }).join('');
      },
      projects: () => {
        if (!data.projects || !data.projects.length) return '';
        return heading('Projects') + data.projects.map((p) => {
          const bullets = (p.bullets || []).filter((b) => b.trim());
          const sub = bullets.length ? '' : (p.description || '');
          return jobBlock(p.name, p.meta, sub, bullets);
        }).join('');
      },
      skills: () => {
        const rows = (data.skills || []).filter(([l, v]) => (l && l.trim()) || (v && v.trim()));
        if (!rows.length) return '';
        return heading('Skills') + `<div class="r-skills">${rows.map(([label, value]) =>
          `<div>${label && label.trim() ? `<b>${esc(label)}:</b> ` : ''}${esc(value)}</div>`).join('')}</div>`;
      },
      education: () => {
        if (!data.education || !data.education.length) return '';
        return heading('Education') + data.education.map((e) => jobBlock(e.degree, e.meta, e.school, null)).join('');
      },
      certifications: () => {
        if (!data.certifications || !data.certifications.length) return '';
        return heading('Certifications') + data.certifications.map((c) => jobBlock(c.name, c.meta, c.issuer, null)).join('');
      },
    };

    const customById = new Map((data.custom || []).map((c) => [`custom:${c.id}`, c]));
    let body = '';
    for (const key of this.resolveSectionOrder(data)) {
      if (key.startsWith('custom:')) {
        const c = customById.get(key);
        const items = c ? c.items.filter((i) => i.trim()) : [];
        if (!c || (!c.title.trim() && !items.length)) continue;
        body += heading(c.title || 'Section') + (items.length ? `<ul class="r-bullets">${items.map((b) => `<li class="r-bullet">${esc(b)}</li>`).join('')}</ul>` : '');
      } else {
        body += emit[key] ? emit[key]() : '';
      }
    }

    return head + body;
  },

  /** Wraps toHTML() in the `.resume.resume--<variant>` container. */
  toDocumentHTML(data, variant) {
    return `<div class="resume resume--${variant || 'classic'}">${this.toHTML(data, variant || 'classic')}</div>`;
  },

  /** A scaled-down, non-interactive thumbnail of a resume — same trick as
      MindSync's `.res-thumb__scale`: render at full A4 width, then transform:
      scale() down to fit the thumbnail box. */
  thumbnailHTML(data, variant, boxWidth) {
    const scale = (boxWidth / 612).toFixed(5);
    return `<div class="res-thumb__scale" style="transform:scale(${scale});">${this.toDocumentHTML(data, variant)}</div>`;
  },

  /** Circular score dial. tone is auto-derived from value unless overridden. */
  scoreRing({ value, size = 84, stroke = 7, fontSize = 20, cap = '' }) {
    const tone = value >= 75 ? 'tone-success' : value >= 50 ? 'tone-warning' : 'tone-danger';
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
    return `
      <div class="score-ring ${tone}" style="width:${size}px;height:${size}px;">
        <svg width="${size}" height="${size}">
          <circle class="score-ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"></circle>
          <circle class="score-ring__fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${off}"></circle>
        </svg>
        <div class="score-ring__label">
          <span class="score-ring__value" style="font-size:${fontSize}px;">${Math.round(value)}</span>
          ${cap ? `<span class="score-ring__cap">${this.escapeHtml(cap)}</span>` : ''}
        </div>
      </div>`;
  },

  /** Non-blocking toast, replaces alert() for both success and error feedback
      so a network hiccup can never freeze the page on a modal dialog. */
  toast(message, kind = 'success') {
    let root = document.getElementById('rs-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'rs-toast-root';
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = `rs-toast rs-toast--${kind}`;
    el.innerHTML = `
      ${kind === 'error'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'}
      <span>${this.escapeHtml(message)}</span>`;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, kind === 'error' ? 4200 : 2600);
  },

  /** Standardized error → toast, since every resume page does this. */
  toastError(err, fallback) {
    this.toast((err && err.message) || fallback, 'error');
  },
};

window.ResumeUI = ResumeUI;
