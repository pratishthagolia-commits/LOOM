// Scroll reveals: elements with .rv slide/fade in once when they enter the viewport.
(function () {
  const items = Array.from(document.querySelectorAll('.rv'));
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
})();
