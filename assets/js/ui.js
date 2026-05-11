export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }  
export function showLoading(v) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !v);
  }
export function showError(elId, msg) {
    const el = document.getElementById(elId);
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4000);
  }