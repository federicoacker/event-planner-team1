// scripts/script.js
(() => {
    'use strict';

    /**
     * Stato globale dell'applicazione
     */
    const state = {
        event: {
            name: '',
            date: '',
            time: '',
            category: 'client_meeting',
            budget: 7500,
            maxParticipants: 40,
            extras: [] // ['catering', 'music', ...]
        },
        guests: [], // { id, name, rsvp }
        nextGuestId: 1
    };

    const RSVP_STATES = ['confirmed', 'canceled', 'pending'];
    const RSVP_LABELS = {
        confirmed: 'Confermato',
        canceled: 'Annullato',
        pending: 'In attesa'
    };

    let currencyFormatter;
    try {
        currencyFormatter = new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0
        });
    } catch {
        currencyFormatter = null;
    }

    /**
     * Utility: formatta il budget come testo leggibile
     */
    function formatBudget(value) {
        const num = Number(value) || 0;
        if (currencyFormatter) {
            return currencyFormatter.format(num);
        }
        return `${num.toLocaleString('it-IT')} EUR`;
    }

    /**
     * Inizializza lo stato a partire dal DOM (mock statico già presente)
     */
    function hydrateStateFromDOM() {
        const guestList = document.querySelector('#guest-list');
        if (!guestList) return;

        const cards = guestList.querySelectorAll('.ep-guest-card');
        let maxId = 0;

        cards.forEach((card) => {
            const idAttr = card.dataset.guestId;
            const nameEl = card.querySelector('.ep-guest-card__name');
            const rawStatus = card.dataset.rsvpStatus || 'pending';

            const id = idAttr ? Number(idAttr) : NaN;
            if (!nameEl) return;

            const guest = {
                id: Number.isFinite(id) ? id : undefined,
                name: nameEl.textContent.trim(),
                rsvp: RSVP_STATES.includes(rawStatus) ? rawStatus : 'pending'
            };

            state.guests.push(guest);
            if (Number.isFinite(id) && id > maxId) maxId = id;
        });

        state.nextGuestId = maxId + 1;

        // Imposta budget iniziale dallo slider, se presente
        const budgetInput = document.querySelector('#event-budget');
        if (budgetInput) {
            state.event.budget = Number(budgetInput.value) || state.event.budget;
        }

        // Imposta maxParticipants iniziale
        const maxInput = document.querySelector('#event-max-participants');
        if (maxInput) {
            state.event.maxParticipants = Number(maxInput.value) || state.event.maxParticipants;
        }

        // Aggiorna subito riepilogo su base stato
        renderEventSummary();
        renderConfirmedGuests();
        renderRsvpSummary();
    }

    /**
     * Associa tutti gli event listener principali
     */
    function bindEventListeners() {
        const eventForm = document.querySelector('#event-form');
        const guestForm = document.querySelector('#guest-form');
        const guestList = document.querySelector('#guest-list');
        const budgetInput = document.querySelector('#event-budget');
        const categoryRadios = document.querySelectorAll(
            '#event-category-group .ep-radio-input'
        );

        if (eventForm) {
            eventForm.addEventListener('submit', handleEventFormSubmit);
        }

        if (guestForm) {
            guestForm.addEventListener('submit', handleGuestFormSubmit);
        }

        if (guestList) {
            // Delegation per pulsanti RSVP / delete
            guestList.addEventListener('click', handleGuestListClick);
        }

        if (budgetInput) {
            budgetInput.addEventListener('input', handleBudgetInput);
        }

        if (categoryRadios.length) {
            categoryRadios.forEach((radio) => {
                radio.addEventListener('change', handleCategoryChange);
            });
        }
    }

    /**
     * Gestisce submit del form evento
     */
    function handleEventFormSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const nameInput = form.querySelector('#event-name');
        const dateInput = form.querySelector('#event-date');
        const timeInput = form.querySelector('#event-time');
        const maxInput = form.querySelector('#event-max-participants');
        const budgetInput = form.querySelector('#event-budget');
        const categoryRadioChecked = form.querySelector(
            'input[name="eventCategory"]:checked'
        );
        const extrasInputs = form.querySelectorAll('input[name="extraServices"]');

        state.event.name = nameInput?.value.trim() || '';
        state.event.date = dateInput?.value || '';
        state.event.time = timeInput?.value || '';
        state.event.maxParticipants = maxInput?.value
            ? Number(maxInput.value)
            : state.event.maxParticipants;
        state.event.budget = budgetInput?.value
            ? Number(budgetInput.value)
            : state.event.budget;
        state.event.category = categoryRadioChecked?.value || state.event.category;

        const extras = [];
        extrasInputs.forEach((input) => {
            if (input.checked && input.value) extras.push(input.value);
        });
        state.event.extras = extras;

        renderEventSummary();
    }

    /**
     * Gestisce il submit del form invitato
     */
    function handleGuestFormSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const nameInput = form.querySelector('#guest-name');
        const rsvpSelect = form.querySelector('#guest-rsvp');

        const name = nameInput?.value.trim();
        const rsvp = rsvpSelect?.value || 'pending';

        if (!name) {
            // Fallback semplice: in produzione potresti usare validazione custom
            nameInput?.focus();
            return;
        }

        const guest = {
            id: state.nextGuestId++,
            name,
            rsvp: RSVP_STATES.includes(rsvp) ? rsvp : 'pending'
        };

        state.guests.push(guest);
        appendGuestCard(guest);
        renderConfirmedGuests();
        renderRsvpSummary();

        form.reset();
        if (rsvpSelect) {
            rsvpSelect.value = 'confirmed';
        }
    }

    /**
     * Gestisce click nella lista invitati (delegation)
     */
    function handleGuestListClick(event) {
        const actionBtn = event.target.closest('button[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const card = actionBtn.closest('.ep-guest-card');
        if (!card) return;

        const guestId = Number(card.dataset.guestId);
        if (!Number.isFinite(guestId)) return;

        if (action === 'toggle-rsvp') {
            toggleGuestRsvp(guestId, card);
        } else if (action === 'delete-guest') {
            deleteGuest(guestId, card);
        }
    }

    /**
     * Gestisce input sullo slider budget (solo UI)
     */
    function handleBudgetInput(event) {
        const value = event.target.value;
        const output = document.querySelector('#event-budget-output');
        if (!output) return;

        output.textContent = formatBudget(value);
    }

    /**
     * Gestisce cambio categoria evento (aggiorna pill attive)
     */
    function handleCategoryChange(event) {
        const group = document.querySelector('#event-category-group');
        if (!group) return;

        const labels = group.querySelectorAll('.ep-segmented-control__item');
        labels.forEach((label) =>
            label.classList.remove('ep-segmented-control__item--active')
        );

        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;

        const label = group.querySelector(`label[for="${input.id}"]`);
        if (label) {
            label.classList.add('ep-segmented-control__item--active');
        }
    }

    /**
     * Aggiunge una card invitato nel DOM a partire da un oggetto guest
     */
    function appendGuestCard(guest) {
        const guestList = document.querySelector('#guest-list');
        if (!guestList) return;

        const card = document.createElement('article');
        card.className = `ep-guest-card ${getGuestStatusClass(guest.rsvp)}`;
        card.dataset.guestId = String(guest.id);
        card.dataset.rsvpStatus = guest.rsvp;

        card.innerHTML = `
      <div class="ep-guest-card__header">
        <span class="ep-guest-card__name"></span>
        <span class="ep-guest-card__status-badge"></span>
      </div>
      <div class="ep-guest-card__meta">
        <span class="ep-guest-card__role">Ruolo da definire</span>
        <div class="btn-group btn-group-sm">
          <button
            type="button"
            class="btn btn-outline-secondary ep-btn-ghost"
            data-action="toggle-rsvp"
          >
            Cambia RSVP
          </button>
          <button
            type="button"
            class="btn btn-outline-danger ep-btn-ghost"
            data-action="delete-guest"
          >
            Rimuovi
          </button>
        </div>
      </div>
    `;

        const nameEl = card.querySelector('.ep-guest-card__name');
        const badgeEl = card.querySelector('.ep-guest-card__status-badge');

        if (nameEl) nameEl.textContent = guest.name;
        if (badgeEl) badgeEl.textContent = RSVP_LABELS[guest.rsvp] || '';

        guestList.appendChild(card);
    }

    /**
     * Restituisce la classe di stato per la card in base all'RSVP
     */
    function getGuestStatusClass(rsvp) {
        switch (rsvp) {
            case 'confirmed':
                return 'ep-guest-card--confirmed';
            case 'canceled':
                return 'ep-guest-card--canceled';
            case 'pending':
            default:
                return 'ep-guest-card--pending';
        }
    }

    /**
     * Cicla lo stato RSVP di un invitato e aggiorna DOM + stato
     */
    function toggleGuestRsvp(guestId, cardEl) {
        const guest = state.guests.find((g) => g.id === guestId);
        if (!guest) return;

        const currentIndex = RSVP_STATES.indexOf(guest.rsvp);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % RSVP_STATES.length;
        const nextRsvp = RSVP_STATES[nextIndex];

        guest.rsvp = nextRsvp;

        // Aggiorna DOM card
        cardEl.dataset.rsvpStatus = nextRsvp;
        cardEl.classList.remove(
            'ep-guest-card--confirmed',
            'ep-guest-card--canceled',
            'ep-guest-card--pending'
        );
        cardEl.classList.add(getGuestStatusClass(nextRsvp));

        const badgeEl = cardEl.querySelector('.ep-guest-card__status-badge');
        if (badgeEl) {
            badgeEl.textContent = RSVP_LABELS[nextRsvp] || '';
        }

        renderConfirmedGuests();
        renderRsvpSummary();
    }

    /**
     * Elimina un invitato dallo stato e dal DOM
     */
    function deleteGuest(guestId, cardEl) {
        const index = state.guests.findIndex((g) => g.id === guestId);
        if (index === -1) return;

        state.guests.splice(index, 1);
        cardEl.remove();

        renderConfirmedGuests();
        renderRsvpSummary();
    }

    /**
     * Aggiorna il riepilogo evento (bullet list) in base allo stato.event
     * Si appoggia alla struttura già presente in .ep-invite-summary__list
     */
    function renderEventSummary() {
        const list = document.querySelector('.ep-invite-summary__list');
        if (!list) return;

        const items = list.querySelectorAll('li');
        const { name, date, time, category, budget, maxParticipants, extras } = state.event;

        const categoryLabel = getCategoryLabel(category);
        const extrasLabel = extras.length
            ? extras
                .map((e) => {
                    switch (e) {
                        case 'catering':
                            return 'Catering';
                        case 'photographer':
                            return 'Fotografo';
                        case 'music':
                            return 'Musica';
                        case 'decorations':
                            return 'Decorazioni';
                        default:
                            return e;
                    }
                })
                .join(', ')
            : 'Nessun servizio extra';

        if (items[0]) {
            items[0].innerHTML = `<strong>Nome:</strong> ${name || 'Quarterly Business Review Q3 · Client XYZ'
                }`;
        }
        if (items[1]) {
            const dateLabel = date || 'Data da definire';
            const timeLabel = time || '--:--';
            items[1].innerHTML = `<strong>Data:</strong> ${dateLabel} · <strong>Ora:</strong> ${timeLabel}`;
        }
        if (items[2]) {
            items[2].innerHTML = `<strong>Categoria:</strong> ${categoryLabel}`;
        }
        // items[3] = Location (lasciamo il mock di esempio già presente)
        if (items[4]) {
            items[4].innerHTML = `<strong>Servizi extra:</strong> ${extrasLabel}`;
        }
        if (items[5]) {
            items[5].innerHTML = `<strong>Budget indicativo:</strong> ${formatBudget(
                budget
            )}`;
        }
        if (items[6]) {
            items[6].innerHTML = `<strong>Capienza massima:</strong> ${maxParticipants || 0
                } partecipanti`;
        }
    }

    function getCategoryLabel(category) {
        switch (category) {
            case 'client_meeting':
                return 'Client Meeting';
            case 'training':
                return 'Training';
            case 'internal_offsite':
                return 'Internal Offsite';
            default:
                return category;
        }
    }

    /**
     * Aggiorna la lista degli invitati confermati all'interno del riepilogo
     */
    function renderConfirmedGuests() {
        const container = document.querySelector('#confirmed-guests');
        if (!container) return;

        const list = container.querySelector('ul');
        if (!list) return;

        const confirmed = state.guests.filter((g) => g.rsvp === 'confirmed');

        if (!confirmed.length) {
            list.innerHTML = `<li>Nessun invitato confermato al momento</li>`;
            return;
        }

        list.innerHTML = confirmed
            .map((g) => `<li>${escapeHtml(g.name)}</li>`)
            .join('');
    }

    /**
     * Aggiorna la tabella riepilogo RSVP (conteggi per stato)
     */
    function renderRsvpSummary() {
        const table = document.querySelector('#rsvp-summary');
        if (!table) return;

        const confirmedCount = state.guests.filter((g) => g.rsvp === 'confirmed').length;
        const canceledCount = state.guests.filter((g) => g.rsvp === 'canceled').length;
        const pendingCount = state.guests.filter((g) => g.rsvp === 'pending').length;

        const confirmedCell = table.querySelector('td[data-rsvp-count="confirmed"]');
        const canceledCell = table.querySelector('td[data-rsvp-count="canceled"]');
        const pendingCell = table.querySelector('td[data-rsvp-count="pending"]');

        if (confirmedCell) confirmedCell.textContent = String(confirmedCount);
        if (canceledCell) canceledCell.textContent = String(canceledCount);
        if (pendingCell) pendingCell.textContent = String(pendingCount);
    }

    /**
     * Escape semplice per evitare injection nel render di nomi invitati
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Bootstrap dell'app SPA-like
     */
    function init() {
        hydrateStateFromDOM();
        bindEventListeners();
        // Aggiorna visual budget iniziale
        const budgetInput = document.querySelector('#event-budget');
        if (budgetInput) {
            handleBudgetInput({ target: budgetInput });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();