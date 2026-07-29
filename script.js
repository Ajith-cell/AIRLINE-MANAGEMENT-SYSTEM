/* =========================================================
   SkyLedger — Airline Inventory Management
   In-memory data layer + UI bindings.
   Cabins are always tracked in this fixed order:
   economy, premium, business, first
   ========================================================= */

const CABINS = [
  { key: "economy", label: "Economy" },
  { key: "premium", label: "Premium Economy" },
  { key: "business", label: "Business" },
  { key: "first", label: "First" },
];

/* ---------------------------------------------------------
   DATA STORE
   --------------------------------------------------------- */
const store = {
  aircraft: [],
  routes: [],
  flights: [],
  fares: [],
  _ids: { aircraft: 1, route: 1, flight: 1, fare: 1 },
};

function nextId(kind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1) + "-" + String(store._ids[kind]++).padStart(3, "0");
}

/* ---------------------------------------------------------
   SEED DATA — gives the console something to show on load
   --------------------------------------------------------- */
function seed() {
  const a1 = addAircraft({
    tail: "VT-SLA", type: "Airbus A321neo",
    economy: 150, premium: 24, business: 16, first: 0,
    maintenance: "2026-08-14", maintenanceNote: "A-check",
  });
  const a2 = addAircraft({
    tail: "VT-SLB", type: "Boeing 787-9",
    economy: 210, premium: 35, business: 30, first: 8,
    maintenance: "2026-09-02", maintenanceNote: "C-check",
  });
  const a3 = addAircraft({
    tail: "VT-SLC", type: "Airbus A320",
    economy: 168, premium: 0, business: 12, first: 0,
    maintenance: "2026-08-05", maintenanceNote: "Line check",
  });

  const r1 = addRoute({ source: "DEL", destination: "BOM", stops: [] });
  const r2 = addRoute({ source: "BLR", destination: "LHR", stops: ["DEL"] });
  const r3 = addRoute({ source: "MAA", destination: "SIN", stops: [] });

  const f1 = addFlight({ flightNumber: "SL 204", routeId: r1.id, aircraftId: a1.id, date: "2026-07-30", time: "06:15" });
  const f2 = addFlight({ flightNumber: "SL 811", routeId: r2.id, aircraftId: a2.id, date: "2026-07-30", time: "23:40" });
  const f3 = addFlight({ flightNumber: "SL 552", routeId: r3.id, aircraftId: a3.id, date: "2026-07-31", time: "14:05" });

  bookSeats(f1.id, "economy", 132);
  bookSeats(f1.id, "premium", 20);
  bookSeats(f1.id, "business", 16);
  bookSeats(f2.id, "economy", 90);
  bookSeats(f2.id, "business", 30);
  bookSeats(f3.id, "economy", 168);
  bookSeats(f3.id, "business", 4);

  addFare({ flightId: f1.id, cabin: "economy", fareName: "Y — Full Flex", price: 8200, allocated: 40 });
  addFare({ flightId: f1.id, cabin: "economy", fareName: "Q — Saver", price: 4300, allocated: 110 });
  addFare({ flightId: f1.id, cabin: "business", fareName: "C — Business Flex", price: 21000, allocated: 16 });
  addFare({ flightId: f2.id, cabin: "economy", fareName: "Y — Full Flex", price: 46000, allocated: 60 });
  addFare({ flightId: f2.id, cabin: "business", fareName: "C — Business Flex", price: 145000, allocated: 30 });
}

/* ---------------------------------------------------------
   AIRCRAFT MANAGEMENT
   --------------------------------------------------------- */
function addAircraft(data) {
  const record = {
    id: nextId("aircraft"),
    tail: data.tail,
    type: data.type,
    config: {
      economy: Number(data.economy) || 0,
      premium: Number(data.premium) || 0,
      business: Number(data.business) || 0,
      first: Number(data.first) || 0,
    },
    maintenance: data.maintenance || "",
    maintenanceNote: data.maintenanceNote || "",
  };
  store.aircraft.push(record);
  return record;
}

function capacityOf(aircraft) {
  return CABINS.reduce((sum, c) => sum + aircraft.config[c.key], 0);
}

