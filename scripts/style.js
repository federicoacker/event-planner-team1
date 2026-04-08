"use strict";

/* ============================
   VARIABILI DI STATO GLOBALI
   ============================ */

// stato evento
let eventName = "";
let eventDate = "";
let eventTime = "";
let eventCategory = "client_meeting";
let eventBudget = 7500;
let eventMaxParticipants = 40;
let eventExtras = []; // array di stringhe

// stato invitati (array paralleli)
let guestIds = [];
let guestNames = [];
let guestRsvps = [];
let nextGuestId = 1;

// costanti RSVP e label
const RSVP_STATES = ["confirmed", "canceled", "pending"];
const RSVP_LABELS = ["Confermato", "Annullato", "In attesa"];

// formatter budget (opzionale)
let currencyFormatter = null;

/* ============================
   FUNZIONI DI INIZIALIZZAZIONE
   ============================ */

function initIntl() {
    try {
        currencyFormatter = new Intl.NumberFormat("it-IT", {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: 0
        });
    } catch (error) {
        currencyFormatter = null;
    }
}

function hydrateStateFromDOM() {
    let guestListElement = document.querySelector("#guest-list");
    let cards;
    let i;
    let maxId = 0;

    if (!guestListElement) {
        return;
    }

    cards = guestListElement.querySelectorAll(".ep-guest-card");

    // leggo gli invitati presenti già nell'HTML
    i = 0;
    while (i < cards.length) {
        let card = cards[i];
        let idAttr = card.getAttribute("data-guest-id");
        let nameElement = card.querySelector(".ep-guest-card__name");
        let rsvpAttr = card.getAttribute("data-rsvp-status");
        let idNumber;
        let nameText;
        let rsvpValue;

        if (!nameElement) {
            i++;
            continue;
        }

        idNumber = Number(idAttr);
        nameText = nameElement.textContent.trim();
        rsvpValue = rsvpAttr ? rsvpAttr : "pending";

        if (!isValidRsvp(rsvpValue)) {
            rsvpValue = "pending";
        }

        guestIds.push(idNumber);
        guestNames.push(nameText);
        guestRsvps.push(rsvpValue);

        if (!isNaN(idNumber) && idNumber > maxId) {
            maxId = idNumber;
        }

        i++;
    }

    nextGuestId = maxId + 1;

    // budget iniziale
    let budgetInput = document.querySelector("#event-budget");
    if (budgetInput) {
        eventBudget = Number(budgetInput.value) || eventBudget;
        updateBudgetLabel(budgetInput.value);
    }

    // max partecipanti iniziale
    let maxInput = document.querySelector("#event-max-participants");
    if (maxInput) {
        eventMaxParticipants = Number(maxInput.value) || eventMaxParticipants;
    }

    // render iniziali
    renderEventSummary();
    renderConfirmedGuests();
    renderRsvpSummary();
}

function bindEventListeners() {
    let eventForm = document.querySelector("#event-form");
    let guestForm = document.querySelector("#guest-form");
    let guestListElement = document.querySelector("#guest-list");
    let budgetInput = document.querySelector("#event-budget");
    let categoryRadios = document.querySelectorAll("#event-category-group .ep-radio-input");
    let i;

    if (eventForm) {
        eventForm.addEventListener("submit", handleEventFormSubmit);
    }

    if (guestForm) {
        guestForm.addEventListener("submit", handleGuestFormSubmit);
    }

    if (guestListElement) {
        guestListElement.addEventListener("click", handleGuestListClick);
    }

    if (budgetInput) {
        budgetInput.addEventListener("input", handleBudgetInput);
    }

    i = 0;
    while (i < categoryRadios.length) {
        let radio = categoryRadios[i];
        radio.addEventListener("change", handleCategoryChange);
        i++;
    }
}

/* ============================
   HANDLER FORM EVENTO
   ============================ */

