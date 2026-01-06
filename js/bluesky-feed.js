const API = "https://public.api.bsky.app/xrpc";

function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else node.setAttribute(k, v);
    }
    for (const c of children) node.appendChild(c);
    return node;
}

function formatTime(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function postUrlFromUri(uri) {
    // uri: at://did/.../app.bsky.feed.post/<rkey>
    const parts = uri.split("/");
    const rkey = parts[parts.length - 1];
    const did = uri.split("at://")[1].split("/")[0];
    return `https://bsky.app/profile/${did}/post/${rkey}`;
}

function extractText(item) {
    // item.post.record.text usually present
    const rec = item?.post?.record;
    return (rec && typeof rec.text === "string") ? rec.text : "";
}

function extractThumb(item) {
    // Handle images when present (simple version)
    // app.bsky.embed.images -> item.post.embed.images[].thumb
    const emb = item?.post?.embed;
    const images = emb?.images;
    if (Array.isArray(images) && images.length > 0) {
        const thumb = images[0]?.thumb;
        if (typeof thumb === "string" && thumb.startsWith("http")) return thumb;
    }
    return null;
}

function renderItem(item) {
    const author = item?.post?.author;
    const displayName = author?.displayName || author?.handle || "Unknown";
    const handle = author?.handle ? `@${author.handle}` : "";
    const createdAt = item?.post?.record?.createdAt || item?.post?.indexedAt || "";
    const uri = item?.post?.uri;

    const card = el("div", { class: "card" });

    const head = el("div", { class: "card-head" }, [
        el("div", { class: "author" }, [
            el("strong", {}, [document.createTextNode(displayName)]),
            el("span", {}, [document.createTextNode(handle)]),
        ]),
        el("div", { class: "time" }, [document.createTextNode(formatTime(createdAt))]),
    ]);

    const text = el("div", { class: "text" }, [document.createTextNode(extractText(item))]);

    card.appendChild(head);
    card.appendChild(text);

    const thumb = extractThumb(item);
    if (thumb) {
        const img = el("img", { class: "thumb", src: thumb, alt: "Post image" });
        card.appendChild(img);
    }

    if (uri) {
        const link = el("div", { class: "footer-note muted" }, [
            el("a", { href: postUrlFromUri(uri), target: "_blank", rel: "noreferrer" }, [document.createTextNode("Open on Bluesky")]),
        ]);
        card.appendChild(link);
    }

    return card;
}

async function fetchJson(url) {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

function mount(mountId) {
    const root = document.getElementById(mountId);
    if (!root) throw new Error(`Mount element #${mountId} not found`);
    return root;
}

export async function renderAuthorFeed({ mountId, actor, limit = 20 }) {
    const root = mount(mountId);
    root.innerHTML = `<div class="muted">Loading…</div>`;

    if (!actor || actor.includes("REPLACE_ME")) {
        root.innerHTML = `<div class="muted">Set your NJD handle in <code>teams/njd.html</code> (NJD_HANDLE).</div>`;
        return;
    }

    const url = `${API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=${encodeURIComponent(limit)}`;
    const data = await fetchJson(url);

    root.innerHTML = "";
    for (const item of (data.feed || [])) root.appendChild(renderItem(item));
}

export async function renderListFeed({ mountId, listAtUri, limit = 20 }) {
    const root = mount(mountId);
    root.innerHTML = `<div class="muted">Loading…</div>`;

    const url = `${API}/app.bsky.feed.getListFeed?list=${encodeURIComponent(listAtUri)}&limit=${encodeURIComponent(limit)}`;
    const data = await fetchJson(url);

    root.innerHTML = "";
    for (const item of (data.feed || [])) root.appendChild(renderItem(item));
}
