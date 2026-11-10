export function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>Arkkies Auto Login</title>
  <style>
    :root {
      --bg: #101216;
      --card: #1a1d24;
      --ink: #f3f4f6;
      --muted: #9aa3b2;
      --line: #2a2f3a;
      --accent: #f5c16c;
      --accent-ink: #1a1408;
      --danger: #f3a3a3;
      --ok: #9ad7b2;
      --btn-gap: 0.75rem;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background: radial-gradient(1200px 600px at 10% -10%, #2a2418 0%, var(--bg) 50%);
      color: var(--ink);
    }
    main {
      max-width: 26rem;
      margin: 0 auto;
      padding: 1.5rem 1.1rem 3rem;
    }
    h1 { font-size: 1.35rem; letter-spacing: -0.02em; margin: 0 0 0.25rem; }
    .lede { color: var(--muted); margin: 0 0 1.4rem; line-height: 1.45; }
    form, .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 1rem;
      padding: 1rem;
    }
    label { display: block; font-size: 0.85rem; color: var(--muted); margin: 0 0 0.35rem; }
    .field { margin-bottom: 0.9rem; }
    input, select, button {
      font: inherit;
      width: 100%;
      border-radius: 0.7rem;
    }
    input, select {
      background: #101319;
      color: var(--ink);
      border: 1px solid var(--line);
      padding: 0.8rem 0.85rem;
    }
    button {
      border: 0;
      padding: 0.95rem 0.9rem;
      font-weight: 650;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: progress; }
    .primary { background: var(--accent); color: var(--accent-ink); }
    .secondary { background: #2b3140; color: var(--ink); }
    .actions { display: grid; gap: var(--btn-gap); margin-top: 0.3rem; }
    #message {
      margin: 1rem 0 0;
      min-height: 1.3rem;
      line-height: 1.45;
      color: var(--muted);
    }
    #message.error { color: var(--danger); }
    #message.ok { color: var(--ok); }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <main>
    <h1>Arkkies Auto Login</h1>
    <p class="lede">Log in with your Arkkies account, pick a gym, then book a slot and open the door.</p>

    <form id="loginForm">
      <div class="field">
        <label for="email">Username</label>
        <input id="email" name="email" type="email" autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <button class="primary" type="submit" id="loginBtn">Log in</button>
    </form>

    <div id="app" class="panel hidden">
      <div class="field">
        <label for="home">Home gym</label>
        <select id="home"></select>
      </div>
      <div class="field">
        <label for="destination">Gym to go to</label>
        <select id="destination"></select>
      </div>
      <div class="actions">
        <button class="primary" type="button" id="bookOpenBtn">Book &amp; Open Door</button>
        <button class="secondary" type="button" id="openBtn">Open Door</button>
      </div>
    </div>

    <p id="message" role="status"></p>
  </main>
  <script>
    const key = new URLSearchParams(location.search).get("key");
    const api = (path) => path + (key ? "?key=" + encodeURIComponent(key) : "");
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const loginForm = document.getElementById("loginForm");
    const app = document.getElementById("app");
    const homeEl = document.getElementById("home");
    const destEl = document.getElementById("destination");
    const messageEl = document.getElementById("message");
    const loginBtn = document.getElementById("loginBtn");
    const bookOpenBtn = document.getElementById("bookOpenBtn");
    const openBtn = document.getElementById("openBtn");

    function setMessage(text, kind) {
      messageEl.textContent = text || "";
      messageEl.className = kind || "";
    }

    function creds() {
      return { email: emailEl.value.trim(), password: passwordEl.value };
    }

    function option(gym, selectedId) {
      const el = document.createElement("option");
      el.value = gym.id;
      el.textContent = gym.name;
      el.selected = gym.id === selectedId;
      return el;
    }
    function fillGyms(gyms, homeId, destId) {
      homeEl.replaceChildren(...gyms.map((g) => option(g, homeId)));
      destEl.replaceChildren(...gyms.map((g) => option(g, destId)));
    }

    function describeStatus(data) {
      const booking = data.currentBooking;
      const slot = data.currentSlot;
      if (booking) return "You already have a booking: " + booking.label + ".";
      if (slot) return "Current slot: " + slot.label + ".";
      return "No gym-access slot is open at that gym right now.";
    }

    async function post(path, body) {
      const res = await fetch(api(path), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) {
        const err = new Error(data.error || ("Request failed (" + res.status + ")"));
        err.status = res.status;
        throw err;
      }
      return data;
    }

    async function refreshStatus() {
      const data = await post("/api/status", {
        ...creds(),
        home: homeEl.value,
        destination: destEl.value,
      });
      fillGyms(data.gyms, data.home.id, data.destination.id);
      setMessage(describeStatus(data), "ok");
      return data;
    }

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      loginBtn.disabled = true;
      setMessage("Logging in…");
      try {
        const data = await post("/api/status", creds());
        fillGyms(data.gyms, data.home.id, data.destination.id);
        app.classList.remove("hidden");
        setMessage(describeStatus(data), "ok");
      } catch (err) {
        setMessage(err.message || "Login failed.", "error");
      } finally {
        loginBtn.disabled = false;
      }
    });

    destEl.addEventListener("change", async () => {
      setMessage("Checking that gym…");
      try { await refreshStatus(); }
      catch (err) { setMessage(err.message || "Could not refresh status.", "error"); }
    });

    async function runAction(path, pending) {
      bookOpenBtn.disabled = true;
      openBtn.disabled = true;
      setMessage(pending);
      try {
        const data = await post(path, {
          ...creds(),
          home: homeEl.value,
          destination: destEl.value,
        });
        const extra = data.window && data.window.label ? " " + data.window.label + "." : "";
        setMessage((data.message || "Done.") + (data.message && data.message.includes("SGT") ? "" : extra), "ok");
      } catch (err) {
        setMessage(err.message || "Something went wrong.", "error");
      } finally {
        bookOpenBtn.disabled = false;
        openBtn.disabled = false;
      }
    }

    bookOpenBtn.addEventListener("click", () => runAction("/api/book-and-open", "Booking and opening the door…"));
    openBtn.addEventListener("click", () => runAction("/api/open-door", "Opening the door…"));
  </script>
</body>
</html>`;
}