function removeAircraft(id) {
  const inUse = store.flights.some(f => f.aircraftId === id && f.status !== "cancelled");
  if (inUse) {
    return { ok: false, message: "Cannot remove aircraft — it is assigned to an active flight." };
  }
  store.aircraft = store.aircraft.filter(a => a.id !== id);
  return { ok: true };
}

/* ---------------------------------------------------------
   ROUTE MANAGEMENT
   --------------------------------------------------------- */
function addRoute(data) {
  const record = {
    id: nextId("route"),
    source: data.source.toUpperCase(),
    destination: data.destination.toUpperCase(),
    stops: (data.stops || []).map(s => s.trim().toUpperCase()).filter(Boolean),
  };
  store.routes.push(record);
  return record;
}

function removeRoute(id) {
  const inUse = store.flights.some(f => f.routeId === id && f.status !== "cancelled");
  if (inUse) {
    return { ok: false, message: "Cannot remove route — flights are still scheduled on it." };
  }
  store.routes = store.routes.filter(r => r.id !== id);
  return { ok: true };
}

/* ---------------------------------------------------------
   FLIGHT MANAGEMENT + SEAT INVENTORY
   --------------------------------------------------------- */
function buildInventoryFromAircraft(aircraft) {
  const inv = {};
  CABINS.forEach(c => {
    inv[c.key] = { total: aircraft.config[c.key], booked: 0 };
  });
  return inv;
}

function addFlight(data) {
  const aircraft = store.aircraft.find(a => a.id === data.aircraftId);
  const record = {
    id: nextId("flight"),
    flightNumber: data.flightNumber,
    routeId: data.routeId,
    aircraftId: data.aircraftId,
    date: data.date,
    time: data.time,
    status: "scheduled",
    inventory: buildInventoryFromAircraft(aircraft),
  };
  store.flights.push(record);
  return record;
}

function updateFlight(id, changes) {
  const flight = store.flights.find(f => f.id === id);
  if (!flight) return { ok: false, message: "Flight not found." };
  if (changes.flightNumber) flight.flightNumber = changes.flightNumber;
  if (changes.date) flight.date = changes.date;
  if (changes.time) flight.time = changes.time;
  if (changes.routeId) flight.routeId = changes.routeId;
  return { ok: true };
}

function assignAircraft(flightId, aircraftId) {
  const flight = store.flights.find(f => f.id === flightId);
  const aircraft = store.aircraft.find(a => a.id === aircraftId);
  if (!flight || !aircraft) return { ok: false, message: "Flight or aircraft not found." };

  const bookedByCabin = {};
  CABINS.forEach(c => bookedByCabin[c.key] = flight.inventory[c.key].booked);
  const overbooked = CABINS.some(c => bookedByCabin[c.key] > aircraft.config[c.key]);
  if (overbooked) {
    return { ok: false, message: "New aircraft has fewer seats than are already booked in one or more cabins." };
  }

  flight.aircraftId = aircraftId;
  CABINS.forEach(c => {
    flight.inventory[c.key].total = aircraft.config[c.key];
  });
  return { ok: true };
}

function cancelFlight(id) {
  const flight = store.flights.find(f => f.id === id);
  if (!flight) return { ok: false, message: "Flight not found." };
  flight.status = "cancelled";
  return { ok: true };
}

function removeFlightPermanently(id) {
  store.flights = store.flights.filter(f => f.id !== id);
  store.fares = store.fares.filter(fr => fr.flightId !== id);
}

/* ---------------------------------------------------------
   AVAILABILITY CHECKING + INVENTORY SYNC
   (booking / cancellation instantly updates seat counts)
   --------------------------------------------------------- */
const OVERBOOK_ALLOWANCE = 0.03; // 3% controlled overbooking ceiling

function availability(flightId, cabin) {
  const flight = store.flights.find(f => f.id === flightId);
  if (!flight) return null;
  const inv = flight.inventory[cabin];
  return {
    total: inv.total,
    booked: inv.booked,
    available: inv.total - inv.booked,
  };
}

