/* ============================================
   ISYNQ — Main JS (Global Interactions)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Sticky header
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // Mobile hamburger
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      mobileNav.classList.toggle('open');
      document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
    });
    mobileNav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Download dropdown
  const dlDropdown = document.querySelector('.download-dropdown');
  if (dlDropdown) {
    const dlBtn = dlDropdown.querySelector('.download-btn');
    dlBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      dlDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dlDropdown.classList.remove('open'));
  }

  // Scroll animations (IntersectionObserver)
  const animatedEls = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right, .fade-in');
  if (animatedEls.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    animatedEls.forEach(el => observer.observe(el));
  }

  // FAQ accordion
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isActive = item.classList.contains('active');
      // Close all
      document.querySelectorAll('.faq-item.active').forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });

  // Testimonial auto-scroll
  const track = document.querySelector('.testimonials-track');
  if (track) {
    let scrollPos = 0;
    setInterval(() => {
      scrollPos += 370;
      if (scrollPos >= track.scrollWidth - track.clientWidth) scrollPos = 0;
      track.scrollTo({ left: scrollPos, behavior: 'smooth' });
    }, 4000);
  }

  // Update auth buttons based on login state
  updateAuthUI();
});

function updateAuthUI() {
  const user = window.IsynqAuth?.getCurrentUser();
  const signInBtns = document.querySelectorAll('.btn-signin');
  const signUpBtns = document.querySelectorAll('.btn-signup');
  if (user) {
    signInBtns.forEach(b => { b.textContent = 'Dashboard'; b.href = 'app/dashboard.html'; b.setAttribute('href', 'app/dashboard.html'); });
    signUpBtns.forEach(b => { b.textContent = user.avatar; b.href = 'app/dashboard.html'; b.setAttribute('href', 'app/dashboard.html'); b.style.width = '36px'; b.style.height = '36px'; b.style.borderRadius = '50%'; b.style.padding = '0'; });
  }
}

// Toast helper
function showToast(message, type = 'success') {
  const existing = document.querySelector('.auth-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `auth-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

window.showToast = showToast;
