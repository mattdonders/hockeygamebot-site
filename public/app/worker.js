export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);

            // Basic routing
            if (url.pathname === "/") return html(200, homePage());
            if (url.pathname === "/signup" && request.method === "GET") return html(200, signupPage());
            if (url.pathname === "/signup" && request.method === "POST") return handleSignup(request, env);
            if (url.pathname === "/login" && request.method === "GET") return html(200, loginPage());
            if (url.pathname === "/login" && request.method === "POST") return handleLogin(request, env);
            if (url.pathname === "/logout") return handleLogout(request);
            if (url.pathname === "/dashboard") return handleDashboard(request, env);
            if (url.pathname === "/jobs") return handleJobs(request, env);

            // Review-mode manual runner (temporary)
            if (url.pathname === "/jobs/run-one" && request.method === "POST") {
                return requireUser(request, env, (userId) => handleRunOneJob(request, env, userId));
            }

            // TikTok OAuth (stubbed for now; we’ll wire next)
            if (url.pathname === "/connect/tiktok") return requireUser(request, env, (user) => connectTikTokStart(request, env, user));
            if (url.pathname === "/auth/tiktok/callback") return handleTikTokCallback(request, env);
            if (url.pathname === "/disconnect/tiktok" && request.method === "POST") {
                return requireUser(request, env, (userId) => disconnectTikTok(request, env, userId));
            }

            if (url.pathname === "/privacy") return html(200, simplePage("Privacy Policy", "TODO: add policy text"));
            if (url.pathname === "/terms") return html(200, simplePage("Terms of Service", "TODO: add terms text"));
            if (url.pathname === "/support") return html(200, simplePage("Support", "Email: support@hockeygamebot.com"));

            return html(404, simplePage("Not found", "No route here."));
        } catch (err) {
            return new Response("Internal error: " + (err?.message || String(err)), { status: 500 });
        }
    },
};



// ---------- HTML helpers ----------
// --- Team hashtag data (from team_details.py) ---
const TEAM_DETAILS = {
    "NJD": { full_name: "New Jersey Devils", hashtag: "#NJDevils" },
    "CAR": { full_name: "Carolina Hurricanes", hashtag: "#CarolinaCulture" },
    "WSH": { full_name: "Washington Capitals", hashtag: "#ALLCAPS" },
    "NYI": { full_name: "New York Islanders", hashtag: "#Isles" },
    "TBL": { full_name: "Tampa Bay Lightning", hashtag: "#GoBolts" },
    "NYR": { full_name: "New York Rangers", hashtag: "#NYR" },
    "PHI": { full_name: "Philadelphia Flyers", hashtag: "#LetsGoFlyers" },
    "PIT": { full_name: "Pittsburgh Penguins", hashtag: "#LetsGoPens" },
    "BOS": { full_name: "Boston Bruins", hashtag: "#NHLBruins" },
    "BUF": { full_name: "Buffalo Sabres", hashtag: "#SabreHood" },
    "TOR": { full_name: "Toronto Maple Leafs", hashtag: "#LeafsForever" },
    "MTL": { full_name: "Montreal Canadiens", hashtag: "#GoHabsGo" },
    "OTT": { full_name: "Ottawa Senators", hashtag: "#GoSensGo" },
    "FLA": { full_name: "Florida Panthers", hashtag: "#TimeToHunt" },
    "DET": { full_name: "Detroit Red Wings", hashtag: "#LGRW" },
    "CBJ": { full_name: "Columbus Blue Jackets", hashtag: "#CBJ" },
    "CHI": { full_name: "Chicago Blackhawks", hashtag: "#Blackhawks" },
    "STL": { full_name: "St. Louis Blues", hashtag: "#STLBlues" },
    "NSH": { full_name: "Nashville Predators", hashtag: "#Smashville" },
    "DAL": { full_name: "Dallas Stars", hashtag: "#TexasHockey" },
    "COL": { full_name: "Colorado Avalanche", hashtag: "#GoAvsGo" },
    "WPG": { full_name: "Winnipeg Jets", hashtag: "#GoJetsGo" },
    "MIN": { full_name: "Minnesota Wild", hashtag: "#mnwild" },
    "VAN": { full_name: "Vancouver Canucks", hashtag: "#Canucks" },
    "EDM": { full_name: "Edmonton Oilers", hashtag: "#LetsGoOilers" },
    "CGY": { full_name: "Calgary Flames", hashtag: "#Flames" },
    "LAK": { full_name: "Los Angeles Kings", hashtag: "#GoKingsGo" },
    "ANA": { full_name: "Anaheim Ducks", hashtag: "#FlyTogether" },
    "SJS": { full_name: "San Jose Sharks", hashtag: "#TheFutureIsTeal" },
    "SEA": { full_name: "Seattle Kraken", hashtag: "#SeaKraken" },
    "VGK": { full_name: "Vegas Golden Knights", hashtag: "#VegasBorn" },
    "UTA": { full_name: "Utah Mammoth", hashtag: "#TusksUp" },
};

