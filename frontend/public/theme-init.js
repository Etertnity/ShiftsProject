// Тема до загрузки приложения, чтобы ночью не «мигал» светлый экран (логика как в ThemeContext).
// Отдельный файл, а не встроенный <script>: политика безопасности (CSP) запрещает встроенные скрипты
(function () {
  try {
    var pref = localStorage.getItem('theme') || 'auto';
    var mskHour = (new Date().getUTCHours() + 3) % 24;
    var night = mskHour >= 21 || mskHour < 9;
    if (pref === 'dark' || (pref === 'auto' && night)) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