function bookSeats(flightId, cabin, count, allowOverbook = false) {
  const flight = store.flights.find(f => f.id === flightId);
  if (!flight) return { ok: false, message: "Flight not found." };
  if (flight.status === "cancelled") return { ok: false, message: "Cannot book seats on a cancelled flight." };

  const inv = flight.inventory[cabin];
  const ceiling = allowOverbook ? Math.floor(inv.total * (1 + OVERBOOK_ALLOWANCE)) : inv.total;

  if (inv.booked + count > ceiling) {
    return {
      ok: false,
      message: `Only ${ceiling - inv.booked} seat(s) available in ${cabin} on ${flight.flightNumber} (prevented overbooking).`,
    };
  }

  inv.booked += count;
  return { ok: true, remaining: inv.total - inv.booked };
}

function releaseSeats(flightId, cabin, count) {
  const flight = store.flights.find(f => f.id === flightId);
  if (!flight) return { ok: false, message: "Flight not found." };
  const inv = flight.inventory[cabin];
  const releaseCount = Math.min(count, inv.booked);
  inv.booked -= releaseCount;
  return { ok: true, released: releaseCount, remaining: inv.total - inv.booked };
}

/* ---------------------------------------------------------
   FARE INVENTORY (fare classes allocated within a cabin)
   --------------------------------------------------------- */
function addFare(data) {
  const record = {
    id: nextId("fare"),
    flightId: data.flightId,
    cabin: data.cabin,
    fareName: data.fareName,
    price: Number(data.price),
    allocated: Number(data.allocated),
  };
  store.fares.push(record);
  return record;
}

function removeFare(id) {
  store.fares = store.fares.filter(f => f.id !== id);
}

/* =========================================================
   UI LAYER
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function fmtMoney(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function routeLabel(routeId) {
  const r = store.routes.find(x => x.id === routeId);
  if (!r) return "—";
  const stops = r.stops.length ? ` (via ${r.stops.join(", ")})` : "";
  return `${r.source} → ${r.destination}${stops}`;
}

function aircraftLabel(aircraftId) {
  const a = store.aircraft.find(x => x.id === aircraftId);
  return a ? `${a.tail} · ${a.type}` : "—";
}

function flightLabel(flightId) {
  const f = store.flights.find(x => x.id === flightId);
  return f ? `${f.flightNumber} — ${routeLabel(f.routeId)}` : "—";
}

function cabinLabel(key) {
  return (CABINS.find(c => c.key === key) || {}).label || key;
}

function loadClass(pct) {
  if (pct >= 100) return "is-full";
  if (pct >= 85) return "is-warn";
  return "";
}

function showToast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("is-visible"), 3200);
}

/* ---------- navigation ---------- */
const VIEW_META = {
  dashboard: ["Operations Dashboard", "Live snapshot of the network"],
  flights: ["Flight Management", "Add, update, cancel, and reassign flights"],
  aircraft: ["Aircraft Management", "Fleet, cabin configuration, and maintenance"],
  routes: ["Route Management", "Source, destination, and intermediate stops"],
  fares: ["Fare Inventory", "Fare classes allocated within each cabin"],
  availability: ["Availability & Sync", "Real-time seat availability and inventory sync"],
};

function setView(name) {
  $$(".rail-nav__item").forEach(b => b.classList.toggle("is-active", b.dataset.view === name));
  $$(".view").forEach(v => v.classList.toggle("is-active", v.id === "view-" + name));
  $("#viewTitle").textContent = VIEW_META[name][0];
  $("#viewSubtitle").textContent = VIEW_META[name][1];
}

$$(".rail-nav__item").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

/* ---------- clock ---------- */
function tickClock() {
  const now = new Date();
  $("#railClock").textContent = now.toLocaleTimeString("en-GB");
}
setInterval(tickClock, 1000);
tickClock();

/* ---------- select population ---------- */
function fillSelect(select, items, current) {
  select.innerHTML = items.map(([value, label]) =>
    `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`
  ).join("");
}