// --- HTML to insert under your caption textarea ---
// Put this in your page markup near the caption box.
// Make sure your caption textarea has id="caption".
function teamDropdownScriptTag() {
    return `
<script>
(() => {
const TEAM_DETAILS = ${JSON.stringify(TEAM_DETAILS)};

function renderTeamDropdowns() {
  const container = document.getElementById("team-dropdowns");
  const captionEl = document.getElementById("caption");
  if (!container || !captionEl) return;

  const teams = Object.entries(TEAM_DETAILS)
    .map(([abbr, d]) => ({ abbr, name: d.full_name, hashtag: d.hashtag }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const options = [
    '<option value="">(none)</option>',
    ...teams.map(t => \`<option value="\${t.abbr}">\${t.name} (\${t.abbr})</option>\`)
  ].join("");

  container.innerHTML = \`
    <div style="display:flex; gap:12px; margin-top:10px; flex-wrap:wrap;">
      <div style="flex:1; min-width:240px;">
        <label style="display:block; font-size:12px; opacity:.8; margin-bottom:6px;">Away Team</label>
        <select id="team-away" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd; background:white;">
          \${options}
        </select>
      </div>
      <div style="flex:1; min-width:240px;">
        <label style="display:block; font-size:12px; opacity:.8; margin-bottom:6px;">Home Team</label>
        <select id="team-home" style="width:100%; padding:10px; border-radius:8px; border:1px solid #ddd; background:white;">
          \${options}
        </select>
      </div>
    </div>
    <div class="help-text" style="margin-top:6px;">
      Team hashtags will be appended to the end of your caption.
    </div>
  \`;

  const awayEl = document.getElementById("team-away");
  const homeEl = document.getElementById("team-home");

  let suppress = false;
  let baseCaption = captionEl.value || "";
  let lastAutoSuffix = "";

  function getAutoHashtags() {
    const tags = [];
    if (awayEl.value && TEAM_DETAILS[awayEl.value]?.hashtag) tags.push(TEAM_DETAILS[awayEl.value].hashtag);
    if (homeEl.value && TEAM_DETAILS[homeEl.value]?.hashtag) tags.push(TEAM_DETAILS[homeEl.value].hashtag);
    return [...new Set(tags)];
  }

  function applySuffix() {
    const tags = getAutoHashtags();
    const suffix = tags.length ? "\\n\\n" + tags.join(" ") : "";
    suppress = true;
    captionEl.value = (baseCaption || "").trimEnd() + suffix;
    suppress = false;
    lastAutoSuffix = suffix;
  }

  captionEl.addEventListener("input", () => {
    if (suppress) return;
    const current = captionEl.value || "";
    if (lastAutoSuffix && current.endsWith(lastAutoSuffix)) {
      baseCaption = current.slice(0, -lastAutoSuffix.length).trimEnd();
    } else {
      baseCaption = current;
    }
    applySuffix();
  });

  awayEl.addEventListener("change", applySuffix);
  homeEl.addEventListener("change", applySuffix);

  applySuffix();
}

// run after DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderTeamDropdowns);
} else {
  renderTeamDropdowns();
}
})();
</script>
`;
}


/*
In your HTML, you need:
- <textarea id="caption"></textarea>
- <div id="team-dropdowns"></div>

And call:
renderTeamDropdowns();
*/


function html(status, body, headers = {}) {
    return new Response(
        `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HGB TikTok App</title>
<style>
/* Prevent overflow from padding/borders */
*, *::before, *::after { box-sizing: border-box; }

body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:40px;max-width:800px}
.card{border:1px solid #3333;border-radius:12px;padding:16px;margin:12px 0;overflow:hidden}
input,textarea{width:100%;max-width:100%;padding:10px;margin:6px 0;border:1px solid #3333;border-radius:8px}
textarea{resize:vertical}
button{padding:10px 14px;border:0;border-radius:8px;cursor:pointer}
a{color:#2563eb;text-decoration:none}
.row{display:flex;gap:12px;flex-wrap:wrap}
.pill{display:inline-block;padding:4px 10px;border:1px solid #3333;border-radius:999px;margin-left:8px}

/* Form layout helpers */
.input-row{display:flex;gap:8px;align-items:center}
.input-row input{flex:1}
.input-row button{white-space:nowrap}
.checkbox-row{display:flex;gap:10px;align-items:center;margin-top:8px}
.checkbox-row input[type=checkbox]{width:auto;margin:0}

.help-text {
font-size: 12px;
color: #666;
margin: 6px 0 8px 0;
line-height: 1.35;
}

select {
padding: 10px;
border: 1px solid #ddd;
border-radius: 8px;
background: white;
}

.pill {
background: #eee;
padding: 2px 8px;
border-radius: 999px;
font-size: 12px;
margin-left: 6px;
display: inline-block;
}

.help-text {
font-size: 12px;
color: #666;
margin-top: 4px;
line-height: 1.35;
}


</style>
</head>
<body>
${body}
</body></html>`,
        { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } }
    );
}

function homePage() {
    return `
<h1>HockeyGameBot – TikTok Publisher (Review Build)</h1>
<p>This app allows users to connect their TikTok account and publish sports recap videos they provide.</p>
<div class="card">
<div class="row">
<a href="/signup">Sign up</a>
<a href="/login">Log in</a>
<a href="/privacy">Privacy</a>
<a href="/terms">Terms</a>
<a href="/support">Support</a>
</div>
</div>`;
}

function signupPage(msg = "") {
    return `
<h2>Sign up</h2>
${msg ? `<p class="pill">${escapeHtml(msg)}</p>` : ""}
<form method="post" action="/signup">
<label>Email</label>
<input name="email" type="email" required />
<label>Password</label>
<input name="password" type="password" required minlength="10" />
<button type="submit">Create account</button>
</form>
<p>Already have an account? <a href="/login">Log in</a></p>`;
}

function loginPage(msg = "") {
    return `
<h2>Log in</h2>
${msg ? `<p class="pill">${escapeHtml(msg)}</p>` : ""}
<form method="post" action="/login">
<label>Email</label>
<input name="email" type="email" required />
<label>Password</label>
<input name="password" type="password" required />
<button type="submit">Log in</button>
</form>
<p>No account yet? <a href="/signup">Sign up</a></p>`;
}