function handleEventFormSubmit(event) {
    let form = event.target;
    let nameInput;
    let dateInput;
    let timeInput;
    let maxInput;
    let budgetInput;
    let checkedCategory;
    let extrasInputs;
    let extrasTmp = [];
    let i;

    event.preventDefault();

    nameInput = form.querySelector("#event-name");
    dateInput = form.querySelector("#event-date");
    timeInput = form.querySelector("#event-time");
    maxInput = form.querySelector("#event-max-participants");
    budgetInput = form.querySelector("#event-budget");
    checkedCategory = form.querySelector('input[name="eventCategory"]:checked');
    extrasInputs = form.querySelectorAll('input[name="extraServices"]');

    if (nameInput) {
        eventName = nameInput.value.trim();
    }

    if (dateInput) {
        eventDate = dateInput.value;
    }

    if (timeInput) {
        eventTime = timeInput.value;
    }

    if (maxInput) {
        eventMaxParticipants = Number(maxInput.value) || 0;
    }

    if (budgetInput) {
        eventBudget = Number(budgetInput.value) || 0;
        updateBudgetLabel(budgetInput.value);
    }

    if (checkedCategory) {
        eventCategory = checkedCategory.value;
    }

    i = 0;
    while (i < extrasInputs.length) {
        let input = extrasInputs[i];
        if (input.checked && input.value) {
            extrasTmp.push(input.value);
        }
        i++;
    }
    eventExtras = extrasTmp;

    renderEventSummary();
}

/* ============================
   HANDLER FORM INVITATO
   ============================ */

function handleGuestFormSubmit(event) {
    let form = event.target;
    let nameInput;
    let rsvpSelect;
    let name;
    let rsvp;
    let id;

    event.preventDefault();

    nameInput = form.querySelector("#guest-name");
    rsvpSelect = form.querySelector("#guest-rsvp");

    if (!nameInput) {
        return;
    }

    name = nameInput.value.trim();
    if (!name) {
        nameInput.focus();
        return;
    }

    if (rsvpSelect) {
        rsvp = rsvpSelect.value;
    } else {
        rsvp = "pending";
    }

    if (!isValidRsvp(rsvp)) {
        rsvp = "pending";
    }

    id = nextGuestId;
    nextGuestId++;

    guestIds.push(id);
    guestNames.push(name);
    guestRsvps.push(rsvp);

    appendGuestCard(id, name, rsvp);
    renderConfirmedGuests();
    renderRsvpSummary();

    form.reset();
    if (rsvpSelect) {
        rsvpSelect.value = "confirmed";
    }
}

/* ============================
   HANDLER LISTA INVITATI
   ============================ */

function handleGuestListClick(event) {
    let rootList = document.querySelector("#guest-list");
    let target = event.target;
    let button = null;
    let card = null;
    let action;
    let guestId;
    let index;

    if (!rootList) {
        return;
    }

    // cerco il button[data-action] risalendo il DOM con while
    while (target && target !== rootList) {
        if (target.matches && target.matches("button[data-action]")) {
            button = target;
            break;
        }
        target = target.parentNode;
    }

    if (!button) {
        return;
    }

    action = button.getAttribute("data-action");

    // cerco la card ep-guest-card partendo dal button
    card = button;
    while (card && !card.classList.contains("ep-guest-card")) {
        card = card.parentNode;
    }

    if (!card) {
        return;
    }

    guestId = Number(card.getAttribute("data-guest-id"));
    if (isNaN(guestId)) {
        return;
    }

    index = findGuestIndexById(guestId);
    if (index === -1) {
        return;
    }

    if (action === "toggle-rsvp") {
        toggleGuestRsvp(index, card);
    } else if (action === "delete-guest") {
        deleteGuest(index, card);
    }
}

/* ============================
   HANDLER BUDGET E CATEGORIA
   ============================ */

function handleBudgetInput(event) {
    let input = event.target;
    if (!input) {
        return;
    }
    updateBudgetLabel(input.value);
}

function handleCategoryChange(event) {
    let input = event.target;
    let group = document.querySelector("#event-category-group");
    let labels;
    let i;
    let label;

    if (!group || !input) {
        return;
    }

    labels = group.querySelectorAll(".ep-segmented-control__item");

    i = 0;
    while (i < labels.length) {
        labels[i].classList.remove("ep-segmented-control__item--active");
        i++;
    }

    label = group.querySelector('label[for="' + input.id + '"]');
    if (label) {
        label.classList.add("ep-segmented-control__item--active");
    }

    eventCategory = input.value;
}

/* ============================
   FUNZIONI UTILI
   ============================ */

function isValidRsvp(rsvp) {
    let i = 0;
    while (i < RSVP_STATES.length) {
        if (RSVP_STATES[i] === rsvp) {
            return true;
        }
        i++;
    }
    return false;
}