function refreshSelects() {
  const routeOpts = store.routes.map(r => [r.id, `${r.id} · ${routeLabel(r.id)}`]);
  const aircraftOpts = store.aircraft.map(a => [a.id, `${a.id} · ${a.tail} (${a.type})`]);
  const flightOpts = store.flights
    .filter(f => f.status !== "cancelled")
    .map(f => [f.id, `${f.flightNumber} · ${routeLabel(f.routeId)} · ${f.date}`]);

  fillSelect($("#flightRouteSelect"), routeOpts);
  fillSelect($("#flightAircraftSelect"), aircraftOpts);
  fillSelect($("#fareFlightSelect"), flightOpts);
  fillSelect($("#bookingFlightSelect"), flightOpts);
}

/* ---------- rendering ---------- */
function render() {
  refreshSelects();
  renderDashboard();
  renderFlights();
  renderAircraft();
  renderRoutes();
  renderFares();
  renderAvailability();
}

function renderDashboard() {
  const activeFlights = store.flights.filter(f => f.status !== "cancelled");
  $("#statFlights").textContent = activeFlights.length;
  $("#statAircraft").textContent = store.aircraft.length;
  $("#statRoutes").textContent = store.routes.length;

  let totalBooked = 0, totalSeats = 0;
  activeFlights.forEach(f => CABINS.forEach(c => {
    totalBooked += f.inventory[c.key].booked;
    totalSeats += f.inventory[c.key].total;
  }));
  $("#statBooked").textContent = totalBooked;
  const pct = totalSeats ? Math.round((totalBooked / totalSeats) * 100) : 0;
  $("#statBookedPct").textContent = `${pct}% load factor`;

  const tbody = $("#dashboardBoard tbody");
  if (!activeFlights.length) {
    tbody.innerHTML = `<tr><td class="table-empty" colspan="9">No active flights yet. Add one from the Flights tab.</td></tr>`;
  } else {
    tbody.innerHTML = activeFlights.map(f => {
      const cabinCells = CABINS.map(c => {
        const inv = f.inventory[c.key];
        const avail = inv.total - inv.booked;
        const pct = inv.total ? Math.round((inv.booked / inv.total) * 100) : 0;
        return `<td><span class="seat-chip"><b>${avail}</b> open / ${inv.total}
          <span class="bar ${loadClass(pct)}"><span style="width:${Math.min(pct,100)}%"></span></span>
        </span></td>`;
      }).join("");
      return `<tr>
        <td class="mono">${f.flightNumber}</td>
        <td>${routeLabel(f.routeId)}</td>
        <td class="mono">${f.date} ${f.time}</td>
        <td>${aircraftLabel(f.aircraftId)}</td>
        ${cabinCells}
        <td><span class="badge badge--${f.status}">${f.status}</span></td>
      </tr>`;
    }).join("");
  }

  const watch = $("#maintenanceWatch");
  const upcoming = [...store.aircraft]
    .filter(a => a.maintenance)
    .sort((a, b) => a.maintenance.localeCompare(b.maintenance));
  watch.innerHTML = upcoming.length ? upcoming.map(a => `
    <li>
      <div>
        <div class="tail">${a.tail}</div>
        <div class="note">${a.maintenanceNote || "Scheduled hold"}</div>
      </div>
      <div class="date">${a.maintenance}</div>
    </li>
  `).join("") : `<li class="note">No maintenance scheduled.</li>`;
}

