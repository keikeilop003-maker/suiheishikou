import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  projectId: "suiheishikou-139ba",
  appId: "1:367469523956:web:3c8f5385a294b016023fa1",
  storageBucket: "suiheishikou-139ba.firebasestorage.app",
  apiKey: "AIzaSyC32or9Posh5vgQgv1_WGnCriOMDGkteb0",
  authDomain: "suiheishikou-139ba.firebaseapp.com",
  messagingSenderId: "367469523956",
  measurementId: "G-01DWYG8B4K",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const submissionsRef = collection(db, "submissions");

const caseStudies = [
  { id: "pizzagate", title: "事例1：ピザ店での発砲事件", shortTitle: "ピザ店での発砲事件", a: "2016年12月、アメリカ・ワシントンD.C.のピザ店Comet Ping Pongに、AR-15型ライフル銃を持った男が侵入し、店内で発砲しながら内部を調べ回った。", b: "しかし男は、店員や客を殺傷することなく、しばらく店内を捜索した後、自ら警察に投降した。" },
  { id: "tylenol", title: "事例2：市販薬を飲んだ人々の突然死", shortTitle: "市販薬を飲んだ人々の突然死", a: "1982年、アメリカ・シカゴ周辺で、市販薬タイレノールを服用した人々が相次いで突然死亡した。被害者たちは、頭痛薬や風邪薬として購入したカプセルを飲んだ直後に倒れていた。", b: "死亡した人々が服用していたのは、いずれも同じメーカーのタイレノールだった。社会には大きな不安が広がり、ニュースでは市販薬による大量死亡事件として連日報道された。" },
  { id: "matsumoto-sarin", title: "事例3：住宅街で起きたサリン事件", shortTitle: "住宅街で起きたサリン事件", a: "1994年、長野県松本市の住宅街で、有毒ガスのサリンが散布される事件が発生した。住民が次々と倒れ、死者・重傷者が出る大事件となった。", b: "事件現場近くに住む男性は、農薬や薬品を扱っていた、化学に詳しかった、事件後すぐに警察へ通報していた、という特徴を持っていた。その後、メディアはこの男性を重要参考人として大きく報道した。" },
];

const deviceId = (() => {
  const key = "narrative-device-id";
  const saved = localStorage.getItem(key);
  if (saved) return saved;
  const next = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  localStorage.setItem(key, next);
  return next;
})();

let submissions = [];
let activeCaseId = "";
let isAdmin = false;

const casesLayout = document.querySelector("#casesLayout");
const responseModal = document.querySelector("#responseModal");
const modalForm = document.querySelector("#modalForm");
const modalTitle = document.querySelector("#modalTitle");
const modalStory = document.querySelector("#modalStory");
const modalCharCount = document.querySelector("#modalCharCount");
const modalStatus = document.querySelector("#modalStatus");
const modalCloseButton = document.querySelector("#modalCloseButton");
const adminLogin = document.querySelector("#adminLogin");
const adminPassword = document.querySelector("#adminPassword");
const adminActions = document.querySelector("#adminActions");
const clearAllButton = document.querySelector("#clearAllButton");

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderCases() {
  casesLayout.innerHTML = caseStudies.map((c, i) => `
    <article class="case-workspace" data-case-id="${c.id}">
      <section class="case-section prompt-section">
        <div class="case-meta">
          <div><p class="step-label">Case ${i + 1}</p><h2>${escapeHtml(c.shortTitle)}</h2></div>
          <button class="add-response-button" type="button" aria-label="${escapeHtml(c.title)}に回答する" data-case-id="${c.id}"><span>＋</span></button>
        </div>
        <div class="event-row">
          <div class="event-card event-a"><span>A</span><p>${escapeHtml(c.a)}</p></div>
          <div class="connector" aria-hidden="true"><span>?</span></div>
          <div class="event-card event-b"><span>B</span><p>${escapeHtml(c.b)}</p></div>
        </div>
      </section>
      <section class="case-section peer-section" aria-label="${escapeHtml(c.title)}の投稿一覧">
        <h3>みんなの回答</h3>
        <div class="submission-list case-submissions" data-case-id="${c.id}"><p class="status">まだ投稿はありません。</p></div>
      </section>
    </article>`).join("");
  document.querySelectorAll(".add-response-button").forEach((button) => button.addEventListener("click", () => openModal(button.dataset.caseId)));
}