function simplePage(title, content) {
    return `<h2>${escapeHtml(title)}</h2><div class="card">${escapeHtml(content)}</div><p><a href="/">Home</a></p>`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Auth helpers ----------
async function handleSignup(request, env) {
    const form = await request.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    if (!email || password.length < 10) return html(400, signupPage("Invalid email or password too short"));

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    try {
        await env.DB.prepare(
            "INSERT INTO users (id, email, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)"
        ).bind(userId, email, passwordHash, new Date().toISOString()).run();
    } catch (e) {
        return html(400, signupPage("Email already exists"));
    }

    const sessionId = await createSession(env, userId);
    return redirect("/dashboard", sessionCookie(sessionId));
}

async function handleLogin(request, env) {
    const form = await request.formData();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    const row = await env.DB.prepare("SELECT id, password_hash FROM users WHERE email=?1").bind(email).first();
    if (!row) return html(401, loginPage("Invalid credentials"));

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return html(401, loginPage("Invalid credentials"));

    const sessionId = await createSession(env, row.id);
    return redirect("/dashboard", sessionCookie(sessionId));
}

function handleLogout(request) {
    return redirect("/", { "Set-Cookie": clearSessionCookie() });
}

async function requireUser(request, env, fn) {
    const userId = await getUserIdFromSession(request, env);
    if (!userId) return redirect("/login");
    return fn(userId);
}

async function handleDashboard(request, env) {
    return requireUser(request, env, async (userId) => {
        const reviewMode = isReviewMode(env);

        if (
            isReviewMode(env) &&
            request.method === "GET" &&
            new URL(request.url).searchParams.get("refresh") === "1"
        ) {
            const tok = await getTikTokAccessToken(env, userId);
            return new Response(`ok: ${tok.slice(0, 8)}...`, { status: 200 });
        }

        const acct = await env.DB.prepare(
            "SELECT id, open_id, display_name, avatar_url, connected_at, disconnected_at FROM tiktok_accounts WHERE user_id=?1 ORDER BY connected_at DESC LIMIT 1"
        )
            .bind(userId)
            .first();

        const jobs = await env.DB.prepare(
            "SELECT id, status, created_at, last_error, transfer_method, status_detail, attempt_count, next_attempt_at FROM jobs WHERE user_id=?1 ORDER BY created_at DESC LIMIT 10"
        )
            .bind(userId)
            .all();

        const connected = acct && !acct.disconnected_at;

        const sampleUrl = (env.SAMPLE_URL || "").trim();
        const sampleButton = sampleUrl
            ? `
      <button type="button" onclick="document.querySelector('input[name=video_url]').value='${escapeHtml(
                sampleUrl
            )}'">Use Sample URL</button>
    `
            : "";

        const reviewCard = reviewMode
            ? `
<div class="card">
  <h3>Reviewer Tools (temporary)</h3>
  <p style="color:#555;margin-top:0">
    Note: This button exists only for TikTok app review and will be removed after approval.
    It forces one queued job to run immediately so reviewers can validate end-to-end behavior.
  </p>
  <form method="post" action="/jobs/run-one">
    <button type="submit">Check TikTok Upload Status</button>
  </form>
</div>
`
            : "";

        const connectedHeader = connected
            ? `
  <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
    ${acct.avatar_url
                ? `<img
      src="${escapeHtml(acct.avatar_url)}"
      alt="TikTok avatar"
      style="width:52px;height:52px;border-radius:999px;border:1px solid #3333;object-fit:cover"
    />`
                : ""
            }
    <div>
      <div style="font-size:16px">
        <strong>${acct.display_name ? "@" + escapeHtml(acct.display_name) : "TikTok user"
            }</strong>
      </div>
      <div style="font-size:13px;color:#666">
        Connected ${acct.connected_at ? `at ${escapeHtml(acct.connected_at)}` : ""}
      </div>
    </div>
  </div>
  <div style="margin-top:10px">
    <span class="pill">open_id: ${escapeHtml(acct.open_id)}</span>
  </div>

  <form method="post" action="/disconnect/tiktok" style="margin-top:12px">
    <button type="submit">Disconnect TikTok</button>
  </form>
`
            : `
  <p style="margin-top:10px;color:#444">
    Connect your TikTok account to authorize this app to send Hockey Game Bot recap videos to your TikTok Inbox.
  </p>
  <div style="margin-top:12px">
    <a href="/connect/tiktok">Connect TikTok</a>
  </div>
`;

        const body = `
<h2>Dashboard</h2>

<div class="card">
  <p><strong>TikTok status:</strong> ${connected ? "Connected ✅" : "Not connected ❌"}</p>
  ${connectedHeader}

  <div class="row" style="margin-top:14px">
    ${connected ? "" : `<a href="/connect/tiktok">Connect TikTok</a>`}
    <a href="/jobs">Job history</a>
    <a href="/logout">Logout</a>
  </div>
</div>

<div class="card">
  <h3>Create Upload Job</h3>

  <p style="margin-top:0;color:#444">
    <strong>Hockey Game Bot</strong> helps publish short NHL game recap / highlight videos.
    Select the teams involved to automatically append official team hashtags to your caption.
  </p>

  ${connected
                ? ""
                : `<p style="color:#666;margin-top:0">You can queue jobs now, but you must connect TikTok before publishing.</p>`
            }

  <form method="post" action="/jobs">
    <label>Video URL (HTTPS)</label>
    <div class="help-text">
      Provide a direct HTTPS link to an MP4 file (no login required). For review, click <b>Use sample</b>.
    </div>
    <div class="input-row">
      <input name="video_url" type="url" required />
      ${sampleButton}
    </div>

    <div style="margin-top:12px;">
      <label for="transfer_method">Video ingestion method</label>
      <div class="help-text">
        FILE_UPLOAD uploads from our server for reliability. <br />
        PULL_FROM_URL allows TikTok to fetch the generated recap video from the provided URL (the host domain must be verified in TikTok).
      </div>
      <select id="transfer_method" name="transfer_method">
        <option value="pull_from_url" selected>PULL_FROM_URL (TikTok fetches URL)</option>
        <option value="file_upload">FILE_UPLOAD (recommended)</option>
      </select>
    </div>

    <div style="margin-top:12px;">
      <label>Caption</label>
      <div class="help-text">
        <strong>Inbox flow:</strong> videos are sent to your TikTok Inbox for review and manual posting.
        Captions are applied when you post from TikTok (you can write here & copy/paste).
      </div>
      <textarea name="caption" id="caption" rows="4" required></textarea>
      <div id="team-dropdowns"></div>

      <div class="checkbox-row">
        <input type="checkbox" name="consent" value="yes" required />
        <span><strong>I authorize</strong> sending this recap video to my TikTok account (Inbox review required).</span>
      </div>
    </div>

    <div style="margin-top:10px">
      <button type="submit">${reviewMode ? "Queue & Run" : "Queue job"}</button>
    </div>

    <div style="margin-top:14px; font-size:12px; color:#666;">
      By continuing you agree to our
      <a href="https://hockeygamebot.com/terms.html" target="_blank" rel="noopener">Terms</a>
      and
      <a href="https://hockeygamebot.com/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.
    </div>
  </form>
</div>

${reviewCard}

<div class="card">
  <h3>Recent Jobs</h3>
  <ul>
    ${(jobs.results || []).length
                ? (jobs.results || [])
                    .map(
                        (j) => `
      <li style="margin-bottom:10px">
        <div>
          <code>${escapeHtml(j.id)}</code>
          — <b>${escapeHtml(j.status)}</b>
          ${j.transfer_method ? ` <span class="pill">${escapeHtml(j.transfer_method)}</span>` : ""}
          ${j.status_detail ? ` <span class="pill">${escapeHtml(j.status_detail)}</span>` : ""}
          — ${escapeHtml(j.created_at)}
          ${j.attempt_count !== null && j.attempt_count !== undefined
                                ? ` — attempts: ${escapeHtml(String(j.attempt_count))}`
                                : ""
                            }
          ${j.next_attempt_at ? ` — next: ${escapeHtml(j.next_attempt_at)}` : ""}
        </div>
        ${j.last_error ? `<div class="help-text"><em>${escapeHtml(j.last_error)}</em></div>` : ""}
      </li>
    `
                    )
                    .join("")
                : "<li>No jobs yet</li>"
            }
  </ul>
</div>

${teamDropdownScriptTag()}
`;

        return html(200, body);
    });
}



async function handleJobs(request, env) {
    if (request.method === "POST") {
        return requireUser(request, env, async (userId) => {
            const reviewMode = isReviewMode(env);
            const form = await request.formData();
            const videoUrl = String(form.get("video_url") || "").trim();
            const caption = String(form.get("caption") || "").trim();
            const consent = String(form.get("consent") || "");
            const transferMethod = String(form.get("transfer_method") || "file_upload").trim().toLowerCase();


            if (!videoUrl.startsWith("https://") || !caption || consent !== "yes") {
                return redirect("/dashboard");
            }

            const jobId = crypto.randomUUID();
            const now = new Date().toISOString();

            // Associate with latest connected TikTok account (if any)
            const acct = await env.DB.prepare(
                "SELECT id FROM tiktok_accounts WHERE user_id=?1 AND disconnected_at IS NULL ORDER BY connected_at DESC LIMIT 1"
            ).bind(userId).first();

            // Insert job (if transfer_method column exists, store it; otherwise fallback)
            try {
                await env.DB.prepare(
                    "INSERT INTO jobs (id, user_id, tiktok_account_id, video_url, caption, transfer_method, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, ?8)"
                ).bind(jobId, userId, acct?.id || null, videoUrl, caption, transferMethod, now, now).run();
            } catch (_) {
                // Backward compatible if migrations aren't applied yet
                await env.DB.prepare(
                    "INSERT INTO jobs (id, user_id, tiktok_account_id, video_url, caption, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'queued', ?6, ?7)"
                ).bind(jobId, userId, acct?.id || null, videoUrl, caption, now, now).run();
            }

            // Store consent metadata if you added the optional columns.
            // (If you haven't run the ALTER TABLEs yet, you can comment this out.)
            try {
                const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
                const ua = request.headers.get("User-Agent") || "";
                await env.DB.prepare(
                    "UPDATE jobs SET consent_at=?1, consent_ip=?2, consent_user_agent=?3 WHERE id=?4"
                ).bind(now, ip, ua, jobId).run();
            } catch (_) {
                // ignore if columns don't exist yet
            }

            await audit(env, userId, "job_created", jobId);

            // Review-mode V1: process immediately so reviewers see the lifecycle without Cron/Queues.
            if (reviewMode) {
                await processSpecificJobNow(env, userId, jobId, `inline:${crypto.randomUUID()}`);
            }

            return redirect("/jobs");
        });
    }

    return requireUser(request, env, async (userId) => {
        let jobs;
        try {
            jobs = await env.DB.prepare(
                "SELECT id, status, status_detail, attempt_count, next_attempt_at, video_url, created_at, updated_at, last_error FROM jobs WHERE user_id=?1 ORDER BY created_at DESC LIMIT 50"
            ).bind(userId).all();
        } catch (_) {
            // Backward compatible if migrations aren't applied yet
            jobs = await env.DB.prepare(
                "SELECT id, status, video_url, created_at, updated_at, last_error FROM jobs WHERE user_id=?1 ORDER BY created_at DESC LIMIT 50"
            ).bind(userId).all();
        }

        const body = `
<h2>Job history</h2>
<div class="card">
  <a href="/dashboard">Back to dashboard</a>
</div>
<div class="card">
  <ul>
    ${(jobs.results || []).map(j => `
      <li>
        <code>${escapeHtml(j.id)}</code>
        — <strong>${escapeHtml(j.status)}</strong>
        — ${escapeHtml(j.created_at)}
        <div style="margin:6px 0 10px 0;font-size:14px;color:#555">
          ${escapeHtml(j.video_url)}
          ${typeof j.status_detail !== "undefined" ? `<div style=\"margin-top:4px\">detail: ${escapeHtml(j.status_detail || "")} • attempts: ${escapeHtml(String(j.attempt_count || 0))}${j.next_attempt_at ? ` • next: ${escapeHtml(j.next_attempt_at)}` : ""}</div>` : ""}
          ${j.last_error ? `<div><em>${escapeHtml(j.last_error)}</em></div>` : ""}
        </div>
      </li>`).join("") || "<li>No jobs yet</li>"}
  </ul>
</div>
`;
        return html(200, body);
    });
}

// ---------- Review-mode: job leasing + immediate processing ----------

function isReviewMode(env) {
    return String(env.REVIEW_MODE || "").toLowerCase() === "true";
}

function isoNow() {
    return new Date().toISOString();
}

function isoMinusMinutes(mins) {
    return new Date(Date.now() - mins * 60_000).toISOString();
}

function backoffSeconds(attemptCount) {
    // 30s, 2m, 10m, 30m...
    if (attemptCount <= 0) return 30;
    if (attemptCount === 1) return 120;
    if (attemptCount === 2) return 600;
    return 1800;
}

async function claimJobById(env, userId, jobId, workerId) {
    const now = isoNow();
    const staleCutoff = isoMinusMinutes(5);

    // Attempt to claim this specific job (idempotent / double-click safe)
    const res = await env.DB.prepare(`
UPDATE jobs
SET status='processing',
    status_detail='leased',
    locked_by=?1,
    locked_at=?2,
    updated_at=?3
WHERE id=?4
  AND user_id=?5
  AND status IN ('queued','retry')
  AND (next_attempt_at IS NULL OR next_attempt_at <= ?6)
  AND (locked_at IS NULL OR locked_at <= ?7);
`).bind(workerId, now, now, jobId, userId, now, staleCutoff).run();

    if ((res.meta?.changes || 0) !== 1) return null;
    return await env.DB.prepare("SELECT * FROM jobs WHERE id=?1 AND user_id=?2").bind(jobId, userId).first();
}

async function leaseNextEligibleJob(env, userId, workerId, opts = {}) {
    const ignoreNextAttempt = !!opts.ignoreNextAttempt;

    // In review/manual mode, we want the *oldest* queued/retry job even if next_attempt_at is in the future.
    const sql = ignoreNextAttempt
        ? `
  SELECT *
  FROM jobs
  WHERE user_id = ?1
    AND status IN ('queued','retry')
  ORDER BY created_at ASC
  LIMIT 1
`
        : `
  SELECT *
  FROM jobs
  WHERE user_id = ?1
    AND status IN ('queued','retry')
    AND (next_attempt_at IS NULL OR next_attempt_at <= ?2)
  ORDER BY COALESCE(next_attempt_at, created_at) ASC
  LIMIT 1
`;

    const nowIso = isoNow();
    const row = ignoreNextAttempt
        ? await env.DB.prepare(sql).bind(userId).first()
        : await env.DB.prepare(sql).bind(userId, nowIso).first();

    if (!row) return null;

    // Claim/lock it (reuse your existing claim logic if you already have it)
    await env.DB.prepare(`
UPDATE jobs
SET locked_by=?1,
    locked_at=?2,
    updated_at=?2
WHERE id=?3 AND user_id=?4
`).bind(workerId, nowIso, row.id, userId).run();

    // Re-read to return the latest state
    return await env.DB.prepare(`SELECT * FROM jobs WHERE id=?1 AND user_id=?2`)
        .bind(row.id, userId)
        .first();
}

async function markJobSucceeded(env, userId, jobId, detail) {
    const now = isoNow();
    await env.DB.prepare(`
UPDATE jobs
SET status='succeeded',
    status_detail=?1,
    last_error=NULL,
    next_attempt_at=NULL,
    locked_by=NULL,
    locked_at=NULL,
    updated_at=?2
WHERE id=?3 AND user_id=?4;
`).bind(detail || "succeeded", now, jobId, userId).run();
}



async function markJobRetryOrFail(env, userId, jobId, detail, errMsg) {
    const now = isoNow();
    const row = await env.DB.prepare(
        "SELECT attempt_count, max_attempts FROM jobs WHERE id=?1 AND user_id=?2"
    ).bind(jobId, userId).first();

    const attempt = Number(row?.attempt_count || 0);
    const maxAttempts = Number(row?.max_attempts || 10);
    const nextAttemptAt = new Date(Date.now() + backoffSeconds(attempt) * 1000).toISOString();
    const nextStatus = (attempt + 1 >= maxAttempts) ? "failed" : "retry";

    await env.DB.prepare(`
UPDATE jobs
SET status=?1,
    status_detail=?2,
    last_error=?3,
    attempt_count=attempt_count+1,
    next_attempt_at=?4,
    locked_by=NULL,
    locked_at=NULL,
    updated_at=?5
WHERE id=?6 AND user_id=?7;
`).bind(nextStatus, detail || "retry", String(errMsg || ""), nextAttemptAt, now, jobId, userId).run();
}

/**
* V1 review build: "process" the job immediately.
* For now, this is a stub that proves your lifecycle works.
* Next iteration: replace the stub with TikTok FILE_UPLOAD publish.
*/
async function processJob(env, job) {
    const method = String(job.transfer_method || "file_upload").toLowerCase();

    // Record that we actually started processing
    await env.DB.prepare(`
UPDATE jobs
SET status_detail = ?
WHERE id = ?
`).bind(`processing:${method}`, job.id).run();

    if (method === "file_upload") {
        return processJobFileUploadStub(env, job);
    }

    if (method === "pull_from_url") {
        return processJobPullFromUrl(env, job);
    }

    // default fallback
    return { final: "succeeded", detail: "no_op" };
    // throw new Error(`Unknown transfer_method: ${method}`);
}

async function processJobFileUploadStub(env, job) {
    // This is where FILE_UPLOAD logic will go next.
    // For review, we just mark it successful and return a consistent shape.
    await env.DB.prepare(`
UPDATE jobs
SET status = 'succeeded',
    status_detail = 'stub:file_upload',
    updated_at = ?
WHERE id = ?
`).bind(new Date().toISOString(), job.id).run();

    return { final: "succeeded", detail: "stub_file_upload" };
}


async function processJobPullFromUrl(env, job) {
    const accessToken = await getTikTokAccessToken(env, job.user_id);

    // 1) If we already have a publish_id, DO NOT init again.
    // Just poll status.
    if (job.publish_id) {
        const statusData = await tiktokFetchPostStatus(accessToken, job.publish_id);
        const status = statusData?.data?.status;

        // Persist last known status for debugging/review
        await env.DB.prepare(`
  UPDATE jobs
  SET status_detail=?1,
      updated_at=?2
  WHERE id=?3
`).bind(`tiktok_status:${status || "unknown"}`, isoNow(), job.id).run();

        // TikTok-defined statuses
        // - SEND_TO_USER_INBOX = notification delivered (you can mark success)
        // - PUBLISH_COMPLETE = user posted it (also success)
        // - FAILED = fail terminal
        // - PROCESSING_DOWNLOAD/PROCESSING_UPLOAD = retry
        if (status === "SEND_TO_USER_INBOX" || status === "PUBLISH_COMPLETE") {
            return { final: "succeeded", detail: `tiktok_${status.toLowerCase()}`, statusData };
        }

        if (status === "FAILED") {
            const reason = statusData?.data?.fail_reason || "unknown_fail_reason";
            return {
                final: "failed",
                detail: `tiktok_failed:${reason}`,
                statusData
            };
        }

        // Still processing
        return { final: "retry", detail: `tiktok_${(status || "processing").toLowerCase()}`, statusData };
    }

    // 2) No publish_id yet => init ONCE
    const initUrl = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
    const payload = {
        source_info: {
            source: "PULL_FROM_URL",
            video_url: job.video_url,
        },
    };

    const initResp = await fetch(initUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(payload),
    });

    const initData = await initResp.json().catch(() => ({}));
    if (!initResp.ok) {
        throw new Error(
            `TikTok init (PULL_FROM_URL) failed (${initResp.status}): ${JSON.stringify(initData).slice(0, 400)}`
        );
    }

    const publishId = initData?.data?.publish_id;
    if (!publishId) {
        throw new Error(`TikTok init missing publish_id: ${JSON.stringify(initData).slice(0, 300)}`);
    }

    // Save publish_id so next retry polls it
    await env.DB.prepare(`
UPDATE jobs
SET publish_id=?1,
    status_detail=?2,
    updated_at=?3
WHERE id=?4
`).bind(publishId, "tiktok_init_ok", isoNow(), job.id).run();

    // We don’t need to poll immediately; just schedule a retry
    return { final: "retry", detail: "tiktok_processing_download", statusData: initData };
}