function renderFlights() {
  const tbody = $("#flightsTable tbody");
  if (!store.flights.length) {
    tbody.innerHTML = `<tr><td class="table-empty" colspan="7">No flights yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = store.flights.map(f => {
    const totalBooked = CABINS.reduce((s, c) => s + f.inventory[c.key].booked, 0);
    const totalSeats = CABINS.reduce((s, c) => s + f.inventory[c.key].total, 0);
    return `<tr>
      <td class="mono">${f.flightNumber}<br><span style="color:var(--text-dim)">${f.id}</span></td>
      <td>${routeLabel(f.routeId)}</td>
      <td>${aircraftLabel(f.aircraftId)}</td>
      <td class="mono">${f.date} ${f.time}</td>
      <td class="mono">${totalBooked} / ${totalSeats}</td>
      <td><span class="badge badge--${f.status}">${f.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn btn--ghost btn--small" data-cancel-flight="${f.id}" ${f.status === "cancelled" ? "disabled" : ""}>Cancel</button>
          <button class="btn btn--ghost btn--small" data-delete-flight="${f.id}">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  $$("[data-cancel-flight]").forEach(btn => btn.addEventListener("click", () => {
    cancelFlight(btn.dataset.cancelFlight);
    showToast("Flight cancelled. Inventory locked.");
    render();
  }));
  $$("[data-delete-flight]").forEach(btn => btn.addEventListener("click", () => {
    removeFlightPermanently(btn.dataset.deleteFlight);
    showToast("Flight record removed.");
    render();
  }));
}

function renderAircraft() {
  const tbody = $("#aircraftTable tbody");
  if (!store.aircraft.length) {
    tbody.innerHTML = `<tr><td class="table-empty" colspan="6">No aircraft registered.</td></tr>`;
    return;
  }
  tbody.innerHTML = store.aircraft.map(a => {
    const config = CABINS.map(c => `${c.label.split(" ")[0]}:${a.config[c.key]}`).join("  ");
    return `<tr>
      <td class="mono">${a.tail}</td>
      <td>${a.type}</td>
      <td class="mono">${capacityOf(a)}</td>
      <td class="mono">${config}</td>
      <td class="mono">${a.maintenance || "—"}${a.maintenanceNote ? `<br><span style="color:var(--text-dim)">${a.maintenanceNote}</span>` : ""}</td>
      <td><button class="btn btn--ghost btn--small" data-delete-aircraft="${a.id}">Remove</button></td>
    </tr>`;
  }).join("");

  $$("[data-delete-aircraft]").forEach(btn => btn.addEventListener("click", () => {
    const res = removeAircraft(btn.dataset.deleteAircraft);
    if (!res.ok) return showToast(res.message, true);
    showToast("Aircraft removed from fleet.");
    render();
  }));
}

function renderRoutes() {
  const tbody = $("#routesTable tbody");
  if (!store.routes.length) {
    tbody.innerHTML = `<tr><td class="table-empty" colspan="6">No routes defined.</td></tr>`;
    return;
  }
  tbody.innerHTML = store.routes.map(r => {
    const flightsOnRoute = store.flights.filter(f => f.routeId === r.id && f.status !== "cancelled").length;
    return `<tr>
      <td class="mono">${r.id}</td>
      <td class="mono">${r.source}</td>
      <td class="mono">${r.destination}</td>
      <td>${r.stops.length ? r.stops.join(", ") : "Direct"}</td>
      <td class="mono">${flightsOnRoute}</td>
      <td><button class="btn btn--ghost btn--small" data-delete-route="${r.id}">Remove</button></td>
    </tr>`;
  }).join("");

  $$("[data-delete-route]").forEach(btn => btn.addEventListener("click", () => {
    const res = removeRoute(btn.dataset.deleteRoute);
    if (!res.ok) return showToast(res.message, true);
    showToast("Route removed.");
    render();
  }));
}

function renderFares() {
  const tbody = $("#faresTable tbody");
  if (!store.fares.length) {
    tbody.innerHTML = `<tr><td class="table-empty" colspan="6">No fare classes allocated yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = store.fares.map(fr => `
    <tr>
      <td>${flightLabel(fr.flightId)}</td>
      <td>${cabinLabel(fr.cabin)}</td>
      <td>${fr.fareName}</td>
      <td class="mono">${fmtMoney(fr.price)}</td>
      <td class="mono">${fr.allocated}</td>
      <td><button class="btn btn--ghost btn--small" data-delete-fare="${fr.id}">Remove</button></td>
    </tr>
  `).join("");

  $$("[data-delete-fare]").forEach(btn => btn.addEventListener("click", () => {
    removeFare(btn.dataset.deleteFare);
    showToast("Fare class removed.");
    render();
  }));
}

function renderAvailability() {
  const tbody = $("#availabilityTable tbody");
  const rows = [];
  store.flights.filter(f => f.status !== "cancelled").forEach(f => {
    CABINS.forEach(c => {
      const inv = f.inventory[c.key];
      if (inv.total === 0) return;
      const avail = inv.total - inv.booked;
      const pct = Math.round((inv.booked / inv.total) * 100);
      rows.push(`<tr>
        <td class="mono">${f.flightNumber}</td>
        <td>${c.label}</td>
        <td class="mono">${inv.total}</td>
        <td class="mono">${inv.booked}</td>
        <td class="mono">${avail}</td>
        <td><span class="bar ${loadClass(pct)}" style="width:80px"><span style="width:${Math.min(pct,100)}%"></span></span></td>
      </tr>`);
    });
  });
  tbody.innerHTML = rows.length ? rows.join("") : `<tr><td class="table-empty" colspan="6">No inventory to display.</td></tr>`;
}

/* ---------- form: schedule flight ---------- */
$("#flightForm").addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  addFlight({
    flightNumber: fd.get("flightNumber"),
    routeId: fd.get("routeId"),
    aircraftId: fd.get("aircraftId"),
    date: fd.get("date"),
    time: fd.get("time"),
  });
  showToast("Flight scheduled and inventory initialised.");
  e.target.reset();
  render();
});

/* ---------- form: register aircraft ---------- */
$("#aircraftForm").addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  addAircraft({
    tail: fd.get("tail"),
    type: fd.get("type"),
    economy: fd.get("economy"),
    premium: fd.get("premium"),
    business: fd.get("business"),
    first: fd.get("first"),
    maintenance: fd.get("maintenance"),
    maintenanceNote: fd.get("maintenanceNote"),
  });
  showToast("Aircraft added to fleet.");
  e.target.reset();
  render();
});

/* ---------- form: define route ---------- */
$("#routeForm").addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const stopsRaw = fd.get("stops") || "";
  addRoute({
    source: fd.get("source"),
    destination: fd.get("destination"),
    stops: stopsRaw.split(",").map(s => s.trim()).filter(Boolean),
  });
  showToast("Route added to network.");
  e.target.reset();
  render();
});

/* ---------- form: allocate fare ---------- */
$("#fareForm").addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const flightId = fd.get("flightId");
  const cabin = fd.get("cabin");
  const allocated = Number(fd.get("allocated"));

  const avail = availability(flightId, cabin);
  if (!avail) return showToast("Select a flight first.", true);

  const alreadyAllocated = store.fares
    .filter(f => f.flightId === flightId && f.cabin === cabin)
    .reduce((s, f) => s + f.allocated, 0);

  if (alreadyAllocated + allocated > avail.total) {
    showToast(`Allocation exceeds ${cabinLabel(cabin)} capacity (${avail.total} seats total, ${alreadyAllocated} already allocated).`, true);
    return;
  }

  addFare({
    flightId,
    cabin,
    fareName: fd.get("fareName"),
    price: fd.get("price"),
    allocated,
  });
  showToast("Fare class allocated.");
  e.target.reset();
  render();
});

/* ---------- form: booking / release (availability sync) ---------- */
function logRow(message, ok) {
  const log = $("#bookingLog");
  const row = document.createElement("div");
  row.className = "log__row " + (ok ? "is-ok" : "is-error");
  const stamp = new Date().toLocaleTimeString("en-GB");
  row.textContent = `[${stamp}] ${message}`;
  log.prepend(row);
}

$("#bookingForm").addEventListener("submit", e => {
  e.preventDefault();
  const action = e.submitter ? e.submitter.dataset.action : "book";
  const fd = new FormData(e.target);
  const flightId = fd.get("flightId");
  const cabin = fd.get("cabin");
  const count = Number(fd.get("count"));
  const allowOverbook = $("#allowOverbook").checked;

  if (!flightId) return showToast("Add a flight first.", true);

  if (action === "book") {
    const res = bookSeats(flightId, cabin, count, allowOverbook);
    if (!res.ok) { logRow(res.message, false); showToast(res.message, true); }
    else { logRow(`Booked ${count} × ${cabinLabel(cabin)} on ${flightLabel(flightId).split(" —")[0]} — ${res.remaining} left.`, true); showToast("Booking confirmed. Inventory synced."); }
  } else {
    const res = releaseSeats(flightId, cabin, count);
    logRow(`Released ${res.released} × ${cabinLabel(cabin)} on ${flightLabel(flightId).split(" —")[0]} — ${res.remaining} left.`, true);
    showToast("Booking cancelled. Inventory synced.");
  }
  render();
});

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */
seed();
render();
setView("dashboard");