function openModal(caseId) {
  const c = caseStudies.find((item) => item.id === caseId);
  activeCaseId = caseId;
  modalTitle.textContent = c ? `${c.shortTitle}への回答` : "回答を投稿";
  modalStory.value = "";
  modalCharCount.textContent = "0 / 700";
  modalStatus.textContent = "";
  responseModal.hidden = false;
  modalStory.focus();
}

function closeModal() {
  responseModal.hidden = true;
  activeCaseId = "";
}

function sortSubmissions(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return Number(a.order || 0) - Number(b.order || 0);
  });
}

function renderSubmissions() {
  document.querySelectorAll(".case-submissions").forEach((container) => {
    const items = sortSubmissions(submissions.filter((item) => item.pairId === container.dataset.caseId));
    if (!items.length) {
      container.innerHTML = `<p class="status">まだ投稿はありません。</p>`;
      return;
    }
    container.innerHTML = items.map((item) => {
      const created = new Date(item.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      return `<article class="submission-card ${item.pinned ? "is-pinned" : ""}" data-id="${item.id}">
        <header><time>${created}</time>${item.pinned ? `<span class="pin-mark">固定</span>` : ""}</header>
        <p>${escapeHtml(item.story)}</p>
        ${isAdmin ? `<div class="submission-controls"><button type="button" data-action="move-up" data-id="${item.id}">↑</button><button type="button" data-action="move-down" data-id="${item.id}">↓</button><button type="button" data-action="pin" data-id="${item.id}">${item.pinned ? "ピン解除" : "ピン留め"}</button><button type="button" data-action="delete" data-id="${item.id}">削除</button></div>` : ""}
      </article>`;
    }).join("");
  });
  if (isAdmin) document.querySelectorAll(".submission-controls button").forEach((button) => button.addEventListener("click", () => runAdminAction(button.dataset.action, button.dataset.id)));
}

function subscribeSubmissions() {
  onSnapshot(query(submissionsRef, orderBy("order", "asc")), (snapshot) => {
    submissions = snapshot.docs.map((documentSnapshot) => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
    renderSubmissions();
  }, () => {
    document.querySelectorAll(".case-submissions").forEach((container) => (container.innerHTML = `<p class="status">投稿を読み込めませんでした。</p>`));
  });
}

async function runAdminAction(action, id = "") {
  if (!isAdmin) return;
  if (action === "clear") {
    const snapshot = await getDocs(submissionsRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((documentSnapshot) => batch.delete(documentSnapshot.ref));
    await batch.commit();
    return;
  }
  const target = submissions.find((item) => item.id === id);
  if (!target) return;
  if (action === "delete") {
    await deleteDoc(doc(db, "submissions", id));
  } else if (action === "pin") {
    await updateDoc(doc(db, "submissions", id), { pinned: !Boolean(target.pinned) });
  } else if (action === "move-up" || action === "move-down") {
    const group = sortSubmissions(submissions.filter((item) => item.pairId === target.pairId));
    const index = group.findIndex((item) => item.id === id);
    const nextIndex = action === "move-up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= group.length) return;
    const other = group[nextIndex];
    await updateDoc(doc(db, "submissions", target.id), { order: other.order });
    await updateDoc(doc(db, "submissions", other.id), { order: target.order });
  }
}

adminLogin.addEventListener("submit", (event) => {
  event.preventDefault();
  if (adminPassword.value !== "1121") {
    alert("PASSが違います。");
    return;
  }
  isAdmin = true;
  adminLogin.classList.add("is-admin");
  adminPassword.disabled = true;
  adminActions.hidden = false;
  renderSubmissions();
});

clearAllButton.addEventListener("click", async () => {
  if (!confirm("すべての回答を削除しますか？")) return;
  await runAdminAction("clear");
});

modalStory.addEventListener("input", () => (modalCharCount.textContent = `${modalStory.value.length} / 700`));
modalCloseButton.addEventListener("click", closeModal);
responseModal.addEventListener("click", (event) => { if (event.target === responseModal) closeModal(); });
modalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  modalStatus.textContent = "";
  const story = modalStory.value.trim();
  if (!story) {
    modalStatus.textContent = "回答を入力してください。";
    return;
  }
  const submitButton = modalForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    await addDoc(submissionsRef, { name: "匿名", story, pairId: activeCaseId, deviceId, pinned: false, order: Date.now(), createdAt: new Date().toISOString() });
    closeModal();
  } catch (_) {
    modalStatus.textContent = "送信できませんでした。Firestoreの設定を確認してください。";
  } finally {
    submitButton.disabled = false;
  }
});

renderCases();
subscribeSubmissions();