async function tiktokFetchPostStatus(accessToken, publishId) {
    // TikTok docs show status fetch uses publish_id
    // Endpoint to verify: /v2/post/publish/status/fetch/
    const url = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(
            `TikTok status fetch failed (${resp.status}): ${JSON.stringify(data).slice(0, 400)}`
        );
    }
    return data;
}




async function processSpecificJobNow(env, userId, jobId, workerId) {
    workerId = workerId || `auto:${crypto.randomUUID()}`;
    const job = await claimJobById(env, userId, jobId, workerId);
    if (!job) return null;

    try {
        const result = (await processJob(env, job)) || { final: "succeeded", detail: "no_result" };

        if (result?.statusData) {
            await audit(env, userId, "tiktok_status_fetch", JSON.stringify(result.statusData).slice(0, 1500));
        }

        if (result.final === "retry") {
            await markJobRetryOrFail(env, userId, jobId, result.detail || "retry", "TikTok still processing");
            await audit(env, userId, "job_processed_retry", jobId);
        } else if (result.final === "failed") {
            await markJobRetryOrFail(env, userId, jobId, result.detail || "failed", "TikTok returned FAILED");
            await audit(env, userId, "job_processed_failed", jobId);
        } else {
            await markJobSucceeded(env, userId, jobId, result.detail || "succeeded");
            await audit(env, userId, "job_processed_succeeded", jobId);
        }
    } catch (err) {
        await markJobRetryOrFail(env, userId, jobId, "job_failed", err?.message || String(err));
        await audit(env, userId, "job_process_failed", `${jobId}:${(err?.message || String(err)).slice(0, 300)}`);
    }

    return job;
}


