(() => {
  'use strict';

  const formatRub = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

  const SCALE = [
    { v: 0, label: '0 наруш.', discount: 12, msg: 'Демо-сценарий: нарушений нет, поэтому расчетная скидка на ОСАГО составляет 12%.' },
    { v: 1, label: '1 наруш.', discount: 9, msg: 'Демо-сценарий: 1 нарушение и обычный штраф. Расчетная скидка при продлении ОСАГО — 9%.' },
    { v: 2, label: '2 наруш.', discount: 6, msg: 'Демо-сценарий: 2 нарушения. Расчетная скидка при продлении ОСАГО — 6%.' },
    { v: 3, label: '3 наруш.', discount: 3, msg: 'Демо-сценарий: 3 нарушения. Расчетная скидка при продлении ОСАГО — 3%.' },
    { v: 4, label: '4+ наруш.', discount: 0, msg: 'В демонстрационном сценарии указано более 3 нарушений. Скидка для этого страхового периода не применяется.' }
  ];

  const SAMPLE_DECREES = [
    { date: '14.09.2026', place: 'г. Уфа, пр. Октября, 79 (Горсовет)', reason: 'Превышение скорости на 20-40 км/ч', fine: '750 ₽ · пример' },
    { date: '03.06.2026', place: 'г. Уфа, Бельский мост (въезд)', reason: 'Превышение скорости на 20-40 км/ч', fine: '750 ₽ · пример' },
    { date: '19.03.2026', place: 'г. Уфа, ул. Цюрупы / ул. Кирова', reason: 'Заезд за стоп-линию', fine: '800 ₽ · пример' },
    { date: '11.01.2026', place: 'г. Уфа, пр. Салавата Юлаева', reason: 'Превышение скорости на 20-40 км/ч', fine: '750 ₽ · пример' }
  ];

  const state = {
    synced: false,
    violations: 0,
    basePrice: 10500
  };

  const welcomeView = document.getElementById('welcome-view');
  const dashboardView = document.getElementById('dashboard-view');
  const modal = document.getElementById('gu-modal');
  const stepConsent = document.getElementById('modal-step-consent');
  const stepLoading = document.getElementById('modal-step-loading');
  const headerAuthBtn = document.getElementById('header-auth-btn');

  function openModal() {
    stepConsent.classList.remove('hidden');
    stepLoading.classList.add('hidden');
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  function runSyncFlow() {
    stepConsent.classList.add('hidden');
    stepLoading.classList.remove('hidden');

    const title = document.getElementById('loading-title');
    const sub = document.getElementById('loading-sub');

    title.textContent = 'Демонстрация сценария ЕСИА...';
    sub.textContent = 'Реальный вход и данные не используются';

    setTimeout(() => {
      title.textContent = 'Имитация проверки постановлений...';
      sub.textContent = 'Пример данных обрабатывается в браузере';
    }, 550);

    setTimeout(() => {
      title.textContent = 'Расчет демонстрационной скидки...';
      sub.textContent = 'Показываем макет результата';
    }, 1100);

    setTimeout(() => {
      state.synced = true;
      closeModal();
      showDashboard();
    }, 1550);
  }

  function showDashboard() {
    welcomeView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    headerAuthBtn.textContent = 'Демо-кабинет открыт';
    const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('sync-time').textContent = `показано в ${now}`;
    renderDashboard();
  }

  function logout() {
    state.synced = false;
    dashboardView.classList.add('hidden');
    welcomeView.classList.remove('hidden');
    headerAuthBtn.textContent = 'Показать демо ЕСИА';
  }

  function getRule(v) {
    return SCALE[Math.min(v, 4)];
  }

  function renderDashboard() {
    const rule = getRule(state.violations);
    const saving = Math.round(state.basePrice * (rule.discount / 100));
    const finalPrice = state.basePrice - saving;

    const discountEl = document.getElementById('dash-discount');
    discountEl.textContent = `${rule.discount}%`;
    discountEl.style.color = rule.discount >= 9 ? '#059669' : rule.discount >= 3 ? '#0D4CD3' : '#B91C1C';

    document.getElementById('dash-viol-count').textContent = state.violations >= 4 ? '4+' : String(state.violations);
    document.getElementById('dash-message').textContent = rule.msg;

    // Шаги шкалы
    const stepsEl = document.getElementById('dash-steps');
    stepsEl.innerHTML = SCALE.map((s) => `
      <div class="p-step ${s.v === rule.v ? 'current' : ''}">
        <strong>${s.discount ? `-${s.discount}%` : '0%'}</strong>
        <span>${s.label}</span>
      </div>
    `).join('');

    // Калькулятор
    document.getElementById('dash-base-val').textContent = formatRub(state.basePrice);
    document.getElementById('dash-save-val').textContent = saving > 0 ? `- ${formatRub(saving)}` : '0 ₽';
    document.getElementById('dash-final-val').textContent = formatRub(finalPrice);

    // Сертификат
    const certStatus = document.getElementById('cert-status-pill');
    const sendBtn = document.getElementById('btn-send-insurer');
    document.getElementById('cert-pct').textContent = rule.discount > 0 ? `${rule.discount}%` : '0% (не активна)';
    if (rule.discount > 0) {
      certStatus.textContent = 'Макет';
      certStatus.className = 'cert-status';
      sendBtn.disabled = false;
    } else {
      certStatus.textContent = 'Нет скидки';
      certStatus.className = 'cert-status inactive';
      sendBtn.disabled = true;
    }

    // Постановления за 12 месяцев
    const listEl = document.getElementById('decree-list');
    if (state.violations === 0) {
      listEl.innerHTML = '<div class="decree-empty">В этом демо-сценарии постановлений нет. Расчетная скидка — 12%.</div>';
    } else {
      const items = SAMPLE_DECREES.slice(0, state.violations);
      listEl.innerHTML = items.map((d) => `
        <div class="decree-item">
          <div>
            <strong>${d.reason}</strong>
            <span>${d.date} · ${d.place}</span>
          </div>
          <div class="decree-fine">${d.fine}</div>
        </div>
      `).join('');
    }
  }

  // События
  document.getElementById('btn-open-gu').addEventListener('click', openModal);
  headerAuthBtn.addEventListener('click', () => {
    if (!state.synced) openModal();
  });
  document.getElementById('btn-quick-demo').addEventListener('click', () => {
    state.synced = true;
    showDashboard();
  });
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-gu').addEventListener('click', closeModal);
  document.getElementById('btn-confirm-gu').addEventListener('click', runSyncFlow);
  document.getElementById('btn-resync').addEventListener('click', openModal);
  document.getElementById('btn-logout').addEventListener('click', logout);

  document.querySelectorAll('.scen-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scen-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.violations = Number(btn.dataset.v);
      document.getElementById('insurer-toast').textContent = '';
      renderDashboard();
    });
  });

  document.getElementById('dash-osago-range').addEventListener('input', (e) => {
    state.basePrice = Number(e.target.value);
    renderDashboard();
  });

  document.getElementById('btn-send-insurer').addEventListener('click', () => {
    const insurer = document.getElementById('insurer-select').value;
    const rule = getRule(state.violations);
    document.getElementById('insurer-toast').textContent =
      `Демо: пример скидки ${rule.discount}% для «${insurer}». Передача не выполняется.`;
  });
})();
