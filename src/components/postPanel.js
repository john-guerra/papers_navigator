import { html } from "htl";
import {
  POST_LIMIT,
  composePost,
  composeUrl,
  graphemes,
  affiliationMatch,
  NO_HANDLE,
  profileUrl,
  searchAccounts,
} from "../lib/bluesky.js";

let uid = 0;
let detailsUid = 0;

/**
 * "Post" on Bluesky (#203 Stage C): an editable draft for `paper` ("<title>" by <authors>
 * ★★★★ <note>, a link, #ieeevis) with a live "n / 300" count; the link is the conference page
 * or this tool's (`linkSetting`, remembered); each author can be looked up on Bluesky (their
 * name is the only thing sent, and only on tap) and you pick the right account, never
 * automatically (`handles`, remembered by name). A handle the conference lists next to an
 * author's name (`author.bluesky`) is used until you pick another or remove it. Photos ("Take photo", "Choose photos") go
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
    // Stores to follow (ratings, notes): the draft updates while you haven't edited it
    watch = [],
  } = {},
) {
  const id = ++uid;
  const names = (paper.authors ?? []).map((a) => a.name).filter(Boolean);
  const affiliationOf = new Map(
    (paper.authors ?? []).map((a) => [a.name, a.affiliation ?? ""]),
  );
  const listedOf = new Map(
    (paper.authors ?? []).map((a) => [a.name, a.bluesky ?? ""]),
  );
  // The handle in the draft: yours, else the conference's (unless you removed it)
  const handleOf = (name) => {
    const mine = handles.get(name);
    if (mine === NO_HANDLE) return "";
    return mine || listedOf.get(name) || "";
  };
  const area = html`<textarea
    class="post-text"
    rows="5"
    aria-label="Bluesky post"
  ></textarea>`;
  const count = html`<span class="post-count" aria-live="polite"></span>`;
  const status = html`<p class="post-status muted" aria-live="polite"></p>`;
  let edited = false;
  // `rating` and `note` may be getters, read each time the draft is rebuilt
  const now = (v) => (typeof v === "function" ? v() : v);
  // Once you edit the draft it's yours: say so when a change can't reach it (review #4)
  const editedNote = html`<p class="post-edited muted" aria-live="polite"></p>`;
  const reset = html`<button type="button" class="btn-text post-reset" hidden>
    Reset draft
  </button>`;
  reset.onclick = () => {
    edited = false;
    reset.hidden = true;
    editedNote.textContent = "";
    refresh();
  };
  const grow = () => {
    area.style.height = "auto";
    if (area.scrollHeight) area.style.height = `${area.scrollHeight}px`;
  };
  const draft = () =>
    composePost({
      title: paper.title,
      authors: names,
      handles: Object.fromEntries(names.map((n) => [n, handleOf(n)])),
      rating: now(rating),
      note: now(note),
      link: linkSetting.value && toolLink ? toolLink : (paper.url ?? ""),
    }).text;
  const recount = () => {
    const n = graphemes(area.value);
    count.textContent = `${n} / ${POST_LIMIT}`;
    count.classList.toggle("is-over", n > POST_LIMIT);
  };
  const refresh = () => {
    if (!edited) area.value = draft();
    else if (area.value !== draft())
      editedNote.textContent =
        "You edited the draft: tags, rating, note and link changes aren't applied to it.";
    recount();
    grow();
  };
  area.addEventListener("input", () => {
    edited = true;
    reset.hidden = false;
    recount();
    grow();
  });
  for (const store of watch) store.addEventListener("input", refresh);

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
      const handle = handleOf(name);
      const fromConference = handle && !handles.get(name);
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
        // A removed conference handle stays removed; yours is just forgotten
        handles.set(name, listedOf.get(name) ? NO_HANDLE : "");
        draw();
        refresh();
      };
      const list = results?.length
        ? html`<div class="post-accounts">
            ${results.map((a) => {
              // One line to pick from; who is this? (bio, activity, the paper's affiliation) on ⓘ
              const hint = affiliationMatch(a.bio, affiliationOf.get(name));
              const stats = accountStats(a);
              const b = html`<button type="button" class="post-account">
                ${a.avatar ? html`<img src=${a.avatar} alt="" width="24" height="24" loading="lazy" />` : ""}
                <span class="post-account-name">${a.name || a.handle}</span>
                <span class="muted post-account-handle">@${a.handle}</span>
                ${hint ? html`<span class="post-match" role="img" aria-label=${`Matches the paper: ${hint}`} title=${`Matches the paper: ${hint}`}>✓</span>` : ""}
              </button>`;
              b.onclick = () => {
                handles.set(name, a.handle);
                draw();
                refresh();
              };
              const detailsId = `post-details-${id}-${++detailsUid}`;
              const more = html`<button
                type="button"
                class="btn-text post-more"
                aria-expanded="false"
                aria-controls=${detailsId}
                aria-label=${`About @${a.handle}`}
              >
                ⓘ
              </button>`;
              const details = html`<div class="post-details" id=${detailsId}>
                ${a.bio ? html`<p class="post-bio">${a.bio}</p>` : ""}
                ${stats ? html`<p class="post-stats muted">${stats}</p>` : ""}
                ${hint ? html`<p class="post-hint">✓ Matches the paper: ${hint}</p>` : ""}
                <a
                  class="post-view"
                  href=${profileUrl(a.handle)}
                  target="_blank"
                  rel="noopener"
                  >View on Bluesky ↗</a
                >
              </div>`;
              more.onclick = () => {
                const open = !details.classList.contains("is-open");
                details.classList.toggle("is-open", open);
                more.setAttribute("aria-expanded", String(open));
              };
              return html`<div class="post-result">${b}${more}${details}</div>`;
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
          ? html`<span class="post-handle"
              >@${handle}
              ${
                fromConference
                  ? html`<span class="muted post-source"
                      >from the conference page</span
                    >`
                  : ""
              }
              ${forget}</span
            >`
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
  // Photos only where the device can share them (review #5)
  const canSharePhotos = (() => {
    try {
      return (
        canShare &&
        Boolean(
          share.canShare?.({
            files: [new File([""], "photo.jpg", { type: "image/jpeg" })],
          }),
        )
      );
    } catch {
      return false;
    }
  })();
  const shareButton = canShare
    ? html`<button type="button" class="post-share">Share…</button>`
    : "";
  if (shareButton)
    shareButton.onclick = async () => {
      status.textContent = "";
      const withPhotos = photos.length && share.canShare?.({ files: photos });
      const data = withPhotos
        ? { text: area.value, files: photos }
        : { text: area.value };
      if (photos.length && !withPhotos)
        status.textContent =
          "These photos can't be shared from here: the text goes alone, add them in Bluesky.";
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
  // Open first, in the tap itself (an await before it can get a popup blocked on iOS), then copy
  copyOpen.onclick = () => {
    open(composeUrl(area.value), "_blank", "noopener");
    // Still in the tap (the clipboard needs it too); the compose page has the text anyway
    try {
      clipboard?.writeText(area.value)?.catch?.(() => {});
    } catch {
      // no clipboard here
    }
  };

  const el = html`<section
    class="post-panel"
    aria-label=${`Post about ${paper.title} on Bluesky`}
  >
    ${area}
    <div class="post-meta">${editedNote} ${reset} ${count}</div>
    ${linkChoice}
    <ul class="post-authors">
      ${names.map(authorRow)}
    </ul>
    ${
      canSharePhotos
        ? html`<div class="post-photo-buttons">
            ${pick(take, "Take photo")} ${pick(choose, "Choose photos")}
            ${photoCount} ${take}${choose}
          </div>`
        : ""
    }
    <div class="post-send">${shareButton} ${copyOpen}</div>
    ${status}
    ${discussionUrl ? html`<p><a class="post-discussion" href=${discussionUrl} target="_blank" rel="noopener">💬 Discussion on Bluesky</a></p>` : ""}
  </section>`;
  refresh();
  /** Stops following the watched stores (the page calls it when the panel closes). */
  el.dispose = () => {
    for (const store of watch) store.removeEventListener("input", refresh);
  };
  return el;
}

const count = new Intl.NumberFormat("en-US");
const month = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
/** "1,200 followers · 45 posts · since May 2023" (what's known), or "". */
function accountStats({ followers, posts, joined }) {
  const plural = (n, noun) => `${count.format(n)} ${noun}${n === 1 ? "" : "s"}`;
  const since =
    joined && !Number.isNaN(Date.parse(joined))
      ? month.format(new Date(joined))
      : "";
  return [
    followers != null && plural(followers, "follower"),
    posts != null && plural(posts, "post"),
    since && `since ${since}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