async function handleRunOneJob(request, env, userId) {
    if (!isReviewMode(env)) return redirect("/jobs");

    const workerId = `manual:${crypto.randomUUID()}`;

    // If your leaseNextEligibleJob supports opts.ignoreNextAttempt, keep it.
    // Otherwise remove the 4th arg.
    const job = await leaseNextEligibleJob(env, userId, workerId, { ignoreNextAttempt: true });
    if (!job) return redirect("/jobs");

    try {
        const result = (await processJob(env, job)) || { final: "succeeded", detail: "no_result" };

        if (result?.statusData) {
            await audit(env, userId, "tiktok_status_fetch", JSON.stringify(result.statusData).slice(0, 1500));
        }

        if (result.final === "retry") {
            await markJobRetryOrFail(env, userId, job.id, result.detail || "retry", "TikTok still processing");
            await audit(env, userId, "job_run_one_retry", job.id);
        } else if (result.final === "failed") {
            await markJobRetryOrFail(env, userId, job.id, result.detail || "failed", "TikTok returned FAILED");
            await audit(env, userId, "job_run_one_failed", job.id);
        } else {
            await markJobSucceeded(env, userId, job.id, result.detail || "succeeded");
            await audit(env, userId, "job_run_one_succeeded", job.id);
        }
    } catch (err) {
        await markJobRetryOrFail(env, userId, job.id, "job_failed", err?.message || String(err));
        await audit(env, userId, "job_run_one_failed", `${job.id}:${(err?.message || String(err)).slice(0, 300)}`);
    }

    return redirect("/jobs");
}



