/* main.js — Comportamentos específicos do projecto Limusina
   Mantém intactos scene.js e fx.js; implementa:
   1. Sincronização tipográfica do hero com o frame apresentado do vídeo (reversível e determinística)
   2. Controlo de 5 transições discretas de câmara (scroll, clique, teclado e toque) + Saltar apresentação
   3. Controlo único de som global (Web Audio API instrumental suave + toques de transição, inicia em silêncio)
   4. Montra vertical da Frota sincronizada com especificações, galeria modal acessível e selecção no formulário
   5. Condições dinâmicas na secção Experiência consoante a viatura seleccionada
   6. Cartões em arco de "Como reservar" com navegação por setas, teclado e deslize táctil
   7. Validação inline e recuperação de dados no formulário de pedido de disponibilidade */

(() => {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* =========================================================================
     1. SOM GLOBAL ÚNICO (Inicia silenciado; áudio discreto via Web Audio API)
     ========================================================================= */
  const SoundEngine = (() => {
    let ctx = null;
    let enabled = false;
    let timer = null;
    let master = null;

    const buttons = $$('[data-sound-toggle]');
    const labels = $$('[data-sound-label]');

    function syncUI() {
      buttons.forEach(btn => {
        btn.setAttribute('aria-pressed', String(enabled));
        btn.setAttribute('aria-label', enabled ? 'Desligar som ambiente' : 'Activar som ambiente');
      });
      labels.forEach(lbl => {
        lbl.textContent = enabled ? 'Som: Ligado' : 'Som: Desligado';
      });
    }

    function playNote(freq, dur, gainPeak = 0.03) {
      if (!enabled || !ctx || !master) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gainPeak, now + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }

    const chords = [
      [293.66, 440.0, 554.37], // D major warm
      [246.94, 369.99, 440.0], // B minor7
      [196.0, 293.66, 369.99], // G maj7
      [220.0, 329.63, 440.0]   // A sus
    ];
    let step = 0;

    function startPad() {
      if (timer) return;
      const tick = () => {
        if (!enabled) return;
        const c = chords[step % chords.length];
        c.forEach((f, idx) => setTimeout(() => playNote(f, 3.8, 0.022), idx * 140));
        step++;
      };
      tick();
      timer = setInterval(tick, 4200);
    }

    function stopPad() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function toggle() {
      enabled = !enabled;
      if (enabled) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          if (!ctx) {
            ctx = new AudioCtx();
            master = ctx.createGain();
            master.gain.value = 0.65;
            master.connect(ctx.destination);
          }
          if (ctx.state === 'suspended') ctx.resume();
          startPad();
        }
      } else {
        stopPad();
      }
      syncUI();
    }

    function cueTransition() {
      if (!enabled || !ctx) return;
      playNote(587.33, 0.55, 0.018);
    }

    buttons.forEach(btn => btn.addEventListener('click', toggle));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopPad();
      else if (enabled) startPad();
    });
    syncUI();

    return { cueTransition };
  })();

  /* =========================================================================
     2. MENU MÓVEL ACESSÍVEL
     ========================================================================= */
  (() => {
    const toggle = $('.menu-toggle');
    const drawer = $('#menu-movel');
    if (!toggle || !drawer) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Fechar' : 'Menu';
      drawer.hidden = !open;
      if (!open) toggle.focus();
    }

    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      setOpen(!isOpen);
    });

    $$('a', drawer).forEach(a => {
      a.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = 'Menu';
        drawer.hidden = true;
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
      }
    });
  })();

  /* =========================================================================
     3. FASE 1 — SINCRONIZAÇÃO TIPOGRÁFICA COM O FRAME + 5 PLANOS DE CÂMARA
     ========================================================================= */
  (() => {
    const hero = $('[data-k-hero]');
    if (!hero) return;
    const video = $('video[data-k-scrub]', hero);
    const titleMotions = $$('.hero-title-motion', hero);
    const stepButtons = $$('[data-hero-step]', hero);
    const stepLabel = $('[data-hero-step-label]', hero);
    const prevBtn = $('[data-hero-prev]', hero);
    const nextBtn = $('[data-hero-next]', hero);
    const exploreBtn = $('[data-hero-explore]', hero);

    const STEP_TARGETS = [
      { p: 0.04, label: '01 / 05 · Estúdio' },
      { p: 0.34, label: '02 / 05 · Saída' },
      { p: 0.56, label: '03 / 05 · Avenida' },
      { p: 0.70, label: '04 / 05 · Aproximação' },
      { p: 0.90, label: '05 / 05 · Chegada' }
    ];

    let activeStep = 0;
    let animatingScroll = false;

    function applyFrameTypography(t, dur) {
      if (REDUCED.matches || hero.classList.contains('k-static') || !dur) {
        titleMotions.forEach(el => {
          el.style.removeProperty('--ft-tx');
          el.style.removeProperty('--ft-ty');
          el.style.removeProperty('--ft-sc');
        });
        return;
      }
      const p = clamp(t / dur, 0, 1);
      // Movimento ligado ao deslocamento do carro preto: desliza e assenta junto ao scroll
      const glide = Math.sin(p * Math.PI * 2) * 18;
      const scale = 1 - Math.sin(p * Math.PI) * 0.025;
      titleMotions.forEach(el => {
        el.style.setProperty('--ft-tx', `${glide.toFixed(2)}px`);
        el.style.setProperty('--ft-ty', '0px');
        el.style.setProperty('--ft-sc', scale.toFixed(4));
      });
    }

    function updateStepUI(p) {
      let idx = 0;
      if (p >= 0.76) idx = 4;
      else if (p >= 0.52) idx = 3;
      else if (p >= 0.40) idx = 2;
      else if (p >= 0.22) idx = 1;
      activeStep = idx;
      if (stepLabel) stepLabel.textContent = STEP_TARGETS[idx].label;
      stepButtons.forEach((b, i) => {
        if (i === idx) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
      });
      if (prevBtn) prevBtn.disabled = idx === 0;
    }

    // Fallback seguro caso o utilizador abra o index.html directamente via file:// (onde fetch() de Blob é bloqueado)
    if (window.location.protocol === 'file:' && video && !REDUCED.matches) {
      const mobile = window.matchMedia('(max-width: 720px)').matches;
      const directSrc = (mobile && video.dataset.srcMobile) || video.dataset.src;
      if (directSrc && !video.src) {
        video.src = directSrc;
        video.load();
        video.addEventListener('loadeddata', () => {
          hero.classList.remove('k-media-failed', 'k-static');
          hero.classList.add('k-media-ready');
          const syncLocal = () => {
            const r = hero.getBoundingClientRect();
            const range = Math.max(1, hero.offsetHeight - window.innerHeight);
            const p = clamp(-r.top / range, 0, 1);
            if (isFinite(video.duration)) video.currentTime = clamp(p * video.duration, 0, video.duration - 0.04);
          };
          window.addEventListener('scroll', syncLocal, { passive: true });
          syncLocal();
        }, { once: true });
      }
    }

    if (video) {
      const onFrame = () => {
        if (video.duration) {
          applyFrameTypography(video.currentTime, video.duration);
          updateStepUI(video.currentTime / video.duration);
        }
      };
      video.addEventListener('seeked', onFrame);
      video.addEventListener('loadeddata', onFrame);
      if ('requestVideoFrameCallback' in video) {
        const pump = () => {
          onFrame();
          video.requestVideoFrameCallback(pump);
        };
        video.requestVideoFrameCallback(pump);
      }
    }

    window.addEventListener('scroll', () => {
      const r = hero.getBoundingClientRect();
      const range = hero.offsetHeight - window.innerHeight;
      if (range > 0) updateStepUI(clamp(-r.top / range, 0, 1));
    }, { passive: true });

    function goToStep(index) {
      if (index >= STEP_TARGETS.length) {
        const frota = $('#frota');
        if (frota) frota.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth' });
        return;
      }
      const idx = clamp(index, 0, STEP_TARGETS.length - 1);
      if (animatingScroll) return;
      SoundEngine.cueTransition();

      if (hero.classList.contains('k-static') || REDUCED.matches) {
        updateStepUI(STEP_TARGETS[idx].p);
        return;
      }

      const heroTop = hero.getBoundingClientRect().top + window.scrollY;
      const range = Math.max(0, hero.offsetHeight - window.innerHeight);
      const targetY = heroTop + range * STEP_TARGETS[idx].p;
      const startY = window.scrollY;
      const delta = targetY - startY;
      if (Math.abs(delta) < 4) return;

      animatingScroll = true;
      const duration = 1200;
      const t0 = performance.now();
      const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

      function stepScroll(now) {
        const elapsed = clamp((now - t0) / duration, 0, 1);
        window.scrollTo(0, startY + delta * easeInOut(elapsed));
        if (elapsed < 1) requestAnimationFrame(stepScroll);
        else animatingScroll = false;
      }
      requestAnimationFrame(stepScroll);
    }

    stepButtons.forEach((btn, i) => btn.addEventListener('click', () => goToStep(i)));
    if (prevBtn) prevBtn.addEventListener('click', () => goToStep(activeStep - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToStep(activeStep + 1));
    if (exploreBtn) exploreBtn.addEventListener('click', () => goToStep(1));

    // Teclado e toque no palco do hero
    hero.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goToStep(activeStep + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goToStep(activeStep - 1); }
    });

    let touchStartX = null;
    hero.addEventListener('touchstart', e => {
      if (e.touches.length === 1) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    hero.addEventListener('touchend', e => {
      if (touchStartX === null || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 48) goToStep(dx < 0 ? activeStep + 1 : activeStep - 1);
    }, { passive: true });
  })();

  /* =========================================================================
     4. FROTA + DETALHES MODAL + SINCRONIZAÇÃO COM EXPERIÊNCIA E FORMULÁRIO
     ========================================================================= */
  const FLEET = [
    {
      name: 'Audi A8 L Horch · Gala',
      category: 'Berlina Executiva · Real',
      summary: 'Cabine longa de primeira classe com conforto traseiro superior, motorista fardado e chegada serena.',
      seats: 'Até 4 passageiros (3 traseiros)',
      color: 'Preto Gala & Dourado Champanhe',
      driver: 'Incluído, protocolo de cerimónia',
      terms: 'Percurso, espera e horas definidos por proposta',
      price: 'Sob consulta',
      moments: [
        'Condição · Audi A8 L Horch: motorista em traje formal 20 min antes da hora marcada.',
        'Condição · Audi A8 L Horch: porta traseira longa e estofos protegidos para o vestido.',
        'Condição · Audi A8 L Horch: isolamento acústico duplo e rota directa até ao salão.'
      ],
      gallery: [
        { src: 'assets/frota-horch-claro-perfil.webp', alt: 'Perfil lateral do Audi A8 L Horch em estúdio claro' },
        { src: 'assets/frota-horch-claro-frente.webp', alt: 'Frente imponente do Audi A8 L Horch com grelha dourada' },
        { src: 'assets/frota-horch-claro-tras.webp', alt: 'Traseira do Audi A8 L Horch em estúdio de mármore' },
        { src: 'assets/frota-horch-claro-topo.webp', alt: 'Vista superior da carroçaria preta com frisos dourados' },
        { src: 'assets/frota-horch-interior-frente.webp', alt: 'Painel frontal com acabamentos em dourado champanhe' },
        { src: 'assets/frota-horch-interior-tras.webp', alt: 'Bancos traseiros executivos com bordado Horch' }
      ]
    },
    {
      name: 'Manhart Range Rover SV 650',
      category: 'SUV de Luxo · Real',
      summary: 'SUV imponente com faixa dourada e jantes forjadas, preparado para entradas de destaque e cortejos urbanos.',
      seats: 'Até 4 passageiros',
      color: 'Preto Brilhante & Faixa Dourada',
      driver: 'Incluído, fardamento de gala',
      terms: 'Disponível para cerimónia, sessão fotográfica e transfer',
      price: 'Sob consulta',
      moments: [
        'Condição · Manhart SV 650: acesso elevado facilitado e tapete limpo em todas as paragens.',
        'Condição · Manhart SV 650: presença fotográfica marcante em estúdio ou exterior.',
        'Condição · Manhart SV 650: suspensão pneumática suave para o transfer até à recepção.'
      ],
      gallery: [
        { src: 'assets/frota-manhart-perfil.webp', alt: 'Perfil lateral do Manhart Range Rover SV 650 com jantes douradas' },
        { src: 'assets/frota-manhart-frente.webp', alt: 'Frente do Manhart Range Rover SV 650 em showroom' },
        { src: 'assets/frota-manhart-tras.webp', alt: 'Traseira do Manhart Range Rover SV 650' },
        { src: 'assets/frota-manhart-topo.webp', alt: 'Vista superior do Manhart Range Rover SV 650' },
        { src: 'assets/frota-sv-interior-cockpit.webp', alt: 'Interior em pele clara e madeira nobre do Range Rover SV' }
      ]
    },
    {
      name: 'Range Rover SV · Branco Pérola',
      category: 'SUV Nupcial · Real',
      summary: 'Branco pérola com detalhes em dourado champanhe, luminoso sob luz natural para casamentos de dia.',
      seats: 'Até 4 passageiros',
      color: 'Branco Pérola & Dourado Champanhe',
      driver: 'Incluído, protocolo nupcial',
      terms: 'Ideal para cerimónias diurnas e quintas exteriores',
      price: 'Sob consulta',
      moments: [
        'Condição · SV Branco Pérola: preparação exterior espelhada na manhã da cerimónia.',
        'Condição · SV Branco Pérola: tom branco pérola harmonizado com o traje nupcial.',
        'Condição · SV Branco Pérola: climatização bi-zona para o percurso após a cerimónia.'
      ],
      gallery: [
        { src: 'assets/frota-branco-poster.webp', alt: 'Perfil do Range Rover SV Branco Pérola em movimento na avenida' },
        { src: 'assets/frota-branco-angulo.webp', alt: 'Detalhe lateral do Range Rover SV Branco Pérola e friso dourado' },
        { src: 'assets/frota-branco-chegada.webp', alt: 'Range Rover SV Branco Pérola a chegar junto a edifício moderno' }
      ]
    },
    {
      name: 'Audi A8 L Horch · Edição Gala Noite',
      category: 'Limusina Nocturna · Real',
      summary: 'Configuração de gala com tecto panorâmico estrelado e atmosfera acolhedora para casamentos ao entardecer.',
      seats: 'Até 4 passageiros (3 traseiros)',
      color: 'Preto Gala & Interior Estrelado',
      driver: 'Incluído, serviço nocturno completo',
      terms: 'Inclui tempo de espera para recepção e saída dos noivos',
      price: 'Sob consulta',
      moments: [
        'Condição · Gala Noite: iluminação exterior de boas-vindas na chegada à igreja ou salão.',
        'Condição · Gala Noite: tecto panorâmico estrelado como cenário para retratos íntimos.',
        'Condição · Gala Noite: regresso reservado ao hotel após o final da recepção.'
      ],
      gallery: [
        { src: 'assets/frota-horch-noite-perfil.webp', alt: 'Audi A8 L Horch em salão de mármore escuro com luz quente' },
        { src: 'assets/frota-horch-noite-frente.webp', alt: 'Vista frontal do Audi A8 L Horch edição nocturna' },
        { src: 'assets/frota-horch-noite-tras.webp', alt: 'Assinatura luminosa traseira do Audi A8 L Horch' },
        { src: 'assets/frota-horch-noite-tecto.webp', alt: 'Interior com tecto panorâmico iluminado em padrão estrelado' }
      ]
    },
    {
      name: 'Ainda estamos a escolher',
      category: 'Perfil ilustrativo · Sob encomenda',
      summary: 'Exemplo ilustrativo de curadoria clássica ou descapotável sob consulta antecipada. Para disponibilidade imediata, recomendamos os modelos reais.',
      seats: 'Consoante modelo disponível',
      color: 'Várias opções sob encomenda',
      driver: 'Incluído conforme proposta',
      terms: 'Sujeito a reserva com antecedência mínima de 60 dias',
      price: 'Sob consulta',
      moments: [
        'Condição · Sob encomenda: confirmação sujeita à data e local da cerimónia.',
        'Condição · Sob encomenda: possibilidade de combinar carro principal e apoio.',
        'Condição · Sob encomenda: equipa dedica proposta com alternativas equivalentes.'
      ],
      gallery: [
        { src: 'assets/frota-ilustrativo-perfil.webp', alt: 'Vista superior ilustrativa de berlina clássica de gala' },
        { src: 'assets/frota-ilustrativo-interior.webp', alt: 'Detalhe ilustrativo de interior em pele e acabamentos dourados' }
      ]
    }
  ];

  (() => {
    const cards = $$('[data-fleet-card]');
    const indexBtns = $$('[data-fleet-pick]');
    const prevBtn = $('[data-fleet-prev]');
    const nextBtn = $('[data-fleet-next]');
    const counterEl = $('[data-fleet-counter]');

    const panelCategory = $('[data-panel-category]');
    const panelTitle = $('[data-panel-title]');
    const panelSummary = $('[data-panel-summary]');
    const panelSeats = $('[data-panel-seats]');
    const panelColor = $('[data-panel-color]');
    const panelDriver = $('[data-panel-driver]');
    const panelTerms = $('[data-panel-terms]');
    const panelPrice = $('[data-panel-price]');
    const panelBook = $('[data-panel-book]');
    const panelDetails = $('[data-panel-details]');

    const expCarName = $('[data-active-car-name]');
    const m1 = $('[data-moment-1]');
    const m2 = $('[data-moment-2]');
    const m3 = $('[data-moment-3]');
    const selectViatura = $('#f-viatura');

    let activeIdx = 0;

    function syncFleetVideos() {
      cards.forEach((card, i) => {
        const vid = $('video[data-fleet-video]', card);
        if (!vid) return;
        const rect = card.getBoundingClientRect();
        const visible = rect.bottom > 0 && rect.top < window.innerHeight;
        if (i === activeIdx && visible && !REDUCED.matches) {
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      });
    }

    function setActiveFleet(idx, scrollCard = false) {
      activeIdx = clamp(idx, 0, FLEET.length - 1);
      const item = FLEET[activeIdx];

      cards.forEach((c, i) => c.classList.toggle('is-active', i === activeIdx));
      indexBtns.forEach((b, i) => {
        if (i === activeIdx) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      if (counterEl) counterEl.textContent = `0${activeIdx + 1} / 0${FLEET.length}`;

      if (panelCategory) panelCategory.textContent = item.category;
      if (panelTitle) panelTitle.textContent = item.name;
      if (panelSummary) panelSummary.textContent = item.summary;
      if (panelSeats) panelSeats.textContent = item.seats;
      if (panelColor) panelColor.textContent = item.color;
      if (panelDriver) panelDriver.textContent = item.driver;
      if (panelTerms) panelTerms.textContent = item.terms;
      if (panelPrice) panelPrice.textContent = item.price;

      if (expCarName) expCarName.textContent = item.name;
      if (m1) m1.textContent = item.moments[0];
      if (m2) m2.textContent = item.moments[1];
      if (m3) m3.textContent = item.moments[2];

      if (scrollCard && cards[activeIdx]) {
        cards[activeIdx].scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'center' });
      }
      syncFleetVideos();
    }

    indexBtns.forEach((b, i) => b.addEventListener('click', () => setActiveFleet(i, true)));
    if (prevBtn) prevBtn.addEventListener('click', () => setActiveFleet((activeIdx - 1 + FLEET.length) % FLEET.length));
    if (nextBtn) nextBtn.addEventListener('click', () => setActiveFleet((activeIdx + 1) % FLEET.length));

    // Sincronizar montra vertical no desktop durante o scroll
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        if (window.innerWidth <= 1060) return;
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.dataset.fleetCard);
            if (!Number.isNaN(idx) && idx !== activeIdx) setActiveFleet(idx, false);
          }
        });
      }, { rootMargin: '-40% 0px -40% 0px', threshold: 0.1 });
      cards.forEach(c => io.observe(c));
    }

    window.addEventListener('scroll', syncFleetVideos, { passive: true });

    // Carrega e pausa o vídeo principal da Experiência consoante visibilidade (nunca descarrega em reduced motion)
    const expVideo = $('[data-exp-video]');
    if (expVideo && 'IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        if (REDUCED.matches) return;
        if (es[0].isIntersecting) {
          if (!expVideo.src && expVideo.dataset.src) {
            expVideo.src = expVideo.dataset.src;
            expVideo.load();
          }
          expVideo.play().catch(() => {});
        } else {
          expVideo.pause();
        }
      }, { rootMargin: '120px 0px', threshold: 0.05 }).observe(expVideo);
    }

    function selectVehicleAndScroll(vehicleName) {
      if (selectViatura) {
        const opt = [...selectViatura.options].find(o => o.value === vehicleName);
        selectViatura.value = opt ? vehicleName : 'Ainda estamos a escolher';
      }
      const contact = $('#contacto');
      if (contact) contact.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth' });
      const firstInput = $('#f-nome');
      if (firstInput) setTimeout(() => firstInput.focus({ preventScroll: true }), 450);
    }

    $$('[data-book-vehicle]').forEach(btn => {
      btn.addEventListener('click', () => selectVehicleAndScroll(btn.dataset.bookVehicle));
    });
    if (panelBook) {
      panelBook.addEventListener('click', () => selectVehicleAndScroll(FLEET[activeIdx].name));
    }

    // Modal acessível de detalhes da viatura
    const dialog = $('#vehicle-dialog');
    const dMainImg = $('#dialog-main-img');
    const dThumbs = $('#dialog-thumbs');
    const dKicker = $('#dialog-kicker');
    const dTitle = $('#dialog-title');
    const dDesc = $('#dialog-desc');
    const dSeats = $('#dialog-seats');
    const dColor = $('#dialog-color');
    const dDriver = $('#dialog-driver');
    const dTerms = $('#dialog-terms');
    const dPrice = $('#dialog-price');
    const dBook = $('#dialog-book');
    const dClose = $('#dialog-close');
    const dCloseBtn = $('#dialog-close-btn');

    let returnFocusEl = null;
    let dialogIdx = 0;

    function openDetails(idx, triggerEl) {
      dialogIdx = clamp(idx, 0, FLEET.length - 1);
      const item = FLEET[dialogIdx];
      returnFocusEl = triggerEl || document.activeElement;

      dKicker.textContent = item.category;
      dTitle.textContent = item.name;
      dDesc.textContent = item.summary;
      dSeats.textContent = item.seats;
      dColor.textContent = item.color;
      dDriver.textContent = item.driver;
      dTerms.textContent = item.terms;
      dPrice.textContent = item.price;

      dThumbs.innerHTML = '';
      item.gallery.forEach((g, gi) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dialog-thumb';
        b.setAttribute('aria-pressed', String(gi === 0));
        b.setAttribute('aria-label', g.alt);
        const im = document.createElement('img');
        im.src = g.src;
        im.alt = '';
        im.width = 144;
        im.height = 90;
        b.appendChild(im);
        b.addEventListener('click', () => {
          dMainImg.src = g.src;
          dMainImg.alt = g.alt;
          $$('.dialog-thumb', dThumbs).forEach((tb, ti) => tb.setAttribute('aria-pressed', String(ti === gi)));
        });
        dThumbs.appendChild(b);
      });

      dMainImg.src = item.gallery[0].src;
      dMainImg.alt = item.gallery[0].alt;

      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dClose.focus();
    }

    function closeDetails() {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
      if (returnFocusEl && typeof returnFocusEl.focus === 'function') returnFocusEl.focus();
    }

    $$('[data-open-details]').forEach(btn => {
      btn.addEventListener('click', () => openDetails(Number(btn.dataset.openDetails), btn));
    });
    if (panelDetails) {
      panelDetails.addEventListener('click', () => openDetails(activeIdx, panelDetails));
    }
    if (dClose) dClose.addEventListener('click', closeDetails);
    if (dCloseBtn) dCloseBtn.addEventListener('click', closeDetails);
    if (dBook) {
      dBook.addEventListener('click', () => {
        const chosen = FLEET[dialogIdx].name;
        closeDetails();
        selectVehicleAndScroll(chosen);
      });
    }
    if (dialog) {
      dialog.addEventListener('cancel', e => {
        e.preventDefault();
        closeDetails();
      });
    }

    setActiveFleet(0, false);
  })();

  /* =========================================================================
     5. COMO RESERVAR — TRÊS CARTÕES EM ARCO
     ========================================================================= */
  (() => {
    const deck = $('[data-steps-deck]');
    if (!deck) return;
    const cards = $$('[data-step-card]', deck);
    const prevBtn = $('[data-step-prev]', deck);
    const nextBtn = $('[data-step-next]', deck);
    const status = $('[data-step-status]', deck);

    let current = 0;

    function renderArc() {
      const n = cards.length;
      cards.forEach((c, i) => {
        if (i === current) c.dataset.pos = 'active';
        else if (i === (current + 1) % n) c.dataset.pos = 'next';
        else c.dataset.pos = 'prev';
      });
      if (status) status.textContent = `Passo ${current + 1} de ${n}`;
    }

    function go(delta) {
      current = (current + delta + cards.length) % cards.length;
      SoundEngine.cueTransition();
      renderArc();
    }

    cards.forEach((c, i) => c.addEventListener('click', () => {
      if (i !== current) { current = i; SoundEngine.cueTransition(); renderArc(); }
    }));
    if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => go(1));

    deck.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });

    let sx = null;
    deck.addEventListener('touchstart', e => { if (e.touches.length === 1) sx = e.touches[0].clientX; }, { passive: true });
    deck.addEventListener('touchend', e => {
      if (sx === null || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    renderArc();
  })();

  /* =========================================================================
     6. FORMULÁRIO DE RESERVA — VALIDAÇÃO JUNTO DO CAMPO + RECUPERAÇÃO
     ========================================================================= */
  (() => {
    const form = $('#reserva-form');
    if (!form) return;

    const sentBox = $('[data-form-sent]', form);
    const errBox = $('[data-form-error]', form);
    const errMsg = $('[data-error-msg]', form);
    const submitBtn = $('[data-submit-btn]', form);
    const copyBtn = $('[data-copy-summary]', form);

    const fields = [
      { id: 'f-nome', err: 'err-nome', msg: 'Indiquem o nome completo dos noivos ou de contacto.' },
      { id: 'f-telefone', err: 'err-telefone', msg: 'Introduzam um número de telefone ou WhatsApp válido.' },
      { id: 'f-email', err: 'err-email', msg: 'Introduzam um endereço de e-mail válido.' },
      { id: 'f-data', err: 'err-data', msg: 'Seleccionem a data prevista do casamento.' },
      { id: 'f-local', err: 'err-local', msg: 'Indiquem o local da cerimónia.' }
    ];

    function clearFieldError(input, errEl) {
      input.removeAttribute('aria-invalid');
      if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
    }

    function validateAll() {
      let firstInvalid = null;
      for (const f of fields) {
        const input = $('#' + f.id);
        const errEl = $('#' + f.err);
        if (!input) continue;
        const val = input.value.trim();
        let invalid = !val;
        if (!invalid && input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) invalid = true;
        if (!invalid && f.id === 'f-telefone' && val.replace(/\D/g, '').length < 7) invalid = true;

        if (invalid) {
          input.setAttribute('aria-invalid', 'true');
          if (errEl) { errEl.textContent = f.msg; errEl.hidden = false; }
          if (!firstInvalid) firstInvalid = input;
        } else {
          clearFieldError(input, errEl);
        }
      }
      if (firstInvalid) firstInvalid.focus();
      return !firstInvalid;
    }

    fields.forEach(f => {
      const input = $('#' + f.id);
      const errEl = $('#' + f.err);
      if (input) input.addEventListener('input', () => clearFieldError(input, errEl));
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const data = new FormData(form);
        const summary = [
          'Pedido de Disponibilidade · Limusina',
          `Nome: ${data.get('nome') || ''}`,
          `Telefone/WhatsApp: ${data.get('telefone') || ''}`,
          `E-mail: ${data.get('email') || ''}`,
          `Data do casamento: ${data.get('data_casamento') || ''}`,
          `Viatura: ${data.get('viatura') || ''}`,
          `Local da cerimónia: ${data.get('local_cerimonia') || ''}`,
          `Horário: ${data.get('horario') || '-'}`,
          `Recolha: ${data.get('local_recolha') || '-'}`,
          `Destino: ${data.get('destino') || '-'}`,
          `Observações: ${data.get('observacoes') || '-'}`
        ].join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(summary).then(() => {
            copyBtn.textContent = 'Resumo copiado';
            setTimeout(() => { copyBtn.textContent = 'Copiar resumo do pedido'; }, 2500);
          }).catch(() => {});
        }
      });
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (sentBox) sentBox.hidden = true;
      if (errBox) errBox.hidden = true;
      if (!validateAll()) return;

      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || 'Serviço de recepção indisponível');

        form.reset();
        if (sentBox) { sentBox.hidden = false; sentBox.focus(); }
      } catch (_err) {
        // Preserva todos os dados preenchidos em caso de falha ou pré-visualização estática
        if (errMsg) {
          errMsg.textContent = 'O serviço de recepção automática não respondeu neste ambiente (os dados que preencheram foram preservados). Tentem novamente quando publicado ou copiem o resumo abaixo.';
        }
        if (errBox) { errBox.hidden = false; errBox.focus(); }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  })();
})();