function formatBudget(value) {
    let number = Number(value);

    if (isNaN(number)) {
        number = 0;
    }

    if (currencyFormatter) {
        return currencyFormatter.format(number);
    }

    return number.toLocaleString("it-IT") + " EUR";
}

function updateBudgetLabel(value) {
    let output = document.querySelector("#event-budget-output");
    if (!output) {
        return;
    }
    output.textContent = formatBudget(value);
}

function findGuestIndexById(id) {
    let i = 0;
    while (i < guestIds.length) {
        if (guestIds[i] === id) {
            return i;
        }
        i++;
    }
    return -1;
}

function getRsvpClass(rsvp) {
    if (rsvp === "confirmed") {
        return "ep-guest-card--confirmed";
    }
    if (rsvp === "canceled") {
        return "ep-guest-card--canceled";
    }
    return "ep-guest-card--pending";
}

function getRsvpLabel(rsvp) {
    let i = 0;
    while (i < RSVP_STATES.length) {
        if (RSVP_STATES[i] === rsvp) {
            return RSVP_LABELS[i];
        }
        i++;
    }
    return "";
}

function getCategoryLabel(category) {
    if (category === "client_meeting") {
        return "Client Meeting";
    }
    if (category === "training") {
        return "Training";
    }
    if (category === "internal_offsite") {
        return "Internal Offsite";
    }
    return category;
}

function getExtraLabel(extra) {
    if (extra === "catering") {
        return "Catering";
    }
    if (extra === "photographer") {
        return "Fotografo";
    }
    if (extra === "music") {
        return "Musica";
    }
    if (extra === "decorations") {
        return "Decorazioni";
    }
    return extra;
}

/* ============================
   RENDERING DOM
   ============================ */

function appendGuestCard(id, name, rsvp) {
    let guestListElement = document.querySelector("#guest-list");
    let card;
    let statusClass;
    let nameElement;
    let badgeElement;

    if (!guestListElement) {
        return;
    }

    statusClass = getRsvpClass(rsvp);

    card = document.createElement("article");
    card.className = "ep-guest-card " + statusClass;
    card.setAttribute("data-guest-id", String(id));
    card.setAttribute("data-rsvp-status", rsvp);

    card.innerHTML =
        '<div class="ep-guest-card__header">' +
        '<span class="ep-guest-card__name"></span>' +
        '<span class="ep-guest-card__status-badge"></span>' +
        '</div>' +
        '<div class="ep-guest-card__meta">' +
        '<span class="ep-guest-card__role">Ruolo da definire</span>' +
        '<div class="btn-group btn-group-sm">' +
        '<button type="button" class="btn btn-outline-secondary ep-btn-ghost" data-action="toggle-rsvp">Cambia RSVP</button>' +
        '<button type="button" class="btn btn-outline-danger ep-btn-ghost" data-action="delete-guest">Rimuovi</button>' +
        '</div>' +
        '</div>';

    nameElement = card.querySelector(".ep-guest-card__name");
    badgeElement = card.querySelector(".ep-guest-card__status-badge");

    if (nameElement) {
        nameElement.textContent = name;
    }
    if (badgeElement) {
        badgeElement.textContent = getRsvpLabel(rsvp);
    }

    guestListElement.appendChild(card);
}

function toggleGuestRsvp(index, cardElement) {
    let currentRsvp = guestRsvps[index];
    let newRsvp;
    let position;
    let i;
    let badgeElement;

    position = 0;
    while (position < RSVP_STATES.length) {
        if (RSVP_STATES[position] === currentRsvp) {
            break;
        }
        position++;
    }

    if (position === RSVP_STATES.length) {
        position = 0;
    } else {
        position = (position + 1) % RSVP_STATES.length;
    }

    newRsvp = RSVP_STATES[position];
    guestRsvps[index] = newRsvp;

    cardElement.setAttribute("data-rsvp-status", newRsvp);
    cardElement.classList.remove(
        "ep-guest-card--confirmed",
        "ep-guest-card--canceled",
        "ep-guest-card--pending"
    );
    cardElement.classList.add(getRsvpClass(newRsvp));

    badgeElement = cardElement.querySelector(".ep-guest-card__status-badge");
    if (badgeElement) {
        badgeElement.textContent = getRsvpLabel(newRsvp);
    }

    renderConfirmedGuests();
    renderRsvpSummary();
}

