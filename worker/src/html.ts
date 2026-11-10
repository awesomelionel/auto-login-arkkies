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
    form {
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
    button[aria-busy="true"] { cursor: progress; }
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
  </style>
</head>
<body>
  <main>
    <h1>Arkkies Auto Login</h1>
    <p class="lede">Enter your Arkkies account, pick the gym you want to go to, then book a slot and open the door.</p>

    <form id="actionForm">
      <div class="field">
        <label for="email">Username</label>
        <input id="email" name="username" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </div>
      <div class="field">
        <label for="destination">Gym to go to</label>
        <select id="destination" name="destination" required>
          <option value="">Loading gyms…</option>
        </select>
      </div>
      <div class="actions">
        <button class="primary" type="submit" id="bookOpenBtn">Book &amp; Open Door</button>
        <button class="secondary" type="button" id="openBtn">Open Door</button>
      </div>
    </form>

    <p id="message" role="status"></p>
  </main>
  <script>
    const key = new URLSearchParams(location.search).get("key");
    const api = (path) => path + (key ? "?key=" + encodeURIComponent(key) : "");
    const STORE = { username: "arkkies.username", destination: "arkkies.destination", home: "arkkies.home" };
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const destEl = document.getElementById("destination");
    const messageEl = document.getElementById("message");
    const formEl = document.getElementById("actionForm");
    const bookOpenBtn = document.getElementById("bookOpenBtn");
    const openBtn = document.getElementById("openBtn");
    const BOOK_LABEL = bookOpenBtn.textContent;
    const OPEN_LABEL = openBtn.textContent;

    function setMessage(text, kind) {
      messageEl.textContent = text || "";
      messageEl.className = kind || "";
    }

    function readStore() {
      try {
        return {
          username: localStorage.getItem(STORE.username) || "",
          destination: localStorage.getItem(STORE.destination) || "",
          home: localStorage.getItem(STORE.home) || "",
        };
      } catch {
        return { username: "", destination: "", home: "" };
      }
    }

    function writeStore(partial) {
      try {
        if (partial.username != null) localStorage.setItem(STORE.username, partial.username);
        if (partial.destination != null) localStorage.setItem(STORE.destination, partial.destination);
        if (partial.home) localStorage.setItem(STORE.home, partial.home);
      } catch {}
    }

    function rememberedHome() {
      return readStore().home;
    }

    function option(gym, selectedId) {
      const el = document.createElement("option");
      el.value = gym.id;
      el.textContent = gym.name;
      el.selected = gym.id === selectedId;
      return el;
    }

    function fillGyms(gyms, selectedId) {
      const pick = selectedId && gyms.some((g) => g.id === selectedId)
        ? selectedId
        : (gyms.some((g) => g.id === "AGRBSN01") ? "AGRBSN01" : (gyms[0] && gyms[0].id) || "");
      destEl.replaceChildren(...gyms.map((g) => option(g, pick)));
    }

    async function parseJson(res) {
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) {
        const err = new Error(data.error || ("Request failed (" + res.status + ")"));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    }

    function rememberFrom(data) {
      const saved = {};
      saved.username = emailEl.value.trim();
      if (destEl.value) saved.destination = destEl.value;
      const homeId = data && data.home && data.home.id;
      if (homeId) saved.home = homeId;
      writeStore(saved);
    }

    async function runAction(path, btn, pending) {
      bookOpenBtn.disabled = true;
      openBtn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.textContent = pending;
      setMessage(pending);
      try {
        const body = {
          email: emailEl.value.trim(),
          password: passwordEl.value,
          destination: destEl.value,
        };
        const home = rememberedHome();
        if (home) body.home = home;
        const res = await fetch(api(path), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
        const data = await parseJson(res);
        rememberFrom(data);
        const label = data.window && data.window.label;
        const message = data.message || "Done.";
        setMessage(message.includes("SGT") || !label ? message : message + " " + label + ".", "ok");
      } catch (err) {
        if (err.data) rememberFrom(err.data);
        setMessage(err.message || "Something went wrong.", "error");
      } finally {
        btn.removeAttribute("aria-busy");
        bookOpenBtn.textContent = BOOK_LABEL;
        openBtn.textContent = OPEN_LABEL;
        bookOpenBtn.disabled = false;
        openBtn.disabled = false;
      }
    }

    formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      runAction("/api/book-and-open", bookOpenBtn, "Booking and opening the door…");
    });
    openBtn.addEventListener("click", () => {
      runAction("/api/open-door", openBtn, "Opening the door…");
    });

    destEl.addEventListener("change", () => {
      writeStore({ destination: destEl.value, username: emailEl.value.trim() });
    });
    emailEl.addEventListener("change", () => {
      writeStore({ username: emailEl.value.trim() });
    });

    (async function init() {
      const saved = readStore();
      if (saved.username) emailEl.value = saved.username;
      setMessage("Loading gyms…");
      try {
        const res = await fetch(api("/api/gyms"), { headers: { Accept: "application/json" } });
        const data = await parseJson(res);
        const gyms = data.gyms || [];
        if (!gyms.length) throw new Error("No gyms were returned.");
        fillGyms(gyms, saved.destination);
        writeStore({ destination: destEl.value, username: emailEl.value.trim() });
        setMessage("");
      } catch (err) {
        destEl.replaceChildren();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Could not load gyms";
        destEl.appendChild(empty);
        setMessage(err.message || "Could not load the gym list.", "error");
      }
    })();
  </script>
</body>
</html>`;
}
