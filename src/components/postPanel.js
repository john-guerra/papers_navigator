import { html } from "htl";
import {
  POST_LIMIT,
  composePost,
  composeUrl,
  graphemes,
  searchAccounts,
} from "../lib/bluesky.js";

let uid = 0;

/**
 * "Post" on Bluesky (#203 Stage C): an editable draft for `paper` ("<title>" by <authors>
 * ★★★★ <note>, a link, #ieeevis) with a live "n / 300" count; the link is the conference page
 * or this tool's (`linkSetting`, remembered); each author can be looked up on Bluesky (their
 * name is the only thing sent, and only on tap) and you pick the right account, never
 * automatically (`handles`, remembered by name). Photos ("Take photo", "Choose photos") go
 * with "Share…" (the phone's share menu, when it can share them); "Copy text & open Bluesky"
 * always works. Nothing is posted from here.
 */
export function renderPostPanel(
  paper,
  {
    rating = 0,
    note = "",
    toolLink = "",
    handles,
    linkSetting,
    discussionUrl = null,
    fetch = globalThis.fetch,
    share = globalThis.navigator ?? {},
    open = (...args) => globalThis.open?.(...args),
    clipboard = globalThis.navigator?.clipboard,
  } = {},
) {
  const id = ++uid;
  const names = (paper.authors ?? []).map((a) => a.name).filter(Boolean);
  const area = html`<textarea
    class="post-text"
    rows="5"
    aria-label="Bluesky post"
  ></textarea>`;
  const count = html`<span class="post-count" aria-live="polite"></span>`;
  const status = html`<p class="post-status muted" aria-live="polite"></p>`;
  let edited = false;
  const draft = () =>
    composePost({
      title: paper.title,
      authors: names,
      handles: Object.fromEntries(names.map((n) => [n, handles.get(n)])),
      rating,
      note,
      link: linkSetting.value && toolLink ? toolLink : (paper.url ?? ""),
    }).text;
  const recount = () => {
    const n = graphemes(area.value);
    count.textContent = `${n} / ${POST_LIMIT}`;
    count.classList.toggle("is-over", n > POST_LIMIT);
  };
  const refresh = () => {
    if (!edited) area.value = draft();
    recount();
  };
  area.addEventListener("input", () => {
    edited = true;
    recount();
  });

  // Link: the conference page or this tool
  const radio = (value, label) => {
    const input = html`<input
      type="radio"
      name=${`post-link-${id}`}
      value=${value}
    />`;
    input.checked = (value === "tool") === Boolean(linkSetting.value);
    return html`<label>${input} ${label}</label>`;
  };
  const linkChoice = html`<fieldset class="post-link">
    <legend>Link</legend>
    ${radio("conference", "Conference page")}
    ${toolLink ? radio("tool", "This tool") : ""}
  </fieldset>`;
  linkChoice.addEventListener("change", (event) => {
    linkSetting.set(event.target.value === "tool");
    refresh();
  });

  // Authors: find their Bluesky account and pick it (or not)
  const authorRow = (name) => {
    const row = html`<li class="post-author"></li>`;
    const draw = (results = null, message = "") => {
      const handle = handles.get(name);
      const find = html`<button type="button" class="btn-text post-find">
        Find on Bluesky
      </button>`;
      find.onclick = async () => {
        draw(null, "Searching…");
        try {
          const accounts = await searchAccounts(name, { fetch });
          draw(accounts, accounts.length ? "" : "No accounts found");
        } catch {
          draw(null, "Bluesky search needs a connection");
        }
      };
      const forget = html`<button
        type="button"
        class="btn-text post-forget"
        aria-label=${`Forget @${handle}`}
      >
        ✕
      </button>`;
      forget.onclick = () => {
        handles.set(name, "");
        draw();
        refresh();
      };
      const list = results?.length
        ? html`<div class="post-accounts">
            ${results.map((a) => {
              const b = html`<button type="button" class="post-account">
                ${a.avatar ? html`<img src=${a.avatar} alt="" width="24" height="24" loading="lazy" />` : ""}
                <span>${a.name || a.handle}</span>
                <span class="muted">@${a.handle}</span>
              </button>`;
              b.onclick = () => {
                handles.set(name, a.handle);
                draw();
                refresh();
              };
              return b;
            })}
            ${(() => {
              const none = html`<button
                type="button"
                class="btn-text post-none"
              >
                None of these
              </button>`;
              none.onclick = () => draw();
              return none;
            })()}
          </div>`
        : "";
      row.replaceChildren(
        html`<span class="post-author-name">${name}</span>`,
        handle
          ? html`<span class="post-handle">@${handle} ${forget}</span>`
          : find,
        message
          ? html`<span class="muted post-author-message">${message}</span>`
          : "",
        list,
      );
    };
    draw();
    return row;
  };

  // Photos, for the share menu
  let photos = [];
  const photoCount = html`<span class="muted post-photos"></span>`;
  const showPhotos = () =>
    (photoCount.textContent = photos.length
      ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`
      : "");
  const fileInput = (cls, attrs) => {
    const input = html`<input
      type="file"
      accept="image/*"
      class=${cls}
      hidden
    />`;
    for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
    input.addEventListener("change", () => {
      photos = [...photos, ...(input.files ?? [])];
      showPhotos();
    });
    return input;
  };
  const take = fileInput("post-take-input", { capture: "environment" });
  const choose = fileInput("post-choose-input", { multiple: "" });
  const pick = (input, label) => {
    const b = html`<button type="button">${label}</button>`;
    b.onclick = () => input.click();
    return b;
  };

  // Sending
  const canShare = typeof share?.share === "function";
  const shareButton = canShare
    ? html`<button type="button" class="post-share">Share…</button>`
    : "";
  if (shareButton)
    shareButton.onclick = async () => {
      status.textContent = "";
      const data =
        photos.length && share.canShare?.({ files: photos })
          ? { text: area.value, files: photos }
          : { text: area.value };
      try {
        await share.share(data);
      } catch (error) {
        if (error?.name !== "AbortError")
          status.textContent =
            "Couldn't open the share menu: use Copy text & open Bluesky.";
      }
    };
  const copyOpen = html`<button type="button" class="post-copy-open">
    Copy text & open Bluesky
  </button>`;
  copyOpen.onclick = async () => {
    try {
      await clipboard?.writeText(area.value);
    } catch {
      // The compose page gets the text anyway
    }
    open(composeUrl(area.value), "_blank", "noopener");
  };

  const el = html`<section
    class="post-panel"
    aria-label=${`Post about ${paper.title} on Bluesky`}
  >
    ${area}
    <div class="post-meta">${count}</div>
    ${linkChoice}
    <ul class="post-authors">
      ${names.map(authorRow)}
    </ul>
    <div class="post-photo-buttons">
      ${pick(take, "Take photo")} ${pick(choose, "Choose photos")} ${photoCount}
      ${take}${choose}
    </div>
    <div class="post-send">${shareButton} ${copyOpen}</div>
    ${status}
    ${discussionUrl ? html`<p><a class="post-discussion" href=${discussionUrl} target="_blank" rel="noopener">💬 Discussion on Bluesky</a></p>` : ""}
  </section>`;
  refresh();
  return el;
}