function deleteGuest(index, cardElement) {
    guestIds.splice(index, 1);
    guestNames.splice(index, 1);
    guestRsvps.splice(index, 1);

    cardElement.remove();

    renderConfirmedGuests();
    renderRsvpSummary();
}

function renderEventSummary() {
    let list = document.querySelector(".ep-invite-summary__list");
    let items;
    let extrasText = "";
    let i;

    if (!list) {
        return;
    }

    items = list.querySelectorAll("li");

    // Nome
    if (items[0]) {
        if (eventName) {
            items[0].innerHTML = "<strong>Nome:</strong> " + escapeHtml(eventName);
        } else {
            items[0].innerHTML =
                "<strong>Nome:</strong> Quarterly Business Review Q3 · Client XYZ";
        }
    }

    // Data + ora
    if (items[1]) {
        let dateLabel = eventDate || "Data da definire";
        let timeLabel = eventTime || "--:--";
        items[1].innerHTML =
            "<strong>Data:</strong> " +
            escapeHtml(dateLabel) +
            " · <strong>Ora:</strong> " +
            escapeHtml(timeLabel);
    }

    // Categoria
    if (items[2]) {
        items[2].innerHTML =
            "<strong>Categoria:</strong> " + escapeHtml(getCategoryLabel(eventCategory));
    }

    // items[3] = Location (lasciamo il testo statico dell'HTML)

    // Servizi extra
    if (items[4]) {
        if (eventExtras.length > 0) {
            i = 0;
            while (i < eventExtras.length) {
                if (i > 0) {
                    extrasText += ", ";
                }
                extrasText += getExtraLabel(eventExtras[i]);
                i++;
            }
        } else {
            extrasText = "Nessun servizio extra";
        }

        items[4].innerHTML =
            "<strong>Servizi extra:</strong> " + escapeHtml(extrasText);
    }

    // Budget
    if (items[5]) {
        items[5].innerHTML =
            "<strong>Budget indicativo:</strong> " + escapeHtml(formatBudget(eventBudget));
    }

    // Capienza
    if (items[6]) {
        items[6].innerHTML =
            "<strong>Capienza massima:</strong> " +
            String(eventMaxParticipants) +
            " partecipanti";
    }
}

function renderConfirmedGuests() {
    let container = document.querySelector("#confirmed-guests");
    let list;
    let i;
    let html = "";

    if (!container) {
        return;
    }

    list = container.querySelector("ul");
    if (!list) {
        return;
    }

    i = 0;
    while (i < guestIds.length) {
        if (guestRsvps[i] === "confirmed") {
            html += "<li>" + escapeHtml(guestNames[i]) + "</li>";
        }
        i++;
    }

    if (html === "") {
        html = "<li>Nessun invitato confermato al momento</li>";
    }

    list.innerHTML = html;
}

function renderRsvpSummary() {
    let table = document.querySelector("#rsvp-summary");
    let confirmedCell;
    let canceledCell;
    let pendingCell;
    let i;
    let confirmedCount = 0;
    let canceledCount = 0;
    let pendingCount = 0;

    if (!table) {
        return;
    }

    i = 0;
    while (i < guestIds.length) {
        if (guestRsvps[i] === "confirmed") {
            confirmedCount++;
        } else if (guestRsvps[i] === "canceled") {
            canceledCount++;
        } else if (guestRsvps[i] === "pending") {
            pendingCount++;
        }
        i++;
    }

    confirmedCell = table.querySelector('td[data-rsvp-count="confirmed"]');
    canceledCell = table.querySelector('td[data-rsvp-count="canceled"]');
    pendingCell = table.querySelector('td[data-rsvp-count="pending"]');

    if (confirmedCell) {
        confirmedCell.textContent = String(confirmedCount);
    }
    if (canceledCell) {
        canceledCell.textContent = String(canceledCount);
    }
    if (pendingCell) {
        pendingCell.textContent = String(pendingCount);
    }
}

/* ============================
   ESCAPE HTML
   ============================ */

function escapeHtml(text) {
    let result = String(text);
    result = result.replace(/&/g, "&amp;");
    result = result.replace(/</g, "&lt;");
    result = result.replace(/>/g, "&gt;");
    result = result.replace(/"/g, "&quot;");
    result = result.replace(/'/g, "&#039;");
    return result;
}

/* ============================
   AVVIO APP
   ============================ */

function init() {
    initIntl();
    hydrateStateFromDOM();
    bindEventListeners();
}

document.addEventListener("DOMContentLoaded", init);