// ---------- TikTok OAuth (stub for next step) ----------
function getTikTokCreds(env) {
    const mode = String(env.TIKTOK_ENV || "sandbox").toLowerCase();

    if (mode === "production" || mode === "prod") {
        return {
            key: getEnvOrThrow(env, "TIKTOK_CLIENT_KEY_PROD"),
            secret: getEnvOrThrow(env, "TIKTOK_CLIENT_SECRET_PROD"),
        };
    }

    // default: sandbox
    return {
        key: getEnvOrThrow(env, "TIKTOK_CLIENT_KEY_SANDBOX"),
        secret: getEnvOrThrow(env, "TIKTOK_CLIENT_SECRET_SANDBOX"),
    };
}

async function connectTikTokStart(request, env, userId) {
    const { key: clientKey } = getTikTokCreds(env);
    const redirectUri = "https://app.hockeygamebot.com/auth/tiktok/callback";

    // PKCE (recommended)
    const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
    const codeVerifier = base64Url(verifierBytes);
    const codeChallenge = await sha256Base64Url(codeVerifier);

    const state = crypto.randomUUID();

    // Store state -> user + verifier in KV for 10 minutes
    await env.KV.put(
        `oauth_state:${state}`,
        JSON.stringify({ userId, codeVerifier, createdAt: new Date().toISOString() }),
        { expirationTtl: 600 }
    );

    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    const scope = (env.TIKTOK_SCOPES || "user.info.basic,video.upload").trim();

    authUrl.searchParams.set("client_key", clientKey);
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    await audit(env, userId, "tiktok_oauth_start", state);
    return redirect(authUrl.toString());
}

async function handleTikTokCallback(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const err = url.searchParams.get("error");

    if (err) return html(400, simplePage("TikTok OAuth error", `TikTok returned error: ${err}`));
    if (!code || !state) return html(400, simplePage("TikTok OAuth error", "Missing code/state"));

    const key = `oauth_state:${state}`;
    const stateRaw = await env.KV.get(key);
    if (!stateRaw) return html(400, simplePage("TikTok OAuth error", "Invalid or expired state"));

    // delete immediately to prevent replay
    await env.KV.delete(key);

    let parsed;
    try {
        parsed = JSON.parse(stateRaw);
    } catch {
        return html(400, simplePage("TikTok OAuth error", "Corrupt state"));
    }
    const { userId, codeVerifier } = parsed || {};
    if (!userId || !codeVerifier) return html(400, simplePage("TikTok OAuth error", "Invalid state payload"));

    const { key: clientKey, secret: clientSecret } = getTikTokCreds(env);
    const redirectUri = (env.TIKTOK_REDIRECT_URI || "https://app.hockeygamebot.com/auth/tiktok/callback").trim();

    // Exchange code -> tokens
    const tokenResp = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code: code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        }),
    });

    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok) {
        await audit(env, userId, "tiktok_oauth_token_exchange_failed", JSON.stringify(tokenJson).slice(0, 500));
        return html(400, simplePage("TikTok token exchange failed", JSON.stringify(tokenJson, null, 2)));
    }

    // normalize fields across possible response shapes
    const t = tokenJson.data ? tokenJson.data : tokenJson;

    const accessToken = t.access_token;
    const refreshToken = t.refresh_token;
    const openId = t.open_id || t.openId;
    const expiresIn = Number(t.expires_in || t.expiresIn || 0);
    const refreshExpiresIn = Number(t.refresh_expires_in || t.refreshExpiresIn || 0);
    const scopeStr = String(t.scope || "");

    if (!accessToken || !refreshToken || !openId) {
        await audit(env, userId, "tiktok_oauth_bad_token_payload", JSON.stringify(tokenJson).slice(0, 500));
        return html(400, simplePage("TikTok OAuth error", "Token response missing required fields (open_id/access_token/refresh_token)"));
    }


    const now = new Date();
    const accessExp = new Date(now.getTime() + expiresIn * 1000).toISOString();
    const refreshExp = new Date(now.getTime() + refreshExpiresIn * 1000).toISOString();


    // Optional: fetch user profile to show in dashboard (user.info.basic)
    let displayName = null;
    let avatarUrl = null;
    try {
        const meResp = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (meResp.ok) {
            const me = await meResp.json();
            displayName = me?.data?.user?.display_name || null;
            avatarUrl = me?.data?.user?.avatar_url || null;
        }
    } catch (_) { }

    // Upsert account row for this user + open_id
    const acctExisting = await env.DB.prepare(
        "SELECT id FROM tiktok_accounts WHERE user_id=?1 AND open_id=?2 LIMIT 1"
    ).bind(userId, openId).first();

    const acctId = acctExisting?.id || crypto.randomUUID();
    if (!acctExisting) {
        await env.DB.prepare(
            "INSERT INTO tiktok_accounts (id, user_id, open_id, display_name, avatar_url, connected_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        ).bind(acctId, userId, openId, displayName, avatarUrl, now.toISOString()).run();
    } else {
        await env.DB.prepare(
            "UPDATE tiktok_accounts SET disconnected_at=NULL, display_name=?1, avatar_url=?2 WHERE id=?3"
        ).bind(displayName, avatarUrl, acctId).run();
    }

    // Store encrypted tokens
    const accessEnc = await encryptString(env, accessToken);
    const refreshEnc = await encryptString(env, refreshToken);

    await env.DB.prepare(
        `INSERT INTO tiktok_tokens (tiktok_account_id, access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at, scopes, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT(tiktok_account_id) DO UPDATE SET
 access_token_enc=excluded.access_token_enc,
 refresh_token_enc=excluded.refresh_token_enc,
 access_expires_at=excluded.access_expires_at,
 refresh_expires_at=excluded.refresh_expires_at,
 scopes=excluded.scopes,
 updated_at=excluded.updated_at`
    ).bind(acctId, accessEnc, refreshEnc, accessExp, refreshExp, scopeStr, now.toISOString()).run();

    await audit(env, userId, "tiktok_connected", openId);

    return redirect("/dashboard");
}

async function disconnectTikTok(request, env, userId) {
    const acct = await env.DB.prepare(
        "SELECT id FROM tiktok_accounts WHERE user_id=?1 AND disconnected_at IS NULL ORDER BY connected_at DESC LIMIT 1"
    ).bind(userId).first();

    if (!acct) return redirect("/dashboard");

    await env.DB.prepare(
        "UPDATE tiktok_accounts SET disconnected_at=?1 WHERE id=?2"
    ).bind(new Date().toISOString(), acct.id).run();

    await audit(env, userId, "tiktok_disconnected", acct.id);
    return redirect("/dashboard");
}

function parseIsoMs(s) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
}

async function getTikTokAccessToken(env, userId) {
    // tiktok_tokens is keyed by tiktok_account_id, so join to tiktok_accounts to find the
    // currently-connected account for this user.
    const row = await env.DB.prepare(`
SELECT
  tt.tiktok_account_id,
  tt.access_token_enc,
  tt.refresh_token_enc,
  tt.access_expires_at,
  tt.refresh_expires_at
FROM tiktok_tokens tt
JOIN tiktok_accounts ta
  ON ta.id = tt.tiktok_account_id
WHERE ta.user_id = ?1
  AND ta.disconnected_at IS NULL
ORDER BY ta.connected_at DESC
LIMIT 1
`).bind(userId).first();

    if (!row) throw new Error("No TikTok token found for user");

    const nowMs = Date.now();
    const expMs = parseIsoMs(row.access_expires_at);

    // If token is valid for > 5 minutes, return it
    if (expMs && (expMs - nowMs) > (5 * 60 * 1000)) {
        return await decryptString(env, row.access_token_enc);
    }

    // Refresh token expiry guard
    const refreshExpMs = parseIsoMs(row.refresh_expires_at);
    if (refreshExpMs && refreshExpMs <= nowMs) {
        throw new Error("TikTok refresh token expired; reconnect TikTok");
    }

    const refreshToken = await decryptString(env, row.refresh_token_enc);
    const { key: clientKey, secret: clientSecret } = getTikTokCreds(env);

    const tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";

    const body = new URLSearchParams();
    body.set("client_key", clientKey);
    body.set("client_secret", clientSecret);
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);

    const resp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(`TikTok token refresh failed (${resp.status}): ${JSON.stringify(data).slice(0, 300)}`);
    }

    const newAccess = data.access_token;
    const newRefresh = data.refresh_token || refreshToken;

    const expiresIn = Number(data.expires_in || 0);
    const refreshExpiresIn = Number(data.refresh_expires_in || 0);

    if (!newAccess || !expiresIn) {
        throw new Error(`TikTok refresh response missing fields: ${JSON.stringify(data).slice(0, 300)}`);
    }

    const newAccessExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const newRefreshExpiresAt = refreshExpiresIn
        ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
        : row.refresh_expires_at;

    const newAccessEnc = await encryptString(env, newAccess);
    const newRefreshEnc = await encryptString(env, newRefresh);

    // Update by PK (tiktok_account_id)
    await env.DB.prepare(`
UPDATE tiktok_tokens
SET access_token_enc=?1,
    refresh_token_enc=?2,
    access_expires_at=?3,
    refresh_expires_at=?4
WHERE tiktok_account_id=?5
`).bind(
        newAccessEnc,
        newRefreshEnc,
        newAccessExpiresAt,
        newRefreshExpiresAt,
        row.tiktok_account_id
    ).run();

    await audit(env, userId, "tiktok_token_refreshed", String(row.tiktok_account_id));
    return newAccess;
}


// ---------- crypto: password hashing ----------
async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    return `pbkdf2$${bufToB64(salt)}$${bufToB64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
    const [alg, saltB64, hashB64] = stored.split("$").filter(Boolean);
    if (alg !== "pbkdf2") return false;
    const salt = b64ToBuf(saltB64);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    const computed = bufToB64(new Uint8Array(bits));
    return timingSafeEqual(computed, hashB64);
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
}

function bufToB64(buf) {
    let s = "";
    for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
}
function b64ToBuf(b64) {
    const s = atob(b64);
    const buf = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
    return buf;
}

// ---------- TikTok OAuth helpers ----------
function base64Url(bytes) {
    const b64 = btoa(String.fromCharCode(...bytes));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(str) {
    const data = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64Url(new Uint8Array(digest));
}

function getEnvOrThrow(env, name) {
    const v = env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

// AES-GCM encrypt/decrypt using TOKEN_ENC_KEY (base64 32 bytes)
async function getAesKey(env) {
    const raw = Uint8Array.from(atob(getEnvOrThrow(env, "TOKEN_ENC_KEY")), c => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptString(env, plaintext) {
    const key = await getAesKey(env);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
    return `${base64Url(iv)}.${base64Url(new Uint8Array(ct))}`;
}

async function decryptString(env, blob) {
    const [ivB64, ctB64] = String(blob).split(".");
    const key = await getAesKey(env);
    const iv = Uint8Array.from(atob(ivB64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((ivB64.length + 3) % 4)), c => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((ctB64.length + 3) % 4)), c => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
}


// ---------- sessions ----------
async function createSession(env, userId) {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const exp = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await env.DB.prepare(
        "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)"
    ).bind(sessionId, userId, exp.toISOString(), now.toISOString()).run();
    return sessionId;
}

async function getUserIdFromSession(request, env) {
    const cookie = request.headers.get("Cookie") || "";
    const m = cookie.match(/hgb_sess=([^;]+)/);
    if (!m) return null;
    const sid = m[1];
    const row = await env.DB.prepare(
        "SELECT user_id, expires_at FROM sessions WHERE id=?1"
    ).bind(sid).first();
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return row.user_id;
}

function sessionCookie(sessionId) {
    return {
        "Set-Cookie": `hgb_sess=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    };
}

function clearSessionCookie() {
    return "hgb_sess=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function redirect(location, extraHeaders = {}) {
    return new Response(null, { status: 302, headers: { Location: location, ...extraHeaders } });
}

// ---------- audit ----------
async function audit(env, userId, action, detail) {
    await env.DB.prepare(
        "INSERT INTO audit_events (id, user_id, action, detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
    ).bind(crypto.randomUUID(), userId, action, detail || "", new Date().toISOString()).run();
}
