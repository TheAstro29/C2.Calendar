// ===== ตั้งค่า Firebase (เอาค่ามาจาก Firebase Console → Project settings → Your apps) =====
var firebaseConfig = {
  apiKey: "AIzaSyBjJLodAV1hkgaxxmgzvccMVAIW5S8hbqw",
  authDomain: "c2-calendar-c088f.firebaseapp.com",
  projectId: "c2-calendar-c088f",
  storageBucket: "c2-calendar-c088f.firebasestorage.app",
  messagingSenderId: "366484323689",
  appId: "1:366484323689:web:cce308b7968a77db3791f8"
};
firebase.initializeApp(firebaseConfig);
var fbAuth = firebase.auth();
var fbDb = firebase.firestore();
// เน็ตมือถือ/เครือข่ายบางเจ้าบล็อก-หน่วง WebChannel (WebSocket-like) ที่ Firestore ใช้เชื่อมต่อแบบ real-time
// ปกติ ทำให้กว่าจะได้ข้อมูลชุดแรกช้าผิดปกติ (เห็น splash ค้างนาน/ขึ้นข้อความ "เชื่อมต่อช้ากว่าปกติ" บ่อย) -
// ตั้งค่านี้ให้ Firestore เดาสภาพเครือข่ายเองและสลับไปใช้ long-polling อัตโนมัติเฉพาะตอนจำเป็นเท่านั้น
// (ไม่ใช่บังคับ long-polling ตลอดแบบ experimentalForceLongPolling ซึ่งช้ากว่าบนเน็ตปกติ) ต้องตั้งก่อนเรียก
// ใช้งาน fbDb ครั้งแรกเท่านั้น (เมธอด/listener ใดๆ) ไม่งั้น Firestore จะ error ว่าตั้งค่าหลังเริ่มใช้แล้วไม่ได้
fbDb.settings({ experimentalAutoDetectLongPolling: true });
var fbFunctions = firebase.app().functions("asia-southeast1");
var fbStorage = firebase.storage();

// key นี้ถูก restrict ไว้แล้ว (Application restriction: จำกัดเฉพาะโดเมนเว็บนี้, API restriction: จำกัดเฉพาะ
// Firestore/Storage/Auth/Installations + Maps JavaScript/Places/Geocoding เท่านั้น) — ถ้าจะเปลี่ยน key ใหม่
// อย่าลืม restrict ให้ครบทั้งสองแบบเหมือนกันก่อนใช้งานจริง
var GOOGLE_MAPS_API_KEY = 'AIzaSyBjJLodAV1hkgaxxmgzvccMVAIW5S8hbqw';

// ===== Web Push (FCM) - ต้องไปสร้าง "Web Push certificate" เองก่อนถึงจะใช้งานได้จริง =====
// ขั้นตอน (ทำครั้งเดียว ไม่ต้องทำซ้ำอีก): Firebase Console -> เลือกโปรเจกต์ c2-calendar-c088f ->
// ไอคอนเฟือง (Project settings) -> แท็บ "Cloud Messaging" -> เลื่อนลงหา "Web configuration" ->
// กด "Generate key pair" -> คัดลอกค่าที่ขึ้นมา (ขึ้นต้นด้วยตัวอักษร/ตัวเลขยาวๆ) มาแปะแทนที่ข้อความ
// 'PASTE_YOUR_FCM_VAPID_KEY_HERE' ด้านล่างนี้ - ถ้ายังไม่แปะ ระบบแจ้งเตือนอื่นๆ ในแอปยังทำงานปกติทุกอย่าง
// (กระดิ่ง/แจ้งเตือนในแอป) แค่จะยังไม่มี Push แจ้งเตือนออกมาที่มือถือ/เดสก์ท็อปตอนปิดแอปอยู่เท่านั้น
var FCM_VAPID_KEY = 'BILlcL9DwhAa7uVz8nFD_uS3ZNMa93EKewWzNQpNv-8RvIMFDb78g5DbKc94Y2iPfuQEGZNyWfyxPEoLc0EiSEM';

// ============================================================
// เชื่อมปุ่ม Back ของระบบ (มือถือ/เบราว์เซอร์) เข้ากับการปิด modal ต่างๆ
// หลักการ: ทุกครั้งที่เปิด modal ใดๆ ให้บันทึกไว้ใน browser history (pushState) ด้วย ไม่ใช่แค่โชว์ DOM เฉยๆ
// แล้วดักฟัง popstate (ตอนกด back) เพื่อสั่งปิด modal ที่เปิดอยู่ (เรียกฟังก์ชันปิดจริงเพื่อให้ cleanup ทำงานครบ)
// แทนที่จะปล่อยให้เบราว์เซอร์ปิดแอป/ออกจากหน้าปฏิทินไปเลยทั้งที่ผู้ใช้แค่อยากปิดหน้าต่างที่เปิดอยู่
// ============================================================
var _navRestoringCal = false;
// แก้บั๊ก: เดิม popstate handler ปิด modal overlay ที่ display:flex อยู่ "ทุกตัวพร้อมกัน" ในครั้งเดียว - ปกติ
// เปิดทีละอันจริง แต่บางจุดของแอปเปิด modal ซ้อนกัน 2 ชั้นได้ (เช่น เปิดลิสต์แจ้งเตือนแล้วกดงานในนั้น เปิด
// modal รายละเอียดงานซ้อนขึ้นมาอีกชั้นโดยไม่ปิด modal แจ้งเตือนก่อน) ทำให้กด Back ครั้งเดียวปิดทั้ง 2 modal
// พร้อมกันทั้งที่ pushState ไว้แค่ 1 ครั้งต่อการเปิด 1 modal - stack นี้เก็บลำดับการเปิดไว้ ให้กด Back
// แต่ละครั้งปิดแค่ modal ที่เปิดล่าสุด (ชั้นบนสุด) ทีละชั้นแทน ตรงกับความคาดหวังของผู้ใช้และจำนวน history
// entry ที่ pushState ไว้จริง
var _openModalStack = [];

var _MODAL_CLOSE_FN = {
  "login-modal-overlay": function () { closeLoginModal(); },
  "staff-modal-overlay": function () { closeStaffModal(); },
  "task-modal-overlay": function () { closeTaskModal(); },
  "holiday-modal-overlay": function () { closeHolidayModal(); },
  "dashboard-modal-overlay": function () { closeDashboardModal(); },
  "profile-modal-overlay": function () { closeProfileModal(); },
  "reschedule-modal-overlay": function () { closeRescheduleModal(); },
  "edit-request-modal-overlay": function () { closeEditRequestModal(); },
  "my-requests-modal-overlay": function () { closeMyRequestsModal(); },
  "notif-settings-modal-overlay": function () { closeNotifSettingsModal(); },
  "task-detail-modal-overlay": function () { closeTaskDetailModal(); },
  "todo-board-modal-overlay": function () { closeTodoBoardModal(); },
  "task-board-modal-overlay": function () { closeTaskBoardModal(); },
  "personal-task-modal-overlay": function () { closePersonalTaskModal(); },
  "task-export-modal-overlay": function () { closeTaskExportModal(); },
};

function _pushModalNav(overlayId) {
  if (_navRestoringCal) return;
  try { history.pushState({ __c2calnav: true, modal: overlayId }, ""); } catch (e) {}
  _openModalStack.push(overlayId);
}

window.addEventListener("popstate", function () {
  _navRestoringCal = true;
  // ล้าง entry ที่ modal ถูกปิดไปแล้วจริง (เช่นกดปุ่ม "ปิด"/✕ เอง ไม่ได้ผ่านปุ่ม Back) ออกจาก stack ก่อน
  // กันไม่ให้ค้างชี้ไปที่ modal ที่ไม่ได้เปิดอยู่แล้ว
  _openModalStack = _openModalStack.filter(function (id) {
    var el = document.getElementById(id);
    return el && el.style.display === "flex";
  });
  // ปิดแค่ modal ที่เปิดล่าสุด (ชั้นบนสุด) ทีละชั้นต่อการกด Back หนึ่งครั้ง
  var topId = _openModalStack.pop();
  if (topId && _MODAL_CLOSE_FN[topId]) {
    _MODAL_CLOSE_FN[topId]();
  }
  _navRestoringCal = false;
});

// ===== ล็อค scroll ของหน้าเว็บเบื้องหลังตอนมี modal เปิดอยู่ (แก้บั๊กที่ผู้ใช้แจ้ง: บนมือถือ ลาก swipe ใน
// เนื้อหา modal (เช่นฟอร์มเพิ่มงาน) จนเลื่อนสุดด้านล่างแล้ว ลากต่ออีก (overscroll) กลายเป็นลาก "หน้าเว็บ
// เบื้องหลัง" ที่ปกติควรถูกปิดทับด้วย modal (position:fixed) ให้เลื่อนตามไปด้วย ทำให้เห็นแถบเมนูด้านล่าง/
// พื้นที่ว่างของหน้าเว็บโผล่ทะลุออกมาให้เห็นแทน เพราะเดิมไม่เคยมีการล็อค scroll ของ body ไว้เลยตอนเปิด modal
// ใดๆ) - ใช้ MutationObserver เฝ้าดู attribute "style" ของทุก overlay element (id ลงท้ายด้วย -overlay) แทนการ
// ไปแก้ทีละฟังก์ชัน open/close (มีเกือบ 20 modal ในแอป) เพื่อให้ครอบคลุมทุก modal โดยอัตโนมัติ ไม่ต้องมาคอย
// เพิ่ม/แก้ทุกครั้งที่มี modal ใหม่เพิ่มเข้ามาทีหลังด้วย
// รอบแรกลองใช้ position:fixed ล็อค body (เทคนิคมาตรฐานกัน rubber-band ของ iOS Safari) แต่ผู้ใช้แจ้งบั๊กใหม่ว่า
// พอแตะ checkbox เลือกผู้ปฏิบัติงานในฟอร์มแก้ไขงานแล้ว modal เพี้ยน (เห็นปฏิทินโผล่ทะลุด้านบน+มีพื้นที่ว่างเยอะ
// ผิดปกติด้านล่าง) - สาเหตุคือ browser พยายาม auto-scroll ให้ element ที่เพิ่งได้ focus (checkbox ที่ซ่อนอยู่ใน
// label ของ .staff-checklist) มองเห็นได้ ไปชนกับ body ที่ถูกตรึงด้วย position:fixed อยู่ ทำให้เลย์เอาต์เพี้ยน -
// ผู้ใช้แอปนี้ใช้ Android Chrome เป็นหลัก ซึ่ง overflow:hidden เฉยๆ (ไม่ต้องใช้ position:fixed) ก็กันการ scroll
// ทะลุของ body ได้ดีอยู่แล้วโดยไม่ชนกับพฤติกรรม focus-scroll แบบนี้ เลยตัดกลไก position:fixed/จำ-คืนตำแหน่ง
// scroll ทิ้งไป เหลือแค่ toggle คลาสเฉยๆ (ดู .body-scroll-locked ใน style.css) =====
function _isAnyModalOpen() {
  var overlays = document.querySelectorAll('[id$="-overlay"]');
  for (var i = 0; i < overlays.length; i++) {
    if (getComputedStyle(overlays[i]).display !== 'none') return true;
  }
  return false;
}
function _refreshBodyScrollLock() {
  document.body.classList.toggle('body-scroll-locked', _isAnyModalOpen());
}
function _initBodyScrollLockObserver() {
  var overlays = document.querySelectorAll('[id$="-overlay"]');
  if (!window.MutationObserver || !overlays.length) return;
  var observer = new MutationObserver(function () { _refreshBodyScrollLock(); });
  overlays.forEach(function (el) {
    observer.observe(el, { attributes: true, attributeFilter: ['style'] });
  });
}

var TOKEN_KEY = 'c2tech_token';
var NAME_KEY = 'c2tech_admin_name';
var ROLE_KEY = 'c2tech_role';
var ACCOUNT_ID_KEY = 'c2tech_account_id';
var calendarInstance = null;

// ===== Phase: ปุ่มสลับธีม Light/Dark เอง (นอกเหนือจากปรับตาม prefers-color-scheme อัตโนมัติ) =====
// index.html มี inline script เล็กๆ ก่อนโหลด style.css คอยเซ็ต data-theme จาก localStorage ให้ตั้งแต่ต้น
// (กัน "จอกระพริบ" สีผิดตอนโหลดหน้าแรกก่อนสคริปต์นี้มาถึง) ฟังก์ชันด้านล่างนี้ใช้ตอนกดปุ่มสลับเองอีกที
var THEME_PREF_KEY = 'c2tech_calendar_theme_pref';
var THEME_CYCLE = ['system', 'light', 'dark'];
var THEME_META = {
  system: { icon: '🌓', label: 'ธีม: ตามเครื่อง' },
  light: { icon: '☀️', label: 'ธีม: สว่าง' },
  dark: { icon: '🌙', label: 'ธีม: มืด' }
};
function getThemePref() {
  var v = localStorage.getItem(THEME_PREF_KEY);
  return (v === 'light' || v === 'dark') ? v : 'system';
}
function applyThemePref(pref) {
  if (pref === 'light' || pref === 'dark') {
    document.documentElement.setAttribute('data-theme', pref);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  var btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.textContent = THEME_META[pref].icon;
    btn.title = THEME_META[pref].label + ' (กดเพื่อเปลี่ยน)';
  }
}
function cycleTheme() {
  var current = getThemePref();
  var next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  localStorage.setItem(THEME_PREF_KEY, next);
  applyThemePref(next);
  Toast.fire({ icon: 'success', title: THEME_META[next].label });
}
function getThemeMenuLabel() {
  var pref = getThemePref();
  return THEME_META[pref].icon + ' ' + THEME_META[pref].label + ' (กดเพื่อเปลี่ยน)';
}

var Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

// ===== action ที่เรียกผ่าน Cloud Function ตรงๆ (เขียนข้อมูล + ที่มีเรื่อง permission ซับซ้อน) =====
var CLOUD_FUNCTION_ACTIONS = [
  'login', 'validateSessionCallable', 'addTask', 'updateTask', 'deleteTask',
  'getStaffList', 'getPublicStaffList', 'addStaff', 'updateStaff', 'resetPassword', 'setStaffActive', 'deleteStaff',
  'addHoliday', 'deleteHoliday',
  'requestDeleteTask', 'requestRescheduleTask', 'approveChangeRequest', 'rejectChangeRequest',
  'getMyProfile', 'updateOwnProfile', 'changeOwnPassword', 'markNotificationRead',
  'addTaskTag', 'createPersonalTask', 'updatePersonalTaskStatus', 'updatePersonalTask', 'deletePersonalTask',
  'toggleChecklistItem', 'registerTaskAttachment', 'getCompanyTaskSummary', 'exportTaskReport',
  'registerPushToken', 'getNotificationPrefs', 'updateNotificationPrefs', 'sendTestNotification',
  'addTaskComment', 'addPersonalTaskComment',
  'editTaskComment', 'deleteTaskComment', 'editPersonalTaskComment', 'deletePersonalTaskComment'
];

// ===== callApi: ยังใช้ชื่อ/รูปแบบเดิมทุกจุดที่เรียกในไฟล์นี้ แค่เปลี่ยนปลายทางข้างในเป็น Firebase =====
// action ที่อยู่ใน CLOUD_FUNCTION_ACTIONS -> ยิงผ่าน Cloud Function เหมือน Apps Script เดิม
// action อื่นๆ (getCalendarEvents, getHolidays, getUndatedTasks, getMyChangeRequests, getPendingChangeRequests, getTaskDetail)
//   -> จะทำเป็นอ่านตรงจาก Firestore แทนในรอบ 6.2 (ยังไม่ทำในรอบนี้)
function callApi(action, params) {
  params = params || {};

  if (CLOUD_FUNCTION_ACTIONS.indexOf(action) !== -1) {
    var fn = fbFunctions.httpsCallable(action);
    return fn(params).then(function (result) {
      return result.data;
    }).catch(function (err) {
      // ทำให้หน้าตา error คล้ายเดิม (โค้ดส่วนอื่นในไฟล์นี้คาดหวัง err.message)
      var e = new Error(err.message || 'เกิดข้อผิดพลาด');
      throw e;
    });
  }

  if (action === 'getTaskDetail') return firestoreGetTaskDetail(params);
  if (action === 'getUndatedTasks') return firestoreGetUndatedTasks();
  if (action === 'getMyChangeRequests') return firestoreGetMyChangeRequests();
  if (action === 'getPendingChangeRequests') return firestoreGetPendingChangeRequests();

  return Promise.resolve({ success: false, message: 'ไม่รู้จัก action: ' + action });
}

// ===== อ่านงาน 1 อันตรงจาก Firestore (แทนที่ getTaskDetail เดิม - ใช้ตอนเปิดฟอร์มแก้ไขงาน) =====
async function firestoreGetTaskDetail(params) {
  try {
    var doc = await fbDb.collection('tasks').doc(params.taskId).get();
    if (!doc.exists) return { success: false, message: 'ไม่พบงานนี้' };
    var row = doc.data();
    return {
      success: true,
      task: {
        taskId: doc.id,
        taskName: row.taskName,
        startDateTime: firestoreDateToIso(row.startDateTime),
        endDateTime: firestoreDateToIso(row.endDateTime),
        isAllDay: row.isAllDay,
        locationName: row.locationName,
        lat: row.lat,
        lng: row.lng,
        status: row.status,
        detail: row.detail,
        taskType: row.taskType,
        isUndated: row.isUndated,
        staffIds: row.staffIds || [],
        reminderMinutes: (typeof row.reminderMinutes === 'number') ? row.reminderMinutes : null
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function firestoreDateToIso(val) {
  var d = firestoreDateToJs(val);
  return d ? d.toISOString() : '';
}

// ===== อ่านรายการงานไม่ระบุวันที่ตรงจาก Firestore (แทนที่ getUndatedTasks เดิม - ใช้ทำ To-Do List) =====
async function firestoreGetUndatedTasks() {
  try {
    var snapshot = await fbDb.collection('tasks').where('isUndated', '==', true).get();
    var tasks = [];
    snapshot.docs.forEach(function (doc) {
      var row = doc.data();
      if (row.status === 'ยกเลิกงาน') return;
      var staff = (row.staffIds || []).map(function (id) {
        var s = staffMapCache[id];
        return s ? { name: s.firstName + ' ' + s.lastName, color: s.colorHex } : null;
      }).filter(function (s) { return s; });
      tasks.push({
        taskId: doc.id, taskName: row.taskName, detail: row.detail, taskType: row.taskType, staff: staff,
        createdBy: row.createdBy || '', staffIds: row.staffIds || [],
        createdAt: firestoreDateToIso(row.createdAt)
      });
    });
    // งานที่เพิ่มล่าสุดอยู่บนสุด (เรียงตาม createdAt ใหม่ -> เก่า) — งานเก่าที่ไม่มี createdAt (ข้อมูลเก่าก่อนมีฟิลด์นี้)
    // จะตกไปอยู่ท้ายสุดแทนที่จะพังลำดับ
    tasks.sort(function (a, b) {
      return (b.createdAt || '') < (a.createdAt || '') ? -1 : (b.createdAt || '') > (a.createdAt || '') ? 1 : 0;
    });
    return { success: true, tasks: tasks };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ===== อ่านคำขอของฉันตรงจาก Firestore (ใช้ ACCOUNT_ID_KEY ที่เก็บไว้ตอน login แทนการยิงถาม server ว่า token คือใคร) =====
async function firestoreGetMyChangeRequests() {
  try {
    var myId = localStorage.getItem(ACCOUNT_ID_KEY);
    var snapshot = await fbDb.collection('changeRequests').where('requestedBy', '==', myId).get();
    var requests = await buildChangeRequestListFromDocs(snapshot.docs);
    return { success: true, requests: requests };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ===== อ่านคำขอที่รออนุมัติทั้งหมดตรงจาก Firestore (สำหรับ Admin) =====
async function firestoreGetPendingChangeRequests() {
  try {
    var snapshot = await fbDb.collection('changeRequests').where('status', '==', 'pending').get();
    var requests = await buildChangeRequestListFromDocs(snapshot.docs);
    return { success: true, requests: requests };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ===== ฟังก์ชันกลาง: join ชื่องาน + ชื่อผู้ขอ ให้คำขอแต่ละรายการ (แทนที่ buildChangeRequestList เดิมของ ChangeRequestData.gs) =====
async function buildChangeRequestListFromDocs(docs) {
  var results = [];
  for (var i = 0; i < docs.length; i++) {
    var row = docs[i].data();
    var taskName = '(ไม่พบงานนี้แล้ว)';
    try {
      var taskDoc = await fbDb.collection('tasks').doc(row.taskId).get();
      if (taskDoc.exists) taskName = taskDoc.data().taskName;
    } catch (e) { /* ไม่พบงาน ปล่อยผ่านใช้ค่า default */ }

    var requesterName = '-';
    var s = staffMapCache[row.requestedBy];
    if (s) requesterName = s.firstName + ' ' + s.lastName;

    results.push({
      requestId: docs[i].id,
      taskId: row.taskId,
      taskName: taskName,
      requestType: row.requestType,
      requestedBy: row.requestedBy,
      requestedByName: requesterName,
      requestedAt: firestoreDateToIso(row.requestedAt),
      status: row.status,
      newStartDateTime: firestoreDateToIso(row.newStartDateTime),
      newEndDateTime: firestoreDateToIso(row.newEndDateTime),
      reason: row.reason || ''
    });
  }
  results.sort(function (a, b) { return new Date(b.requestedAt) - new Date(a.requestedAt); });
  return results;
}

// ===== ตัวช่วยแสดงสถานะ loading บนปุ่ม กันกดซ้ำและให้รู้ว่ากดสำเร็จ =====
// ===== สลับโชว์/ซ่อนรหัสผ่านในช่อง input (กดปุ่มตา) =====
function togglePasswordVisibility(inputId, btn) {
  var input = document.getElementById(inputId);
  var showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? '👁' : '🙈';
}

function setButtonLoading(btn, loading, loadingText) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + (loadingText || 'กำลังบันทึก...');
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
  }
}

// ===== ซ่อน splash screen ตอนปฏิทินโหลดข้อมูลรอบแรกเสร็จ =====
function hidePageLoading() {
  var el = document.getElementById('page-loading');
  if (!el) return;
  cancelSlowLoadingHint(); // โหลดเสร็จแล้วไม่ต้องโชว์ข้อความเตือนเน็ตช้าอีก (เผื่อ timer ยังไม่ทันยิง)
  el.classList.add('fade-out');
  setTimeout(function () { el.style.display = 'none'; }, 400);
}

// ===== ข้อความเตือน "เน็ตช้ากว่าปกติ" ตอนรอ splash - ไม่ได้แก้ปัญหาที่ต้นเหตุ (Firestore/เน็ตช้า) แต่กัน
// ผู้ใช้เข้าใจผิดว่าแอปค้าง ถ้ารอเกิน SLOW_LOADING_HINT_MS แล้ว splash ยังไม่ซ่อน (ยังไม่ได้ข้อมูลชุดแรก
// จาก Firestore) จะโชว์ข้อความนี้ขึ้นมาแทน ยกเลิก timer ทันทีที่ hidePageLoading() ถูกเรียกจริง =====
var SLOW_LOADING_HINT_MS = 7000;
var _slowLoadingHintTimer = null;
function startSlowLoadingHintTimer() {
  _slowLoadingHintTimer = setTimeout(function () {
    var hint = document.getElementById('page-loading-slow-hint');
    if (hint) {
      // 2 ขั้นตอนเหมือน openFabSpeedDial/showInAppBanner - เปิด display ก่อน บังคับ reflow แล้วค่อย fade-in
      // ในเฟรมถัดไป ไม่งั้น fade-in จะไม่มี effect เลย (กระโดดไปทึบทันที) เพราะเพิ่งโผล่จาก display:none
      hint.classList.add('open');
      void hint.offsetHeight;
      requestAnimationFrame(function () { hint.classList.add('show'); });
    }
  }, SLOW_LOADING_HINT_MS);
}
function cancelSlowLoadingHint() {
  if (_slowLoadingHintTimer) {
    clearTimeout(_slowLoadingHintTimer);
    _slowLoadingHintTimer = null;
  }
  var hint = document.getElementById('page-loading-slow-hint');
  if (hint) { hint.classList.remove('show'); hint.classList.remove('open'); }
}

var holidaysCache = [];

// ===== Local Cache (เก็บในเบราว์เซอร์) แบบ Stale-While-Revalidate =====
// ใช้เฉพาะรายชื่อผู้ปฏิบัติงาน (accounts อ่านตรงจาก Firestore ไม่ได้ ต้องผ่าน Cloud Function เท่านั้น)
// ส่วนวันหยุด/ปฏิทินงาน เปลี่ยนไปใช้ real-time listener ของ Firestore แทนแล้ว (เร็วกว่าและไม่ต้องมี local cache อีก)
var LOCAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 ชม. - หมดอายุสำรอง กันโชว์ข้อมูลเก่าเกินไปถ้าเน็ตมีปัญหานาน
var STAFF_CACHE_KEY = 'c2tech_cache_staff_public';

function getLocalCache(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > LOCAL_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (e) {
    return null;
  }
}

function setLocalCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data: data, timestamp: Date.now() }));
  } catch (e) {
    // localStorage เต็มหรือใช้งานไม่ได้ - ปล่อยผ่านเงียบๆ ไม่กระทบการทำงานหลัก
  }
}

// ===== ประเภทงาน -> สี (เดิมฝั่ง server เป็นคน map ให้ ตอนนี้ต้องทำเองฝั่ง client) =====
var TASK_TYPE_COLORS = { meeting: '#FCE38A', onsite: '#FFB48A', event: '#C9A6FF', leave: '#E5E7EB' };
function getTaskTypeColor(t) { return TASK_TYPE_COLORS[t] || '#cccccc'; }
function getTaskTypeTextColor(t) { return getContrastTextColor(getTaskTypeColor(t)); }

// ===== Phase: การ์ดประเภทงาน (ไซด์บาร์ขวา) กดเพื่อกรองปฏิทิน — กดซ้ำ/กด "ล้างตัวกรอง" เพื่อยกเลิก =====
var activeTaskTypeFilter = null;
function setTaskTypeFilter(type) {
  activeTaskTypeFilter = (activeTaskTypeFilter === type) ? null : type;

  // #type-legend-mobile คือแถบชิปกรองบนมือถือ (เหนือปฏิทิน) - ใช้ data-type/class เดียวกับ #type-legend
  // ฝั่ง PC จึงอัปเดตสถานะ active/dimmed พร้อมกันในลูปเดียวได้เลย ไม่ต้องแยกฟังก์ชัน
  document.querySelectorAll('#type-legend .legend-item, #type-legend-mobile .legend-item').forEach(function (el) {
    var isThis = el.getAttribute('data-type') === activeTaskTypeFilter;
    el.classList.toggle('active', !!activeTaskTypeFilter && isThis);
    el.classList.toggle('dimmed', !!activeTaskTypeFilter && !isThis);
  });
  document.getElementById('type-filter-reset').classList.toggle('show', !!activeTaskTypeFilter);

  // สั่งให้ FullCalendar ประเมิน eventClassNames ใหม่กับ event ที่กำลังโชว์อยู่ (ไม่โหลดข้อมูลใหม่จากเซิร์ฟเวอร์)
  if (calendarInstance) calendarInstance.render();
}

// นับจำนวนงานแต่ละประเภทเฉพาะ "ช่วงที่ปฏิทินกำลังแสดงอยู่" (เดือน/สัปดาห์/วัน/ปี ตามมุมมองปัจจุบัน) แล้วเติมท้าย
// ชื่อประเภทงานในไซด์บาร์ — ใช้ event.start เทียบกับ view.currentStart/currentEnd แบบเดียวกับที่ renderMonthHolidayList
// ใช้เทียบวันหยุด เพื่อให้ความหมาย "ในเดือนนั้น" ตรงกันทั้งแอป
function updateLegendCounts() {
  if (!calendarInstance) return;
  var view = calendarInstance.view;
  var start = view.currentStart, end = view.currentEnd;
  var counts = { meeting: 0, onsite: 0, event: 0, leave: 0 };
  calendarInstance.getEvents().forEach(function (ev) {
    if (ev.extendedProps.isHoliday) return;
    var t = ev.extendedProps.taskType;
    if (!counts.hasOwnProperty(t)) return;
    if (!ev.start || ev.start < start || ev.start >= end) return;
    counts[t]++;
  });
  // เติมเลขทั้งฝั่ง sidebar เดสก์ท็อป (#type-legend) และแถบชิปมือถือ (#type-legend-mobile) พร้อมกัน - เดิมอัปเดต
  // แค่ฝั่ง PC ทำให้ชิปมือถือไม่มีตัวเลขกำกับเลย (ผู้ใช้แจ้งว่าอยากได้ตัวเลขบนชิปมือถือด้วย)
  document.querySelectorAll('#type-legend .legend-item, #type-legend-mobile .legend-item').forEach(function (el) {
    var t = el.getAttribute('data-type');
    var countEl = el.querySelector('.legend-count');
    if (countEl) countEl.textContent = counts[t] || 0;
  });
}

// ===== จับคู่ staffId -> ข้อมูลคน (เดิมฝั่ง server join ให้ ตอนนี้ทำเองฝั่ง client จาก staffMapCache) =====
var staffMapCache = {};
var lastRenderedEvents = [];

function firestoreDateToJs(val) {
  // แก้บั๊ก "Invalid Date": Firestore Timestamp ที่วิ่งผ่าน Cloud Function callable protocol โดยไม่ได้แปลง
  // เป็น ISO string ก่อนส่งออก (ทำถูกแล้วในฟังก์ชันปัจจุบันส่วนใหญ่ แต่กันเผื่อจุดอื่นในอนาคตพลาด) จะกลาย
  // เป็น plain object {_seconds, _nanoseconds} ที่ไม่มี .toDate() แล้ว new Date(val) เจอ object แบบนี้จะ
  // แปลงผ่าน toString() กลายเป็น "[object Object]" แล้วได้ Invalid Date กลับมาแทน จับ shape นี้ไว้ก่อนเลย
  if (!val) return null;
  if (val.toDate) return val.toDate(); // Firestore Timestamp instance จริง (client SDK อ่านตรง)
  if (typeof val === 'object' && (val._seconds !== undefined || val.seconds !== undefined)) {
    var secs = val._seconds !== undefined ? val._seconds : val.seconds;
    return new Date(secs * 1000);
  }
  var d = new Date(val);
  return isNaN(d.getTime()) ? null : d; // parse ไม่ออกจริงๆ คืน null ดีกว่าคืน Invalid Date object
  // (ปลายทางที่ใช้ค่านี้ เช่น fmtPtbDate ต่างเช็ค falsy อยู่แล้ว จะได้โชว์ "-" แทนข้อความ "Invalid Date")
}

// ===== แปลงเอกสารงานจาก Firestore เป็น event รูปแบบ FullCalendar (แทนที่ buildCalendarEvents เดิมของ Data.gs) =====
function buildEventsFromTaskDocs(docs) {
  var events = [];
  docs.forEach(function (docSnap) {
    var row = docSnap.data();
    if (row.status === 'ยกเลิกงาน') return; // งานที่ถูกลบแบบ soft delete ไม่โชว์
    if (row.isUndated) return; // งานไม่ระบุวันที่ ไปโชว์ที่ To-Do List แทน
    if (!row.startDateTime) return;

    var assignedStaff = (row.staffIds || []).map(function (id) {
      var s = staffMapCache[id];
      return s ? { name: s.firstName + ' ' + s.lastName, color: s.colorHex } : null;
    }).filter(function (s) { return s; });

    var start = firestoreDateToJs(row.startDateTime);
    var end = firestoreDateToJs(row.endDateTime) || start;
    var displayEnd = end;
    if (row.isAllDay) {
      displayEnd = new Date(end.getTime() + 86400000); // FullCalendar ถือ end แบบ exclusive ต้อง +1 วัน
    }

    events.push({
      id: docSnap.id,
      title: row.taskName,
      start: start.toISOString(),
      end: displayEnd.toISOString(),
      allDay: row.isAllDay,
      color: getTaskTypeColor(row.taskType),
      textColor: getTaskTypeTextColor(row.taskType),
      extendedProps: {
        location: row.locationName,
        lat: row.lat,
        lng: row.lng,
        status: row.status,
        detail: row.detail,
        taskType: row.taskType,
        createdBy: row.createdBy,
        staffIds: row.staffIds || [],
        staff: assignedStaff
      }
    });
  });
  return events;
}

// ===== ฟังการเปลี่ยนแปลงงานแบบ real-time (แทนที่ loadPublicEvents/loadAdminEvents เดิม) =====
// แก้เรื่องความปลอดภัย: เดิมอ่านได้ทุกคนเสมอแม้ไม่ login (ตาม Security Rules เดิม) เปลี่ยนเป็นต้อง login
// ก่อนแล้วเท่านั้น (allow read: if request.auth != null;) - เรียกฟังก์ชันนี้ได้ก็ต่อเมื่อผ่าน
// startAuthenticatedApp() แล้ว คืนค่า unsubscribe function กลับไปเก็บไว้ ให้ doLogout() เรียกปิด
// listener ทิ้งได้ตอน logout (กันข้อมูลงานเก่าค้างอยู่หลัง logout)
var lastTaskDocs = [];
var _unsubTasks = null;
var _unsubHolidays = null;

function setupTasksRealtimeListener() {
  return fbDb.collection('tasks').onSnapshot(function (snapshot) {
    lastTaskDocs = snapshot.docs;
    lastRenderedEvents = buildEventsFromTaskDocs(snapshot.docs);
    renderCalendar({ success: true, events: lastRenderedEvents });
  }, function (err) {
    console.error('ฟังการเปลี่ยนแปลงงานไม่สำเร็จ', err);
  });
}

// ===== ฟังการเปลี่ยนแปลงวันหยุดแบบ real-time (แทนที่ loadHolidays เดิม) =====
function setupHolidaysRealtimeListener() {
  return fbDb.collection('holidays').onSnapshot(function (snapshot) {
    holidaysCache = snapshot.docs.map(function (d) {
      var row = d.data();
      return { holidayId: d.id, type: row.type, value: row.value, name: row.name };
    });
    refreshCalendarDayCells(); // dayCellDidMount ไม่รันซ้ำเอง ต้องบังคับสร้างปฏิทินใหม่
  }, function (err) {
    console.error('ฟังการเปลี่ยนแปลงวันหยุดไม่สำเร็จ', err);
  });
}

// ===== บังคับสร้างปฏิทินใหม่ (ใช้ตอนวันหยุด/ชื่อผู้ปฏิบัติงานเปลี่ยน ที่ dayCellDidMount ไม่รันซ้ำเอง) =====
// สร้าง event ใหม่จาก lastTaskDocs + staffMapCache ล่าสุดเสมอ (ไม่ใช้ lastRenderedEvents เก่าที่อาจสร้างไว้ตอนยังไม่มีข้อมูลสี)
function refreshCalendarDayCells() {
  if (!calendarInstance) return;
  lastRenderedEvents = buildEventsFromTaskDocs(lastTaskDocs);
  calendarInstance.destroy();
  calendarInstance = null;
  renderCalendar({ success: true, events: lastRenderedEvents });
}

// แก้เรื่องความปลอดภัย: บังคับ login ก่อนถึงจะเข้าดูปฏิทินได้เสมอ (เดิมทุกคนที่มีลิงก์ดูได้แม้ไม่ login -
// เปลี่ยนตาม request ของผู้ใช้เพื่อกันบุคคลภายนอกเข้าถึงข้อมูลงาน/วันหยุด) checkExistingSession() ด้านล่างเป็น
// คนตัดสินใจว่าจะเข้าแอปเลย (มี session เดิมที่ยัง valid) หรือต้องโชว์หน้าบังคับ login ก่อน - ตัว
// setupHolidaysRealtimeListener()/setupTasksRealtimeListener()/loadMemberSidebar()/loadTodoList() ที่เคย
// เรียกตรงนี้ทันที ย้ายไปเรียกใน startAuthenticatedApp() แทน (เรียกได้ก็ต่อเมื่อ login แล้วเท่านั้น เพราะ
// Firestore Security Rules ของ tasks/holidays เปลี่ยนเป็น allow read: if request.auth != null; แล้ว)
window.onload = function () {
  // ปุ่มสลับธีมยังไม่มีตอน inline script ใน <head> เซ็ต data-theme ไว้ตั้งแต่ก่อนหน้านี้ (กันจอกระพริบ)
  // ต้อง sync ไอคอน/ label ของปุ่มให้ตรงกับค่าที่จำไว้อีกทีตอนนี้ ที่ DOM ของปุ่มพร้อมแล้ว
  applyThemePref(getThemePref());
  startSlowLoadingHintTimer();
  checkExistingSession();
  _initBodyScrollLockObserver();

  ['username', 'password'].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doLogin();
    });
    el.addEventListener('input', function () {
      document.getElementById('login-error-text').style.display = 'none';
    });
  });
};

// เก็บชื่อฟังก์ชันไว้ให้จุดที่เรียกใช้เดิมยังทำงานได้ (คืน Promise เปล่าๆ) แต่ไม่ต้องทำอะไรจริงแล้ว
// เพราะ setupHolidaysRealtimeListener() อัปเดต holidaysCache + รีเฟรชปฏิทินอัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยนอยู่แล้ว
function loadHolidays() {
  return Promise.resolve({ success: true, holidays: holidaysCache });
}

var WEEKDAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function renderMonthHolidayList(start, end) {
  var container = document.getElementById('month-holiday-list');
  if (!container) return;

  var matched = holidaysCache
    .filter(function (h) { return h.type === 'date'; })
    .filter(function (h) {
      var hd = new Date(h.value);
      return hd >= start && hd < end;
    })
    .sort(function (a, b) { return a.value < b.value ? -1 : 1; });

  if (matched.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-faint)">ไม่มีวันหยุดในเดือนนี้</p>';
    return;
  }
  container.innerHTML = '';
  matched.forEach(function (h) {
    var d = new Date(h.value);
    var row = document.createElement('div');
    row.className = 'month-holiday-item';
    row.innerHTML =
      '<span class="mh-date">' + d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + '</span>' +
      '<span class="mh-name">' + h.name + '</span>';
    container.appendChild(row);
  });
}

function formatEventDateRange(event) {
  var start = event.start;
  var end = event.end;
  var opts = { day: 'numeric', month: 'short' };
  var timeOpts = { hour: '2-digit', minute: '2-digit' };

  if (event.allDay) {
    // FullCalendar เก็บ end แบบ exclusive ต้อง -1 วัน ให้ตรงกับวันที่โชว์จริง
    var displayEnd = end ? new Date(end.getTime() - 86400000) : start;
    var sameDay = displayEnd.toDateString() === start.toDateString();
    if (sameDay) return start.toLocaleDateString('th-TH', opts);
    return start.toLocaleDateString('th-TH', opts) + ' - ' + displayEnd.toLocaleDateString('th-TH', opts);
  }

  if (!end) return start.toLocaleDateString('th-TH', opts) + ' ' + start.toLocaleTimeString('th-TH', timeOpts);

  var sameDayTimed = start.toDateString() === end.toDateString();
  if (sameDayTimed) {
    return start.toLocaleDateString('th-TH', opts) + ' ' + start.toLocaleTimeString('th-TH', timeOpts) +
      ' - ' + end.toLocaleTimeString('th-TH', timeOpts);
  }
  return start.toLocaleDateString('th-TH', opts) + ' ' + start.toLocaleTimeString('th-TH', timeOpts) +
    ' - ' + end.toLocaleDateString('th-TH', opts) + ' ' + end.toLocaleTimeString('th-TH', timeOpts);
}

function getOverlappingHolidays(startDateTime, endDateTime) {
  var start = new Date(startDateTime); start.setHours(0, 0, 0, 0);
  var end = new Date(endDateTime); end.setHours(0, 0, 0, 0);
  var matched = [];

  holidaysCache.forEach(function (h) {
    if (h.type === 'date') {
      var hd = new Date(h.value); hd.setHours(0, 0, 0, 0);
      if (hd >= start && hd <= end) matched.push(h);
    } else {
      var cursor = new Date(start);
      var found = false;
      while (cursor <= end && !found) {
        if (cursor.getDay() === h.value) found = true;
        cursor.setDate(cursor.getDate() + 1);
      }
      if (found) matched.push(h);
    }
  });

  return matched;
}

function checkExistingSession() {
  var token = localStorage.getItem(TOKEN_KEY);
  var name = localStorage.getItem(NAME_KEY);
  if (!token) { hidePageLoading(); showAuthGate(); return; }

  callApi('validateSessionCallable', { token: token }).then(function (result) {
    if (!result.valid) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NAME_KEY);
      hidePageLoading();
      showAuthGate();
      return;
    }
    localStorage.setItem(ROLE_KEY, result.role);
    localStorage.setItem(ACCOUNT_ID_KEY, result.accountId);

    // มี session ของแอป (Firestore sessions collection) ที่ยัง valid แล้ว แต่ต้องรอ Firebase Auth
    // (fbAuth) เองด้วยว่า restore สถานะ login กลับมาจริงหรือยัง ก่อนจะเริ่มอ่าน Firestore (tasks/holidays)
    // เพราะ Security Rules เช็ค request.auth != null - ปกติ Firebase SDK จะ restore ให้เองอัตโนมัติจาก
    // ข้อมูลที่จำไว้ในเครื่อง (indexedDB) แต่เป็นการทำงานแบบ async ไม่ทันตอน onload เรียกเสมอไป ถ้าเริ่ม
    // listener ก่อน auth restore เสร็จ จะโดน permission-denied ทันที (และ onSnapshot ไม่ retry เองด้วย)
    var unsub = fbAuth.onAuthStateChanged(function (user) {
      unsub();
      if (user) {
        startAuthenticatedApp(name, result.role);
      } else {
        // มี session ของแอปอยู่ (ยังไม่หมดอายุ) แต่ Firebase Auth ในเบราว์เซอร์หลุดไปแล้ว (เช่น ล้าง
        // site data/เปลี่ยนเครื่อง) ถือว่าต้อง login ใหม่เพื่อความปลอดภัย ไม่ปล่อยให้เข้าแบบครึ่งๆ กลางๆ
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(NAME_KEY);
        hidePageLoading();
        showAuthGate();
      }
    });
  }).catch(function (err) {
    console.error('ตรวจสอบ session ไม่สำเร็จ', err);
    hidePageLoading();
    showAuthGate();
  });
}

// ===== บังคับ login ก่อนเข้าใช้งาน (auth gate) =====
// ใช้ modal login เดิมตัวเดียวกัน (#login-modal-overlay) แต่เปิดแบบ "บังคับ" - ซ่อนปุ่มปิด (✕) และห้าม
// ปิดผ่านทางอื่น (ดู closeLoginModal ด้านล่างที่เช็ค class นี้) จนกว่าจะ login สำเร็จจริงเท่านั้น ไม่ push
// เข้า browser history stack (_pushModalNav) เหมือน modal ทั่วไป เพราะไม่ต้องการให้ปุ่ม Back เผลอปิดได้
var _authGateStarted = false;

function showAuthGate() {
  var overlay = document.getElementById('login-modal-overlay');
  overlay.classList.add('login-forced');
  overlay.style.display = 'flex';
  document.getElementById('login-close').style.display = 'none';
  var sub = document.querySelector('#login-box p.sub');
  if (sub) sub.textContent = 'กรุณาเข้าสู่ระบบเพื่อเข้าใช้งาน C2 Calendar';
  document.getElementById('login-error-text').style.display = 'none';
  setTimeout(function () {
    var el = document.getElementById('username');
    if (el) el.focus();
  }, 50);
}

function hideAuthGate() {
  var overlay = document.getElementById('login-modal-overlay');
  overlay.classList.remove('login-forced');
  overlay.style.display = 'none';
  document.getElementById('login-close').style.display = '';
  var sub = document.querySelector('#login-box p.sub');
  if (sub) sub.textContent = 'สำหรับจัดการงานต่างๆ';
}

// เริ่มโหลดข้อมูล/แสดงแอปจริง - เรียกได้ก็ต่อเมื่อยืนยันแล้วว่า login สำเร็จ (ทั้ง session ของแอปเอง และ
// Firebase Auth) เท่านั้น กันเรียกซ้ำถ้ามีหลาย path เรียกเข้ามาพร้อมกัน (checkExistingSession + doLogin)
function startAuthenticatedApp(name, role) {
  if (_authGateStarted) return;
  _authGateStarted = true;
  hideAuthGate();
  enterAdminMode(name, role);
  _unsubHolidays = setupHolidaysRealtimeListener();
  _unsubTasks = setupTasksRealtimeListener();
  loadMemberSidebar();
  loadTodoList();
}

// ปิด listener/ข้อมูลทั้งหมดที่โหลดไว้ตอน login (เรียกตอน logout) - กันไม่ให้ข้อมูลงาน/วันหยุดเก่าที่เคย
// โหลดไว้ค้างอยู่ในปฏิทินให้เห็นหลัง logout ไปแล้ว
function teardownAuthenticatedListeners() {
  if (_unsubTasks) { _unsubTasks(); _unsubTasks = null; }
  if (_unsubHolidays) { _unsubHolidays(); _unsubHolidays = null; }
  if (calendarInstance) { calendarInstance.destroy(); calendarInstance = null; }
  lastTaskDocs = [];
  lastRenderedEvents = [];
  holidaysCache = [];
  _authGateStarted = false;
}

function openLoginModal() {
  document.getElementById('login-modal-overlay').style.display = 'flex';
  document.getElementById('login-error-text').style.display = 'none';
  document.getElementById('username').focus();
  _pushModalNav('login-modal-overlay');
}
function closeLoginModal() {
  var overlay = document.getElementById('login-modal-overlay');
  // บังคับ login ค้างอยู่ (auth gate) - ห้ามปิดจนกว่าจะ login สำเร็จ ไม่ว่าจะเรียกมาจากทางไหนก็ตาม
  if (overlay.classList.contains('login-forced')) return;
  overlay.style.display = 'none';
  document.getElementById('login-error-text').style.display = 'none';
}

function showLoginError(message) {
  var errorText = document.getElementById('login-error-text');
  errorText.textContent = message;
  errorText.style.display = 'block';

  var box = document.getElementById('login-box');
  box.classList.remove('shake');
  // trick บังคับ reflow ให้ animation เล่นซ้ำได้ถ้ากดผิดติดกันหลายครั้ง
  void box.offsetWidth;
  box.classList.add('shake');
  setTimeout(function () { box.classList.remove('shake'); }, 450);
}

function doLogin() {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value;

  if (!username || !password) {
    showLoginError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    return;
  }

  var btn = document.getElementById('login-submit-btn');
  setButtonLoading(btn, true, 'กำลังเข้าสู่ระบบ...');

  callApi('login', { username: username, password: password }).then(function (result) {
    if (result.success) {
      // ขั้นตอนสำคัญ: เอา Firebase Custom Token ไปยื่นให้ Firebase Auth
      // เพื่อให้ Security Rules มองเห็นว่า "login อยู่แล้ว" ตอนอ่านข้อมูลแบบ real-time (Phase 6.2)
      return fbAuth.signInWithCustomToken(result.firebaseCustomToken).then(function () {
        localStorage.setItem(TOKEN_KEY, result.token);
        localStorage.setItem(NAME_KEY, result.fullName);
        localStorage.setItem(ROLE_KEY, result.role);
        localStorage.setItem(ACCOUNT_ID_KEY, result.accountId);
        startAuthenticatedApp(result.fullName, result.role);
        Toast.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ' + result.fullName });
      });
    } else {
      showLoginError(result.message);
    }
  }).catch(function (err) {
    showLoginError('เชื่อมต่อ API ไม่ได้: ' + err.message);
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function doLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(ACCOUNT_ID_KEY);
  fbAuth.signOut();
  exitAdminMode();
  teardownAuthenticatedListeners();
  showAuthGate();
  Toast.fire({ icon: 'info', title: 'ออกจากระบบแล้ว' });
}

function enterAdminMode(fullName, role) {
  document.getElementById('login-icon-btn').style.display = 'none';
  document.getElementById('admin-chip').style.display = 'flex';
  document.getElementById('admin-name').textContent = fullName || 'แอดมิน';
  var isAdmin = role === 'admin';
  var isStaff = role === 'staff';
  var isAdminOrCeo = role === 'admin' || role === 'ceo';
  document.getElementById('staff-menu-btn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('holiday-menu-btn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('export-excel-btn').style.display = isAdminOrCeo ? 'inline-block' : 'none';
  document.getElementById('dashboard-btn').style.display = isAdminOrCeo ? 'inline-block' : 'none';
  document.getElementById('notif-bell-btn').style.display = 'inline-flex'; // ทุก role ที่ login แล้วเห็นกระดิ่งเดียวกันหมด
  document.getElementById('task-undated-row').style.display = (isAdmin || isStaff || role === 'ceo') ? 'flex' : 'none';
  document.getElementById('taskboard-sidebar-section').style.display = 'block'; // ทุก role ที่ login แล้วมี Task Board ของตัวเองได้
  // แก้บั๊ก: เจอ error ของ Firebase Messaging (ลงทะเบียน default service worker ไม่สำเร็จ) หลุดไปโผล่เป็น
  // ข้อความ error ตอน login ทั้งที่ setupPushNotifications() ควร fail แบบเงียบๆ เท่านั้น (ตามคอมเมนต์ในฟังก์ชัน
  // นั้น) ต้นเหตุคือ enterAdminMode() ถูกเรียกจากใน .then() ของ doLogin() ตรงๆ เลยมีโอกาสที่ error จากส่วนนี้
  // ไหลย้อนกลับไปโดน .catch() ของ doLogin() ได้ (Firebase Messaging SDK เอง auto พยายามลงทะเบียน
  // firebase-messaging-sw.js ที่ root ของโดเมนเป็นค่า default ภายใน แยกจาก path ที่เราลงทะเบียนเองด้วย) ย้าย
  // มาเรียกผ่าน setTimeout(...,0) แทน ตัดขาดจาก call stack/promise chain ของ login โดยสิ้นเชิง ยังไงก็ไม่มีทาง
  // ทำให้ login ดูเหมือนพังได้อีกต่อไป ไม่ว่า push notification จะลงทะเบียนสำเร็จหรือไม่ก็ตาม
  setTimeout(function () {
    requestNotificationPermission();
    setupPushNotifications();
  }, 0);
  setupNotificationsRealtimeListener();
  setupPersonalTasksListener();
  loadTodoList();
}

function exitAdminMode() {
  document.getElementById('login-icon-btn').style.display = 'flex';
  document.getElementById('admin-chip').style.display = 'none';
  document.getElementById('task-undated-row').style.display = 'none';
  document.getElementById('notif-bell-btn').style.display = 'none';
  document.getElementById('export-excel-btn').style.display = 'none';
  document.getElementById('dashboard-btn').style.display = 'none';
  document.getElementById('taskboard-sidebar-section').style.display = 'none';
  teardownPersonalTasksListener();
  if (_unsubNotifications) { _unsubNotifications(); _unsubNotifications = null; }
  lastNotifications = [];
  isFirstNotifSnapshot = true;
  loadTodoList();
}

function openStaffModal() {
  document.getElementById('staff-modal-overlay').style.display = 'flex';
  loadStaffList();
  _pushModalNav('staff-modal-overlay');
}
function closeStaffModal() {
  document.getElementById('staff-modal-overlay').style.display = 'none';
  cancelEditStaff();
  loadMemberSidebar();
}

function loadStaffList() {
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getStaffList', { token: token }).then(renderStaffList).catch(function (err) {
    console.error('โหลดรายชื่อผู้ปฏิบัติงานไม่สำเร็จ', err);
  });
}

var ROLE_LABELS = { admin: 'Admin', ceo: 'CEO', staff: 'Staff' };

function renderStaffList(result) {
  var container = document.getElementById('staff-list');
  if (!result.success) {
    container.innerHTML = '<p style="font-size:13px;color:var(--danger-text)">' + result.message + '</p>';
    return;
  }

  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>';
  var ICON_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="M21 2l-9.6 9.6"></path><path d="M15.5 7.5 18 10"></path><path d="M18.5 4.5 21 7"></path></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';

  container.innerHTML = '';
  result.staff.forEach(function (s) {
    var color = s.colorHex || '#888780';
    var textColor = getContrastTextColor(color);
    var initial = (s.firstName || '?').charAt(0);
    var fullName = (s.firstName + ' ' + s.lastName).replace(/'/g, '');

    var row = document.createElement('div');
    row.className = 'staff-row';
    row.innerHTML =
      '<div class="sr-avatar" style="background:' + color + '">' +
        (s.photoURL
          ? '<img src="' + s.photoURL + '" alt="">'
          : '<span style="color:' + textColor + '">' + initial + '</span>') +
      '</div>' +
      '<div class="staff-info">' +
        '<div class="name-line">' +
          '<p class="name">' + s.firstName + ' ' + s.lastName + '</p>' +
          '<span class="role-badge ' + s.role + '">' + (ROLE_LABELS[s.role] || s.role) + '</span>' +
          (s.username ? '<span class="id-badge">ID: ' + escapeHtmlPtb(s.username) + '</span>' : '') +
        '</div>' +
        '<p class="pos">' + (s.position || 'ไม่ระบุตำแหน่ง') + '</p>' +
        '<p class="meta">' + (s.phone || 'ไม่ระบุเบอร์โทร') + '</p>' +
      '</div>' +
      '<div class="sr-actions">' +
        '<div class="sr-icon-row">' +
          '<button class="sr-icon-btn" title="แก้ไข" onclick=\'startEditStaff(' + JSON.stringify(s) + ')\'>' + ICON_EDIT + '</button>' +
          '<button class="sr-icon-btn" title="รีเซ็ตรหัส" onclick="resetPasswordConfirm(this, \'' + s.staffId + '\', \'' + fullName + '\')">' + ICON_KEY + '</button>' +
          '<button class="sr-icon-btn danger" title="ลบบัญชี" onclick="deleteStaffConfirm(this, \'' + s.staffId + '\', \'' + fullName + '\')">' + ICON_TRASH + '</button>' +
        '</div>' +
        '<label class="sr-toggle">' +
          '<input type="checkbox" ' + (s.active ? 'checked' : '') + ' onchange="toggleStaffActive(this, \'' + s.staffId + '\', this.checked)">' +
          'ใช้งาน' +
        '</label>' +
      '</div>';
    container.appendChild(row);
  });
}

var editingStaffId = null;

// ปุ่ม segmented เลือกสิทธิ์/เพศ - เก็บค่าจริงไว้ใน <select> ที่ซ่อนอยู่ (ของเดิม backend ยังอ่านจากตรงนี้)
function setStaffRole(value) {
  document.getElementById('staff-role').value = value;
  var buttons = document.querySelectorAll('#staff-role-segmented button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-value') === value);
  }
}
function setStaffGender(value) {
  document.getElementById('staff-gender').value = value;
  var buttons = document.querySelectorAll('#staff-gender-segmented button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-value') === value);
  }
}

function toggleStaffAddForm() {
  var form = document.getElementById('staff-form');
  var isHidden = form.style.display === 'none';
  form.style.display = isHidden ? 'block' : 'none';
  document.getElementById('staff-form-toggle-btn').style.display = isHidden ? 'none' : 'block';
}

function startEditStaff(s) {
  document.getElementById('staff-form').style.display = 'block';
  document.getElementById('staff-form-toggle-btn').style.display = 'none';
  editingStaffId = s.staffId;
  document.getElementById('staff-username-field').style.display = 'none';
  document.getElementById('staff-firstname').value = s.firstName;
  document.getElementById('staff-lastname').value = s.lastName;
  document.getElementById('staff-position').value = s.position || '';
  document.getElementById('staff-phone').value = s.phone || '';
  document.getElementById('staff-color').value = s.colorHex || '#378ADD';
  setStaffRole(s.role || 'staff');
  setStaffGender(s.gender || '');
  document.getElementById('staff-birthdate').value = s.birthDate || '';
  document.getElementById('staff-form-title').textContent = 'แก้ไขบัญชีผู้ใช้';
  document.getElementById('staff-submit-btn').textContent = 'บันทึกการแก้ไข';
  document.getElementById('staff-cancel-edit-btn').style.display = 'block';
  document.getElementById('staff-box').scrollTop = document.getElementById('staff-box').scrollHeight;
}

function cancelEditStaff() {
  editingStaffId = null;
  document.getElementById('staff-form').style.display = 'none';
  document.getElementById('staff-form-toggle-btn').style.display = 'block';
  document.getElementById('staff-username-field').style.display = 'block';
  document.getElementById('staff-username').value = '';
  document.getElementById('staff-firstname').value = '';
  document.getElementById('staff-lastname').value = '';
  document.getElementById('staff-position').value = '';
  document.getElementById('staff-phone').value = '';
  document.getElementById('staff-color').value = '#378ADD';
  setStaffRole('staff');
  setStaffGender('');
  document.getElementById('staff-birthdate').value = '';
  document.getElementById('staff-form-title').textContent = 'เพิ่มบัญชีผู้ใช้ใหม่';
  document.getElementById('staff-submit-btn').textContent = 'เพิ่มบัญชีผู้ใช้';
  document.getElementById('staff-cancel-edit-btn').style.display = 'none';
}

function submitAddStaff() {
  var firstName = document.getElementById('staff-firstname').value.trim();
  var lastName = document.getElementById('staff-lastname').value.trim();
  var position = document.getElementById('staff-position').value.trim();
  var phone = document.getElementById('staff-phone').value.trim();
  var colorHex = document.getElementById('staff-color').value;
  var username = document.getElementById('staff-username').value.trim();
  var role = document.getElementById('staff-role').value;
  var btn = document.getElementById('staff-submit-btn');

  if (!firstName || !lastName) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกชื่อและนามสกุล' });
    return;
  }
  if (!editingStaffId && !username) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากำหนด Username สำหรับเข้าสู่ระบบ' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  var action = editingStaffId ? 'updateStaff' : 'addStaff';
  var payload = {
    token: token, firstName: firstName, lastName: lastName,
    position: position, phone: phone, colorHex: colorHex, role: role,
    gender: document.getElementById('staff-gender').value,
    birthDate: document.getElementById('staff-birthdate').value
  };
  if (editingStaffId) {
    payload.staffId = editingStaffId;
  } else {
    payload.username = username;
  }

  setButtonLoading(btn, true, editingStaffId ? 'กำลังบันทึก...' : 'กำลังเพิ่ม...');
  callApi(action, payload).then(function (result) {
    if (result.success) {
      cancelEditStaff();
      loadStaffList();
      if (result.generatedPassword) {
        Swal.fire({
          icon: 'success', title: 'เพิ่มผู้ปฏิบัติงานแล้ว',
          html: 'บัญชีเข้าสู่ระบบที่สร้างให้อัตโนมัติ:<br>' +
            '<b>Username:</b> ' + result.username + '<br>' +
            '<b>Password:</b> ' + result.generatedPassword + '<br><br>' +
            '<span style="font-size:12px;color:#9a7b1f">กรุณาแจ้งให้ผู้ปฏิบัติงานคนนี้ทราบ และเปลี่ยนรหัสผ่านทันทีที่ login ครั้งแรก</span>',
          confirmButtonText: 'รับทราบแล้ว'
        });
      } else {
        Toast.fire({ icon: 'success', title: 'บันทึกการแก้ไขแล้ว' });
      }
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function resetPasswordConfirm(btn, staffId, name) {
  Swal.fire({
    icon: 'warning', title: 'รีเซ็ตรหัสผ่านของ ' + name + '?',
    text: 'ระบบจะสุ่มรหัสผ่านใหม่ให้ทันที รหัสผ่านเดิมจะใช้ไม่ได้อีก',
    showCancelButton: true, confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังรีเซ็ต...');
    callApi('resetPassword', { token: token, staffId: staffId }).then(function (result) {
      if (result.success) {
        Swal.fire({
          icon: 'success', title: 'รีเซ็ตรหัสผ่านแล้ว',
          html: 'รหัสผ่านใหม่ของ <b>' + result.username + '</b>:<br>' +
            '<span style="font-size:18px;font-weight:600">' + result.newPassword + '</span><br><br>' +
            '<span style="font-size:12px;color:#9a7b1f">กรุณาแจ้งให้เจ้าของบัญชีทราบและเปลี่ยนรหัสผ่านทันทีที่ login ครั้งแรก</span>',
          confirmButtonText: 'รับทราบแล้ว'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

// ===== ลบบัญชีผู้ใช้ถาวร - ให้พิมพ์ชื่อยืนยันซ้ำก่อน เพราะกู้คืนไม่ได้ (ต่างจากปิดใช้งานที่แค่ toggle) =====
function deleteStaffConfirm(btn, staffId, name) {
  Swal.fire({
    icon: 'error',
    title: 'ลบบัญชีของ ' + name + ' ถาวร?',
    html: '<p style="font-size:13px;color:#6b7280">การลบนี้กู้คืนไม่ได้ ต่างจากการ "ปิดใช้งาน" — ประวัติงานเก่าที่เคยผูกกับคนนี้จะโชว์ "ไม่พบผู้ปฏิบัติงานนี้แล้ว" แทน<br><br>พิมพ์ชื่อเต็ม <b>' + name + '</b> เพื่อยืนยัน</p>',
    input: 'text',
    inputPlaceholder: name,
    showCancelButton: true,
    confirmButtonText: 'ลบถาวร',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ef4444',
    inputValidator: function (value) {
      if (value !== name) return 'พิมพ์ชื่อให้ตรงกับ "' + name + '" เป๊ะๆก่อนถึงจะลบได้';
    }
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังลบ...');
    callApi('deleteStaff', { token: token, staffId: staffId }).then(function (result) {
      if (result.success) {
        Toast.fire({ icon: 'success', title: 'ลบบัญชีถาวรแล้ว' });
        loadStaffList();
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

function toggleStaffActive(checkboxEl, staffId, active) {
  var token = localStorage.getItem(TOKEN_KEY);
  checkboxEl.disabled = true;
  callApi('setStaffActive', { token: token, staffId: staffId, active: active }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'อัปเดตไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    checkboxEl.disabled = false;
  });
}

// ===== ระบบปรับแต่งข้อความ (ตัวหนา/ตัวเอียง/ขนาด/สี) สำหรับช่อง "รายละเอียดงาน" ในฟอร์มสร้าง/แก้ไขงาน =====
// เก็บเป็น HTML ที่จำกัดชนิด tag ไว้ (กรองผ่าน sanitizeRichText ทั้งตอนโหลดเข้ากล่องและตอนบันทึก กัน HTML/สไตล์
// แปลกปลอมหลุดเข้ามา) ส่วนที่ export ออกเป็น Excel หรือแสดงในที่ที่ต้องการข้อความล้วนใช้ stripHtmlToText แทน
var RICH_TEXT_ALLOWED_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, BR: 1, SPAN: 1, DIV: 1 };

function sanitizeRichText(html) {
  var container = document.createElement('div');
  container.innerHTML = html || '';
  (function walk(node) {
    var child = node.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (child.nodeType === 1) {
        var tag = child.tagName;
        if (!RICH_TEXT_ALLOWED_TAGS[tag]) {
          // tag ที่ไม่อนุญาต - unwrap เอาแค่เนื้อหาข้างในออกมาแทนที่จะตัดทิ้งทั้งหมด
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          child = next;
          continue;
        }
        // ลบ attribute เดิมทั้งหมด เหลือแค่ style ที่กรองแล้ว (เฉพาะ span, เฉพาะ color/font-size)
        var keepStyle = '';
        if (tag === 'SPAN' && child.style) {
          if (child.style.color) keepStyle += 'color:' + child.style.color + ';';
          if (child.style.fontSize) keepStyle += 'font-size:' + child.style.fontSize + ';';
        }
        for (var i = child.attributes.length - 1; i >= 0; i--) {
          child.removeAttribute(child.attributes[i].name);
        }
        if (keepStyle) child.setAttribute('style', keepStyle);
        walk(child);
      } else if (child.nodeType !== 3) {
        // ไม่ใช่ text node หรือ element ที่อนุญาต (เช่น comment) - ตัดทิ้ง
        node.removeChild(child);
      }
      child = next;
    }
  })(container);
  return container.innerHTML;
}

function stripHtmlToText(html) {
  var d = document.createElement('div');
  d.innerHTML = html || '';
  d.querySelectorAll('br').forEach(function (el) { el.replaceWith('\n'); });
  d.querySelectorAll('div').forEach(function (el) { el.insertAdjacentText('beforebegin', '\n'); });
  return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

// แถบเครื่องมือปรับแต่งข้อความใช้ร่วมกันได้หลายจุดในหน้าเว็บ (ฟอร์มงานปฏิทินหลัก + ฟอร์ม Personal Task Board)
// โดยไม่ต้องพึ่ง id ตายตัว - แต่ละจุดห่อด้วย .rt-group (แถบเครื่องมือ + กล่อง .rt-editable) แล้วหาเป้าหมายจาก
// element ที่ถูกคลิกด้วย .closest('.rt-group') เอาเอง กันปัญหา id ซ้ำกันเวลามีมากกว่า 1 จุดในหน้าเดียวกัน
function rtGroupEditable(fromEl) {
  var group = fromEl && fromEl.closest ? fromEl.closest('.rt-group') : null;
  return group ? group.querySelector('.rt-editable') : null;
}

function richTextExec(cmd, btn) {
  var el = rtGroupEditable(btn);
  if (!el) return;
  el.focus();
  document.execCommand(cmd, false, null);
}

function richTextApplySize(sizePx, fromEl) {
  var el = rtGroupEditable(fromEl);
  if (!el) return;
  el.focus();
  if (!sizePx) return; // "ปกติ" - ไม่ต้องห่อ span เพิ่ม ใช้ขนาดเริ่มต้นของกล่อง
  wrapSelectionStyle(el, 'fontSize', sizePx);
}

function richTextApplyColor(hex, dot) {
  var el = rtGroupEditable(dot);
  if (!el) return;
  el.focus();
  wrapSelectionStyle(el, 'color', hex);
  var group = dot.closest('.rt-group');
  (group || document).querySelectorAll('.rt-color-dot').forEach(function (d) { d.classList.remove('selected'); });
  dot.classList.add('selected');
}

function wrapSelectionStyle(el, styleProp, styleValue) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    Toast.fire({ icon: 'info', title: 'เลือกข้อความที่ต้องการปรับก่อน' });
    return;
  }
  var range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;
  var span = document.createElement('span');
  span.style[styleProp] = styleValue;
  try {
    range.surroundContents(span);
  } catch (e) {
    // selection คร่อมหลาย element (เช่น ครอบ tag เปิด-ปิดไม่สมบูรณ์) - surroundContents ใช้ไม่ได้ ใช้ extract+insert แทน
    var frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  // แก้บั๊ก: ถ้า selection ยาวคร่อมเข้าไปใน span ที่เคยตั้งสี/ขนาดไว้ก่อนหน้า (เช่นคร่อมเข้าไปครึ่งหนึ่งของคำที่เคยเปลี่ยนสีไว้)
  // ตอน extractContents ตัดสกัดออกมา เบราว์เซอร์จะ clone tag เก่าคร่อมส่วนที่ถูกตัดไว้ให้อัตโนมัติเพื่อรักษาโครงสร้าง DOM เดิม
  // ทำให้ span เก่า (พร้อมสี/ขนาดเดิม) ไปซ้อนอยู่ "ข้างใน" span ใหม่ที่เพิ่งสร้าง แล้วชนะค่าใหม่ที่เพิ่งตั้ง เพราะ element ที่อยู่ลึกกว่า
  // มีสิทธิ์เหนือกว่าตามกฎ CSS cascade - เป็นสาเหตุที่เปลี่ยนสีแล้วดูเหมือนไม่ขึ้น (มักเกิดกับ selection ยาวๆ ที่คร่อมคำที่เคยจัดสไตล์ไว้)
  // แก้ด้วยการล้างค่า style ตัวเดียวกัน (เช่น color หรือ font-size) ออกจาก element ลูกทุกตัวที่อยู่ใน span ใหม่
  span.querySelectorAll('[style]').forEach(function (node) {
    node.style[styleProp] = '';
    if (!node.getAttribute('style')) node.removeAttribute('style');
  });
  sel.removeAllRanges();
  var newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.addRange(newRange);
}

// แก้บั๊ก: ปกติพอ mousedown ไปโดนปุ่ม/จุดสีในแถบเครื่องมือ เบราว์เซอร์จะยุบ selection ที่เลือกไว้ในกล่อง
// รายละเอียดงานทิ้งไปก่อน (ตั้ง selection ใหม่ที่จุดคลิกแทน) ทำให้พอ handler ของปุ่มทำงานจริง (ตอน click)
// window.getSelection() เจอ selection ว่างไปแล้ว แม้จะเพิ่งลากเลือกข้อความไว้ก็ตาม - เห็นชัดสุดกับปุ่มสี เพราะ
// wrapSelectionStyle เช็คแล้วเจอว่า selection ยุบไปแล้ว เลยขึ้นแจ้งเตือน "เลือกข้อความก่อน" ทั้งที่เพิ่งเลือกไป
// (ปุ่มตัวหนา/ตัวเอียงก็โดนบั๊กเดียวกัน แค่ไม่ error ให้เห็น เพราะ execCommand เงียบๆ ไม่ทำอะไรถ้าไม่มี selection)
// แก้ด้วยการ preventDefault ตอน mousedown บนปุ่ม/จุดสีเหล่านี้ กัน browser ไปยุบ selection ก่อนที่ click จะทำงาน
document.addEventListener('mousedown', function (e) {
  if (e.target.closest && (e.target.closest('.rt-btn') || e.target.closest('.rt-color-dot'))) {
    e.preventDefault();
  }
});

// อัปเดตสถานะปุ่ม B/I ให้ไฮไลต์ตามตำแหน่ง cursor/selection ปัจจุบัน - ใช้ได้กับทุกจุดที่มี .rt-group
// (หา group จาก element ที่ focus อยู่ตอนนี้ ไม่ผูกกับ id ตายตัว)
document.addEventListener('selectionchange', function () {
  var active = document.activeElement;
  if (!active || !active.classList || !active.classList.contains('rt-editable')) return;
  var group = active.closest('.rt-group');
  if (!group) return;
  var boldBtn = group.querySelector('.rt-bold-btn');
  var italicBtn = group.querySelector('.rt-italic-btn');
  try {
    if (boldBtn) boldBtn.classList.toggle('active', document.queryCommandState('bold'));
    if (italicBtn) italicBtn.classList.toggle('active', document.queryCommandState('italic'));
  } catch (e) {}
});

// ===== ฟอร์มสร้างงานใหม่ / แก้ไขงาน =====
var mapsLoaded = false;
var taskMap = null;
// แผนที่ (ดูอย่างเดียว ไม่แก้ไข) ในหน้าดูรายละเอียดงาน - แยกตัวแปรจาก taskMap/taskMarker ของฟอร์มสร้าง/แก้ไข
// เพราะเป็นแผนที่คนละอันกัน เปิดพร้อมกันไม่ได้อยู่แล้ว (ต้องปิด modal นี้ก่อนถึงจะเปิดฟอร์มแก้ไขได้) แต่แยกไว้กันสับสน
var taskDetailMap = null;
var taskDetailMarker = null;
var taskMarker = null;
var editingTaskId = null;
// ค่าแจ้งเตือนล่วงหน้าที่เลือกไว้ตอนสร้าง/แก้ไขงาน (นาที) - เก็บไว้ฝั่ง frontend เท่านั้นตอนนี้ (ดู TODO ที่ submitAddTask)
var _taskReminderMinutes = 60;
var TASK_REMINDER_PRESETS = [0, 15, 60, 180, 1440];

function openTaskModal() {
  editingTaskId = null;
  resetTaskForm();
  document.getElementById('task-box').querySelector('h2').textContent = '📝 สร้างงานใหม่';
  document.getElementById('task-submit-btn').textContent = 'บันทึกงาน';
  document.getElementById('task-modal-overlay').style.display = 'flex';
  loadTaskStaffChecklist([]);
  setupTaskMap();
  _pushModalNav('task-modal-overlay');
}

function openTaskModalForEdit(taskId) {
  var token = localStorage.getItem(TOKEN_KEY);
  // ยิง getTaskDetail และ getStaffList พร้อมกันเลย (ไม่เกี่ยวข้องกัน ไม่ต้องรอทีละรอบ)
  Promise.all([
    callApi('getTaskDetail', { token: token, taskId: taskId }),
    callApi('getStaffList', { token: token })
  ]).then(function (results) {
    var result = results[0];
    var staffListResult = results[1];
    if (!result.success) {
      Swal.fire({ icon: 'error', title: 'โหลดข้อมูลงานไม่สำเร็จ', text: result.message });
      return;
    }
    var task = result.task;
    editingTaskId = task.taskId;
    resetTaskForm();
    document.getElementById('task-box').querySelector('h2').textContent = '📝 แก้ไขงาน';
    document.getElementById('task-submit-btn').textContent = 'บันทึกการแก้ไข';

    document.getElementById('task-name').value = task.taskName;
    setTaskType(task.taskType || 'meeting');
    document.getElementById('task-undated').checked = task.isUndated;
    toggleUndatedFields();

    if (!task.isUndated) {
      document.getElementById('task-allday-radio').checked = task.isAllDay;
      document.getElementById('task-timed-radio').checked = !task.isAllDay;
      var start = new Date(task.startDateTime);
      var end = new Date(task.endDateTime);

      if (task.isAllDay) {
        var days = Math.round((end - start) / 86400000) + 1;
        document.getElementById('task-start-date').value = start.toISOString().slice(0, 10);
        document.getElementById('task-duration').value = days;
      } else {
        document.getElementById('task-start-date-t').value = start.toISOString().slice(0, 10);
        document.getElementById('task-start-time').value = start.toTimeString().slice(0, 5);
        document.getElementById('task-end-date-t').value = end.toISOString().slice(0, 10);
        document.getElementById('task-end-time').value = end.toTimeString().slice(0, 5);
      }
      toggleAllDayFields();
    }
    document.getElementById('task-location').value = task.locationName || '';
    document.getElementById('task-detail').innerHTML = sanitizeRichText(task.detail || '');
    applyTaskReminderValue(task.reminderMinutes);

    document.getElementById('task-modal-overlay').style.display = 'flex';
    renderTaskStaffChecklist(staffListResult, task.staffIds || []);
    setupTaskMap();
    _pushModalNav('task-modal-overlay');
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  });
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').style.display = 'none';
}

function resetTaskForm() {
  document.getElementById('task-name').value = '';
  setTaskType('meeting');
  document.getElementById('task-undated').checked = false;
  document.getElementById('task-allday-radio').checked = true;
  document.getElementById('task-timed-radio').checked = false;
  document.getElementById('task-start-date').value = '';
  document.getElementById('task-duration').value = 1;
  document.getElementById('task-start-date-t').value = '';
  document.getElementById('task-start-time').value = '09:00';
  document.getElementById('task-end-date-t').value = '';
  document.getElementById('task-end-time').value = '12:00';
  document.getElementById('task-location').value = '';
  document.getElementById('task-detail').innerHTML = '';
  toggleAllDayFields();
  toggleUndatedFields();
  applyTaskReminderValue(60); // ค่าเริ่มต้นตอนสร้างงานใหม่
  if (taskMarker) taskMarker.setMap(null);
  taskMarker = null;
}

function toggleUndatedFields() {
  var isUndated = document.getElementById('task-undated').checked;
  document.getElementById('task-date-section').style.display = isUndated ? 'none' : 'block';
}

function toggleAllDayFields() {
  var isAllDay = document.getElementById('task-allday-radio').checked;
  document.getElementById('allday-fields').style.display = isAllDay ? 'flex' : 'none';
  document.getElementById('timed-fields').style.display = isAllDay ? 'none' : 'block';
}

// ปุ่ม segmented เลือกประเภทงาน - เก็บค่าจริงไว้ใน <select id="task-type"> ที่ซ่อนอยู่ (ของเดิม backend ยังอ่านจากตรงนี้)
function setTaskType(value) {
  document.getElementById('task-type').value = value;
  var buttons = document.querySelectorAll('#task-type-segmented button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-value') === value);
  }
}

// ===== แจ้งเตือนล่วงหน้า (ชิปเลือกไว + กำหนดเอง) =====
// เรียกตอนผู้ใช้กดปุ่มชิปโดยตรง (mins = ตัวเลขนาทีของปุ่มนั้น หรือ 'custom')
function setTaskReminder(mins) {
  var customRow = document.getElementById('task-reminder-custom-row');
  if (mins === 'custom') {
    _taskReminderMinutes = computeCustomReminderMinutes();
    highlightReminderChip('custom');
    customRow.style.display = 'flex';
  } else {
    _taskReminderMinutes = mins;
    highlightReminderChip(mins);
    customRow.style.display = 'none';
  }
}

function highlightReminderChip(mins) {
  var chips = document.querySelectorAll('#task-reminder-chips .r-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('active', chips[i].getAttribute('data-mins') === String(mins));
  }
}

function computeCustomReminderMinutes() {
  var n = parseInt(document.getElementById('task-reminder-custom-n').value, 10) || 1;
  var unit = parseInt(document.getElementById('task-reminder-custom-unit').value, 10) || 1;
  return n * unit;
}

// ผูกกับ oninput/onchange ของช่องตัวเลข/หน่วยในแถว "กำหนดเอง" (อัปเดตค่าไว้เฉยๆ ไม่ยุ่งกับการไฮไลท์ชิป เพราะ
// อยู่ในโหมดกำหนดเองอยู่แล้วตอนแถวนี้แสดงผล)
function updateCustomReminderMinutes() {
  _taskReminderMinutes = computeCustomReminderMinutes();
}

// ตั้งค่าเริ่มต้น/ค่าที่โหลดมาจากงานเดิม (ต่างจาก setTaskReminder เพราะต้องรองรับค่าที่ไม่ตรงกับชิปสำเร็จรูปเลย
// โดยเด้งไปโหมด "กำหนดเอง" พร้อมเติมตัวเลข/หน่วยที่หารลงตัวสวยที่สุดให้อัตโนมัติ)
function applyTaskReminderValue(mins) {
  if (mins === null || mins === undefined) mins = 60; // ยังไม่มีข้อมูลจริงจาก backend (ฟีเจอร์นี้รอ deploy) - ใช้ค่าเริ่มต้นเดียวกับตอนสร้างใหม่ไปก่อน
  var customRow = document.getElementById('task-reminder-custom-row');
  if (TASK_REMINDER_PRESETS.indexOf(mins) !== -1) {
    _taskReminderMinutes = mins;
    highlightReminderChip(mins);
    customRow.style.display = 'none';
    return;
  }
  var n, unit;
  if (mins % 1440 === 0) { n = mins / 1440; unit = 1440; }
  else if (mins % 60 === 0) { n = mins / 60; unit = 60; }
  else { n = mins; unit = 1; }
  document.getElementById('task-reminder-custom-n').value = n;
  document.getElementById('task-reminder-custom-unit').value = String(unit);
  _taskReminderMinutes = mins;
  highlightReminderChip('custom');
  customRow.style.display = 'flex';
}

function loadTaskStaffChecklist(selectedIds, containerId) {
  selectedIds = selectedIds || [];
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getStaffList', { token: token }).then(function (result) {
    renderTaskStaffChecklist(result, selectedIds, containerId);
  });
}

// containerId เป็นพารามิเตอร์เสริม (ไม่ใส่ = ใช้ 'task-staff-list' เดิม สำหรับฟอร์มสร้าง/แก้ไขงานของ Admin) เพิ่มเข้ามา
// เพื่อให้ modal "ขอแก้ไขงาน" ของ staff ใช้ container คนละตัว ('edit-request-staff-list') ได้โดยไม่ชนกัน
function renderTaskStaffChecklist(result, selectedIds, containerId) {
  selectedIds = selectedIds || [];
  var myRole = localStorage.getItem(ROLE_KEY);
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

  var container = document.getElementById(containerId || 'task-staff-list');
  if (!result.success) {
    container.innerHTML = '<p style="font-size:12px;color:var(--danger-text)">' + result.message + '</p>';
    return;
  }
  container.innerHTML = '';
  result.staff
    .filter(function (s) { return s.active; })
    // เดิมซ่อน Admin ออกจากตัวเลือกมอบหมายงาน - ผู้ใช้แจ้งว่าต้องเลือก Admin เป็นผู้ปฏิบัติงานได้ด้วย จึงเอาการ
    // ซ่อนออก ให้ Admin ที่ยัง active โชว์ในรายชื่อเหมือนพนักงานคนอื่นๆ ปกติ
    // ยกเว้นบัญชี "ผู้ดูแลระบบ" ตัวจริงบัญชีเดียว (accountId "A001") - ไม่ใช่ staff/ผู้ใช้งานจริงที่จะถูกมอบหมาย
    // งานได้ ซ่อนออกจากตัวเลือกมอบหมายงานเช่นเดียวกับที่ getPublicStaffList/personalTask ฝั่ง backend ทำอยู่แล้ว
    .filter(function (s) { return s.staffId !== 'A001'; })
    .forEach(function (s) {
      // ล็อคชื่อตัวเองเสมอตอนลงนัดงาน ทั้ง staff และ ceo (เดิมล็อคแค่ staff) มีแค่ admin เท่านั้นที่ไม่ถูกล็อค
      var isSelf = (myRole === 'staff' || myRole === 'ceo') && s.staffId === myAccountId;
      var checked = isSelf || selectedIds.indexOf(s.staffId) !== -1;
      var label = document.createElement('label');
      label.innerHTML =
        '<input type="checkbox" value="' + s.staffId + '"' +
          (checked ? ' checked' : '') + (isSelf ? ' disabled' : '') + '>' +
        '<span class="dot" style="background:' + s.colorHex + '"></span>' +
        s.firstName + ' ' + s.lastName + (isSelf ? ' (คุณ)' : '');
        container.appendChild(label);
      });
}

// ===== ปุ่ม "ทุกคน" เหนือรายชื่อผู้ปฏิบัติงาน - สลับ (toggle) เลือกทุกคน/เคลียร์ทุกคนในปุ่มเดียว แทนการต้องกด
// ทีละคน: ถ้ายังไม่ได้ติ๊กครบทุกคน (ในกลุ่มที่ติ๊กได้) กดแล้วติ๊กให้ครบทุกคน แต่ถ้าติ๊กครบทุกคนอยู่แล้ว กดซ้ำอีก
// ครั้งจะเคลียร์ (untick) ออกทั้งหมดทันที ไม่เกี่ยวกับช่องที่ disabled (ชื่อตัวเองที่ถูกล็อคติ๊กไว้เสมอ) เลย
// ทั้งไม่นับรวมตอนเช็คว่า "ครบทุกคน" หรือยัง และไม่แตะต้อง/ไม่มีผลใดๆกับช่องนั้นทั้งตอนติ๊กและตอนเคลียร์ =====
function selectAllTaskStaff(containerId) {
  var checkboxes = document.querySelectorAll('#' + containerId + ' input[type="checkbox"]:not(:disabled)');
  var allChecked = true;
  for (var i = 0; i < checkboxes.length; i++) {
    if (!checkboxes[i].checked) { allChecked = false; break; }
  }
  var newState = !allChecked;
  for (var j = 0; j < checkboxes.length; j++) {
    checkboxes[j].checked = newState;
  }
}

// ===== จัดการแผนที่: เตรียมพร้อมสำหรับอนาคต ถ้ายังไม่มี API key จะไม่ทำอะไรเลย (เงียบ ไม่มีข้อความโชว์) =====
function setupTaskMap() {
  if (!GOOGLE_MAPS_API_KEY) return;

  document.getElementById('task-map').style.display = 'block';
  loadGoogleMapsScript(initTaskMap);
}

function loadGoogleMapsScript(callback) {
  if (mapsLoaded) {
    callback();
    return;
  }
  window.__onGoogleMapsLoaded = function () {
    mapsLoaded = true;
    callback();
  };
  var script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=' + GOOGLE_MAPS_API_KEY +
    '&libraries=places&loading=async&callback=__onGoogleMapsLoaded';
  document.head.appendChild(script);
}

function initTaskMap() {
  var center = { lat: 13.7563, lng: 100.5018 };
  taskMap = new google.maps.Map(document.getElementById('task-map'), {
    center: center, zoom: 12
  });

  var locationInput = document.getElementById('task-location');
  setupLocationAutocomplete(locationInput);

  taskMap.addListener('click', function (e) {
    placeMarker(e.latLng);
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: e.latLng }, function (results, status) {
      if (status === 'OK' && results[0]) {
        locationInput.value = stripGooglePlusCode(results[0].formatted_address);
      }
    });
  });
}

// ===== Phase 13: ค้นหาสถานที่แบบพิมพ์แล้วขึ้นตัวเลือก (Autocomplete) =====
// เดิมใช้ google.maps.places.Autocomplete (วิดเจ็ตผูกกับ input โดยตรง) แต่ Google ปิดไม่ให้โปรเจกต์/API key ที่สร้าง
// ใหม่หลัง 1 มี.ค. 2568 ใช้วิดเจ็ตตัวนี้แล้ว (ขึ้น error เงียบๆ ใช้งานไม่ได้) จึงเปลี่ยนมาใช้ AutocompleteSuggestion
// ซึ่งเป็นชุดคำสั่งแบบ "ขอข้อมูลมาเอง" (ไม่ใช่วิดเจ็ตสำเร็จรูป) แล้วสร้างดรอปดาวน์ผลลัพธ์เองแทน ข้อดีคือยังผูกกับ
// input เดิมได้ปกติ (ตอนแก้ไขงานเดิมที่ต้องเซ็ตค่าข้อความลง input ตรงๆ ก็ยังทำได้เหมือนเดิมทุกประการ)
var locationAutocompleteSessionToken = null;
var locationAutocompleteDebounceTimer = null;

function setupLocationAutocomplete(inputEl) {
  var dropdown = document.getElementById('task-location-suggestions');

  inputEl.oninput = function () {
    var text = inputEl.value.trim();
    clearTimeout(locationAutocompleteDebounceTimer);
    if (!text) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
    locationAutocompleteDebounceTimer = setTimeout(function () {
      fetchLocationSuggestions(text, dropdown, inputEl);
    }, 300);
  };

  document.addEventListener('click', function (e) {
    if (e.target !== inputEl && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

async function fetchLocationSuggestions(text, dropdown, inputEl) {
  try {
    var placesLib = await google.maps.importLibrary('places');
    if (!locationAutocompleteSessionToken) {
      locationAutocompleteSessionToken = new placesLib.AutocompleteSessionToken();
    }
    var result = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: text,
      sessionToken: locationAutocompleteSessionToken,
      region: 'th',
    });
    var suggestions = result.suggestions || [];
    if (!suggestions.length) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = '';
    suggestions.forEach(function (s) {
      var pred = s.placePrediction;
      if (!pred) return;
      var item = document.createElement('div');
      item.className = 'location-suggestion-item';
      item.textContent = pred.text.text;
      item.onclick = function () { selectLocationSuggestion(pred, inputEl, dropdown); };
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  } catch (err) {
    console.error('ค้นหาสถานที่ไม่สำเร็จ', err);
  }
}

// ===== ตัด Google Plus Code ออกจากที่อยู่ (เช่น "73HW+FHF ตำบล..." -> "ตำบล...") - รูปแบบ Plus Code คือ
// ตัวอักษร/เลข 4-8 ตัว + เครื่องหมาย + ตามด้วยตัวอักษร/เลข 2-3 ตัว (ใช้ชุดอักขระเฉพาะของ Open Location Code
// ไม่มี I, L, O, U กันสับสนกับตัวเลข) ตัดช่องว่าง/จุลภาคที่เหลือค้างหลังตัดออกด้วย =====
function stripGooglePlusCode(text) {
  if (!text) return text;
  return text
    .replace(/\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b\s*/gi, '')
    .replace(/^,\s*/, '')
    .trim();
}

async function selectLocationSuggestion(placePrediction, inputEl, dropdown) {
  dropdown.style.display = 'none';
  try {
    var place = placePrediction.toPlace();
    // ขอ displayName (ชื่อสถานที่) เพิ่มด้วย - เดิมขอแค่ formattedAddress (ที่อยู่ล้วน) เลยได้แค่ที่อยู่
    // ไม่มีชื่อร้าน/บริษัทติดมา ทั้งที่ตัวเลือกในดรอปดาวน์โชว์ชื่อ+ที่อยู่รวมกันอยู่แล้ว
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
    var name = place.displayName || '';
    // ตัด Google Plus Code ออกก่อน (เช่น "73HW+FHF") - formattedAddress บางที่มีพิกัดแบบนี้ติดมาด้วย
    // ผู้ใช้ไม่ต้องการเห็น เอาแค่ชื่อสถานที่กับที่อยู่ปกติพอ
    var addr = stripGooglePlusCode(place.formattedAddress) || placePrediction.text.text || '';
    // กันชื่อซ้ำกรณี formattedAddress มีชื่อสถานที่ปนอยู่แล้ว (บาง place type ของ Google เป็นแบบนี้)
    inputEl.value = (name && addr.indexOf(name) === -1) ? (name + ' ' + addr) : (addr || name);
    if (place.location && taskMap) {
      placeMarker(place.location);
      taskMap.setCenter(place.location);
      taskMap.setZoom(16);
    }
    // เริ่ม session ใหม่หลังเลือกเสร็จ 1 รอบ (ตามคำแนะนำ Google ให้คิดค่าบริการเป็นก้อนต่อ session การค้นหาแต่ละครั้ง)
    locationAutocompleteSessionToken = null;
  } catch (err) {
    console.error('โหลดรายละเอียดสถานที่ไม่สำเร็จ', err);
  }
}

function placeMarker(latLng) {
  if (taskMarker) taskMarker.setMap(null);
  taskMarker = new google.maps.Marker({ position: latLng, map: taskMap });
}

function submitAddTask() {
  var taskName = document.getElementById('task-name').value.trim();
  var isUndated = document.getElementById('task-undated').checked;
  var isAllDay = document.getElementById('task-allday-radio').checked;
  var btn = document.getElementById('task-submit-btn');

  if (!taskName) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกชื่องาน' });
    return;
  }

  var startDateTime = '', endDateTime = '';

  if (!isUndated) {
    if (isAllDay) {
      var startDate = document.getElementById('task-start-date').value;
      var duration = parseInt(document.getElementById('task-duration').value, 10) || 1;
      if (!startDate) {
        Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวันเริ่มงาน' });
        return;
      }
      var start = new Date(startDate);
      var end = new Date(start);
      end.setDate(end.getDate() + duration - 1);
      startDateTime = start.toISOString();
      endDateTime = end.toISOString();
    } else {
      var sDate = document.getElementById('task-start-date-t').value;
      var sTime = document.getElementById('task-start-time').value;
      var eDate = document.getElementById('task-end-date-t').value;
      var eTime = document.getElementById('task-end-time').value;
      if (!sDate || !eDate) {
        Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวันและเวลาให้ครบ' });
        return;
      }
      startDateTime = new Date(sDate + 'T' + sTime).toISOString();
      endDateTime = new Date(eDate + 'T' + eTime).toISOString();
    }
  }

  var staffIds = Array.prototype.slice.call(
    document.querySelectorAll('#task-staff-list input[type="checkbox"]:checked')
  ).map(function (el) { return el.value; });

  var locationName = document.getElementById('task-location').value.trim();
  var lat = taskMarker ? taskMarker.getPosition().lat() : '';
  var lng = taskMarker ? taskMarker.getPosition().lng() : '';
  var taskDetailEl = document.getElementById('task-detail');
  var detail = taskDetailEl.textContent.trim() ? sanitizeRichText(taskDetailEl.innerHTML) : '';
  var token = localStorage.getItem(TOKEN_KEY);

  var payload = {
    token: token, taskName: taskName, taskType: document.getElementById('task-type').value,
    isUndated: isUndated, startDateTime: startDateTime, endDateTime: endDateTime,
    isAllDay: isAllDay, staffIds: staffIds, locationName: locationName, lat: lat, lng: lng, detail: detail,
    reminderMinutes: _taskReminderMinutes
  };

  if (!isUndated) {
    var overlaps = getOverlappingHolidays(startDateTime, endDateTime);
    if (overlaps.length > 0) {
      var names = overlaps.map(function (h) { return h.name; }).join(', ');
      Swal.fire({
        icon: 'warning', title: 'งานนี้ทับวันหยุด',
        text: 'ช่วงวันที่เลือกทับกับวันหยุด: ' + names + ' ต้องการสร้าง/บันทึกงานต่อไปหรือไม่?',
        showCancelButton: true, confirmButtonText: 'ดำเนินการต่อ', cancelButtonText: 'ยกเลิก'
      }).then(function (res) {
        if (res.isConfirmed) proceedSaveTask(payload, btn);
      });
      return;
    }
  }
  proceedSaveTask(payload, btn);
}

function proceedSaveTask(payload, btn) {
  var action = editingTaskId ? 'updateTask' : 'addTask';
  if (editingTaskId) payload.taskId = editingTaskId;

  setButtonLoading(btn, true, editingTaskId ? 'กำลังบันทึก...' : 'กำลังบันทึก...');
  callApi(action, payload).then(function (result) {
    if (result.success) {
      closeTaskModal();
      var token = localStorage.getItem(TOKEN_KEY);
      loadAdminEvents(token);
      // รีเฟรช To-Do List ทุกครั้งที่บันทึกงานแบบไม่ระบุวันที่ (ไม่ใช่แค่ Admin แล้ว เพราะตอนนี้ Staff ก็สร้างงานแบบนี้ได้)
      if (localStorage.getItem(ROLE_KEY) === 'admin' || payload.isUndated) loadTodoList();
      Toast.fire({ icon: 'success', title: editingTaskId ? 'บันทึกการแก้ไขแล้ว' : 'สร้างงานใหม่แล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

var TASK_TYPE_LABELS = {
  meeting: 'ประชุม (Meeting)',
  onsite: 'นอกสถานที่ (On-site)',
  event: 'กิจกรรม (Event)',
  leave: 'ลา (Leave)'
};

// ===== To-Do List (Phase: แบบ Trello) =====
// การ์ดในไซด์บาร์ขวาเหลือแค่สรุปจำนวน+avatar กดแล้วเปิด Modal บอร์ดเต็ม จัดคอลัมน์ตามประเภทงาน
// ข้อมูลจริงยังเป็นชุดเดียวกัน (งานที่ isUndated) แค่เปลี่ยนวิธีแสดงผล — โครงสร้างเดิม (.todo-item/ti-*)
// ยังใช้อยู่ข้างในการ์ดแต่ละใบของบอร์ด เพื่อคงปุ่มแก้ไข/ลบ (Admin) และแจ้งขอเปลี่ยนวัน/ลบ (เจ้าของงาน) แบบเดิมทั้งหมด
var _todoTasksCache = [];
var TASK_TYPE_COLUMN_ORDER = ['meeting', 'onsite', 'event', 'leave'];
var TODO_AVATAR_PALETTE = ['#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#ef4444', '#0ea5a5'];

var _todoListLoaded = false;

// ===== Skeleton การ์ดสรุป To-Do (ไซด์บาร์ขวา) - โชว์ระหว่างรอ getUndatedTasks ตอบกลับครั้งแรกเท่านั้น =====
function renderTodoSummarySkeleton() {
  document.getElementById('todo-summary-count').innerHTML = '<span class="skel" style="display:inline-block;width:110px;height:12px;vertical-align:middle;"></span>';
  var avatarsEl = document.getElementById('todo-summary-avatars');
  avatarsEl.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    var av = document.createElement('span');
    av.className = 'skel avatar-mini';
    av.style.background = '';
    avatarsEl.appendChild(av);
  }
}

// ===== Skeleton บอร์ด Kanban (To-Do) - รูปทรงคอลัมน์+การ์ดคร่าวๆ โชว์ตอนเปิด modal ก่อนข้อมูลชุดแรกมาถึง =====
function renderKanbanSkeleton() {
  var board = document.getElementById('todo-board-columns');
  board.className = 'kanban-board';
  var colHtml = '';
  for (var c = 0; c < 4; c++) {
    colHtml += '<div class="skel-kanban-col"><span class="skel" style="width:60%;height:13px;"></span>';
    for (var i = 0; i < 2; i++) {
      colHtml += '<div class="skel-kanban-card"><span class="skel" style="width:85%;height:11px;"></span>' +
        '<span class="skel" style="width:55%;height:9px;"></span></div>';
    }
    colHtml += '</div>';
  }
  board.innerHTML = colHtml;
}

function loadTodoList() {
  if (!_todoListLoaded) renderTodoSummarySkeleton();
  callApi('getUndatedTasks', {}).then(function (result) {
    if (!result.success) {
      document.getElementById('todo-summary-count').textContent = 'โหลดไม่สำเร็จ';
      return;
    }
    _todoListLoaded = true;
    _todoTasksCache = result.tasks;
    renderTodoSummaryCard(result.tasks);
    // ถ้า Modal บอร์ดเปิดอยู่พอดี (เช่นมีคนเพิ่ม/ลบงานจากที่อื่นแบบ real-time) ให้รีเฟรชเนื้อในด้วย
    if (document.getElementById('todo-board-modal-overlay').style.display === 'flex') {
      renderKanbanBoard(result.tasks);
    }
  });
}

function renderTodoSummaryCard(tasks) {
  var countEl = document.getElementById('todo-summary-count');
  countEl.textContent = tasks.length === 0 ? 'ยังไม่มีงานในลิสต์' : tasks.length + ' งานรอกำหนดวัน';

  // รวมรายชื่อผู้ปฏิบัติงานที่ไม่ซ้ำจากทุกงาน โชว์เป็น avatar ซ้อนกันสูงสุด 4 คน
  var seen = {};
  var names = [];
  tasks.forEach(function (t) {
    (t.staff || []).forEach(function (s) {
      if (!seen[s.name]) { seen[s.name] = true; names.push(s); }
    });
  });
  var avatarsEl = document.getElementById('todo-summary-avatars');
  avatarsEl.innerHTML = '';
  names.slice(0, 4).forEach(function (s, i) {
    var av = document.createElement('div');
    av.className = 'avatar-mini';
    av.style.background = s.color || TODO_AVATAR_PALETTE[i % TODO_AVATAR_PALETTE.length];
    av.textContent = (s.name || '?').charAt(0);
    avatarsEl.appendChild(av);
  });
  if (names.length > 4) {
    var more = document.createElement('div');
    more.className = 'avatar-mini';
    more.style.background = '#9aa1a8';
    more.textContent = '+' + (names.length - 4);
    avatarsEl.appendChild(more);
  }
}

function openTodoBoardModal() {
  if (_todoListLoaded) { renderKanbanBoard(_todoTasksCache); } else { renderKanbanSkeleton(); }
  document.getElementById('todo-board-modal-overlay').style.display = 'flex';
  _pushModalNav('todo-board-modal-overlay');
}
function closeTodoBoardModal() {
  document.getElementById('todo-board-modal-overlay').style.display = 'none';
}

function renderKanbanBoard(tasks) {
  var board = document.getElementById('todo-board-columns');
  var isAdmin = localStorage.getItem(ROLE_KEY) === 'admin';
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

  if (tasks.length === 0) {
    board.innerHTML = '<div class="kanban-empty-all">ยังไม่มีงานในลิสต์</div>';
    return;
  }

  board.className = 'kanban-board';
  board.innerHTML = '';
  TASK_TYPE_COLUMN_ORDER.forEach(function (typeKey) {
    var colTasks = tasks.filter(function (t) { return t.taskType === typeKey; });
    var col = document.createElement('div');
    col.className = 'kanban-col';

    var head = document.createElement('div');
    head.className = 'kanban-col-head';
    head.innerHTML =
      '<span class="dot" style="background:' + (TASK_TYPE_COLORS[typeKey] || '#ccc') + '"></span>' +
      (TASK_TYPE_LABELS[typeKey] || typeKey).replace(/\s*\(.*\)/, '') +
      '<span class="n">' + colTasks.length + '</span>';
    col.appendChild(head);

    var cardsWrap = document.createElement('div');
    cardsWrap.className = 'kanban-cards';

    if (colTasks.length === 0) {
      cardsWrap.innerHTML = '<div class="kanban-empty-col">ไม่มีงาน</div>';
    } else {
      colTasks.forEach(function (t) {
        var staffNames = t.staff.map(function (s) { return s.name; }).join(', ');
        var isOwner = t.createdBy === myAccountId || (t.staffIds || []).indexOf(myAccountId) !== -1;
        var card = document.createElement('div');
        card.className = 'todo-item kanban-card';
        card.style.setProperty('--kc-color', TASK_TYPE_COLORS[typeKey] || '#ccc');
        card.innerHTML =
          '<div class="ti-top"><span class="ti-name">' + t.taskName + '</span></div>' +
          (staffNames ? '<p class="ti-staff">ผู้ปฏิบัติงาน: ' + staffNames + '</p>' : '') +
          (isAdmin ?
            '<div class="ti-actions">' +
              '<button class="btn-outline" onclick="editTodoTask(\'' + t.taskId + '\')">แก้ไข/กำหนดวัน</button>' +
              '<button class="btn-reject" onclick="deleteTodoTask(this, \'' + t.taskId + '\')">ลบ</button>' +
            '</div>' :
            (isOwner ?
              '<div class="ti-actions">' +
                '<button class="btn-outline" onclick="openRescheduleModal(\'' + t.taskId + '\')">แจ้งกำหนดวัน</button>' +
                '<button class="btn-reject" onclick="requestDeleteTaskConfirm(\'' + t.taskId + '\')">แจ้งขอลบ</button>' +
              '</div>' : ''));
        cardsWrap.appendChild(card);
      });
    }
    col.appendChild(cardsWrap);
    board.appendChild(col);
  });
}

function editTodoTask(taskId) {
  openTaskModalForEdit(taskId);
}

function deleteTodoTask(btn, taskId) {
  Swal.fire({
    icon: 'warning', title: 'ยืนยันลบงานนี้จาก To-Do List?',
    showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังลบ...');
    callApi('deleteTask', { token: token, taskId: taskId }).then(function (result) {
      if (result.success) {
        loadTodoList();
        Toast.fire({ icon: 'success', title: 'ลบแล้ว' });
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

function deleteTaskConfirm(taskId) {
  Swal.fire({
    title: 'ยืนยันลบงานนี้?',
    html: '<div class="td-warning-banner" style="text-align:left;justify-content:flex-start">⚠️ งานจะถูกซ่อนจากปฏิทิน แต่ข้อมูลยังเก็บไว้ดูย้อนหลังได้</div>',
    showCancelButton: true, confirmButtonText: 'ลบงาน', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    Toast.fire({ icon: 'info', title: 'กำลังลบ...' });
    callApi('deleteTask', { token: token, taskId: taskId }).then(function (result) {
      if (result.success) {
        loadAdminEvents(token);
        Toast.fire({ icon: 'success', title: 'ลบงานแล้ว' });
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    });
  });
}

var PROFILE_COLOR_PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
  '#14B8A6', '#0EA5E9', '#6366F1', '#A855F7', '#EC4899'
];

function renderColorSwatches(selectedColor, avatarEl) {
  var container = document.getElementById('profile-color-swatches');
  container.innerHTML = '';

  PROFILE_COLOR_PALETTE.forEach(function (color) {
    var swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color.toLowerCase() === (selectedColor || '').toLowerCase() ? ' selected' : '');
    swatch.style.background = color;
    swatch.onclick = function () {
      document.getElementById('profile-color').value = color;
      avatarEl.style.background = color;
      container.querySelectorAll('.color-swatch').forEach(function (el) { el.classList.remove('selected'); });
      swatch.classList.add('selected');
    };
    container.appendChild(swatch);
  });
}

// ===== Skeleton การ์ดโปรไฟล์ (Item 3 เพิ่มทีหลัง) - เดิมการ์ดนี้จะโล่งว่างเปล่าทั้งใบระหว่างรอ
// getMyProfile ตอบกลับ (ทุก field เป็นค่าว่างจนกว่าจะเซ็ตจริง) ผู้ใช้เห็นเป็นช่องว่างๆ ไม่รู้ว่ากำลังโหลด
// อยู่หรือเปล่า จึงเติม skeleton ให้ครบทุกจุดที่จะมีข้อความจริงโผล่ขึ้นภายหลัง - ใช้ .skel-on-dark เฉพาะ
// ส่วนที่อยู่บนแบนเนอร์เขียว (รูป/ชื่อ/ตำแหน่ง) และ .skel ปกติสำหรับส่วนที่อยู่บนพื้นขาวด้านล่าง =====
function renderProfileSkeleton() {
  document.getElementById('profile-photo').style.display = 'none';
  document.getElementById('profile-avatar').style.display = 'none';
  document.getElementById('profile-avatar-skel').style.display = 'block';
  document.getElementById('profile-fullname').innerHTML = '<span class="skel-on-dark" style="display:inline-block;width:130px;height:16px;margin:0 auto;"></span>';
  document.getElementById('profile-position').innerHTML = '<span class="skel-on-dark" style="display:inline-block;width:90px;height:12px;margin:4px auto 0;"></span>';
  document.getElementById('profile-username').innerHTML = '<span class="skel" style="display:inline-block;width:70px;height:12px;"></span>';
  document.getElementById('profile-gender').innerHTML = '<span class="skel" style="display:inline-block;width:44px;height:12px;"></span>';
  document.getElementById('profile-age').innerHTML = '<span class="skel" style="display:inline-block;width:44px;height:12px;"></span>';
  document.getElementById('profile-birthdate').innerHTML = '<span class="skel" style="display:inline-block;width:80px;height:12px;"></span>';
}

function openProfileModal() {
  document.getElementById('profile-modal-overlay').style.display = 'flex';
  document.getElementById('profile-edit-section').style.display = 'none';
  document.getElementById('profile-password-section').style.display = 'none';
  document.getElementById('profile-edit-toggle-btn').textContent = 'แก้ไขข้อมูล';
  _pushModalNav('profile-modal-overlay');
  renderProfileSkeleton();

  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getMyProfile', { token: token }).then(function (result) {
    if (!result.success) {
      closeProfileModal(); // ปิดการ์ดไปเลยแทนที่จะปล่อย skeleton ค้างอยู่หลัง error dialog
      Swal.fire({ icon: 'error', title: 'โหลดโปรไฟล์ไม่สำเร็จ', text: result.message });
      return;
    }
    var p = result.profile;
    var avatar = document.getElementById('profile-avatar');
    var photoEl = document.getElementById('profile-photo');
    document.getElementById('profile-avatar-skel').style.display = 'none';

    if (p.photoURL) {
      photoEl.src = p.photoURL;
      photoEl.style.display = 'block';
      avatar.style.display = 'none';
    } else {
      photoEl.style.display = 'none';
      avatar.style.display = 'flex';
      avatar.textContent = (p.firstName || '?').charAt(0);
      avatar.style.background = p.colorHex || '#378ADD';
    }

    document.getElementById('profile-fullname').textContent = p.firstName + ' ' + p.lastName;
    document.getElementById('profile-position').textContent = p.position || 'ไม่ระบุตำแหน่ง';
    document.getElementById('profile-username').textContent = '@' + p.username;
    document.getElementById('profile-gender').textContent = p.gender || '-';
    document.getElementById('profile-age').textContent = p.age !== null ? p.age + ' ปี' : '-';
    document.getElementById('profile-birthdate').textContent = p.birthDate || '-';

    document.getElementById('profile-phone').value = p.phone || '';
    document.getElementById('profile-color').value = p.colorHex || '#EF4444';
    renderColorSwatches(p.colorHex || '#EF4444', avatar);
  });
}

function toggleProfileEdit() {
  var section = document.getElementById('profile-edit-section');
  var isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';
  document.getElementById('profile-edit-toggle-btn').textContent = isHidden ? 'ปิดแก้ไขข้อมูล' : 'แก้ไขข้อมูล';
}

function toggleProfilePassword() {
  var section = document.getElementById('profile-password-section');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function closeProfileModal() {
  document.getElementById('profile-modal-overlay').style.display = 'none';
  document.getElementById('profile-old-password').value = '';
  document.getElementById('profile-new-password').value = '';
  document.getElementById('profile-confirm-password').value = '';
  document.getElementById('profile-photo-input').value = '';
}

document.getElementById('profile-photo-input').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire({ icon: 'warning', title: 'ไฟล์ไม่ถูกต้อง', text: 'กรุณาเลือกไฟล์รูปภาพ' });
    return;
  }

  // ย่อขนาด+บีบอัดรูปผ่าน canvas ก่อนแปลงเป็น base64 เสมอ
  // (ไฟล์รูปจากมือถือมักมีความละเอียดสูงมาก ถ้าส่งดิบๆ payload จะใหญ่เกินไปจนเชื่อมต่อ API ไม่ได้)
  var img = new Image();
  var objectUrl = URL.createObjectURL(file);

  img.onload = function () {
    var MAX_SIZE = 300;
    var w = img.width, h = img.height;
    if (w > h && w > MAX_SIZE) { h = Math.round(h * (MAX_SIZE / w)); w = MAX_SIZE; }
    else if (h > MAX_SIZE) { w = Math.round(w * (MAX_SIZE / h)); h = MAX_SIZE; }

    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(objectUrl);

    var btn = document.getElementById('profile-change-photo-btn');
    setButtonLoading(btn, true, 'กำลังอัปโหลด...');
    var token = localStorage.getItem(TOKEN_KEY);
    var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

    canvas.toBlob(function (blob) {
      // อัปโหลดตรงไป Firebase Storage ก่อน (ไม่ผ่าน Cloud Function เพราะไม่ใช่ข้อมูลที่ต้อง validate อะไรซับซ้อน)
      var storageRef = fbStorage.ref('profile-photos/' + myAccountId);
      storageRef.put(blob, { contentType: 'image/jpeg' }).then(function () {
        return storageRef.getDownloadURL();
      }).then(function (url) {
        // ได้ URL แล้ว เอาไปบันทึกลง Firestore ผ่าน Cloud Function ตามปกติ
        return callApi('updateOwnProfile', { token: token, photoURL: url }).then(function (result) {
          if (result.success) {
            document.getElementById('profile-photo').src = url;
            document.getElementById('profile-photo').style.display = 'block';
            document.getElementById('profile-avatar').style.display = 'none';
            Toast.fire({ icon: 'success', title: 'เปลี่ยนรูปโปรไฟล์แล้ว' });
          } else {
            Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
          }
        });
      }).catch(function (err) {
        Swal.fire({ icon: 'error', title: 'อัปโหลดรูปไม่สำเร็จ', text: err.message });
      }).finally(function () {
        setButtonLoading(btn, false);
      });
    }, 'image/jpeg', 0.75);
  };

  img.onerror = function () {
    URL.revokeObjectURL(objectUrl);
    Swal.fire({ icon: 'error', title: 'เปิดไฟล์รูปไม่ได้', text: 'กรุณาลองเลือกไฟล์อื่น' });
  };

  img.src = objectUrl;
});

function submitUpdateProfile() {
  var phone = document.getElementById('profile-phone').value.trim();
  var colorHex = document.getElementById('profile-color').value;
  var btn = document.getElementById('profile-save-btn');
  var token = localStorage.getItem(TOKEN_KEY);

  setButtonLoading(btn, true, 'กำลังบันทึก...');
  callApi('updateOwnProfile', { token: token, phone: phone, colorHex: colorHex }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: 'บันทึกข้อมูลแล้ว' });
      loadMemberSidebar();
      var currentToken = localStorage.getItem(TOKEN_KEY);
      if (currentToken) { loadAdminEvents(currentToken); } else { loadPublicEvents(); }
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function submitChangePassword() {
  var oldPassword = document.getElementById('profile-old-password').value;
  var newPassword = document.getElementById('profile-new-password').value;
  var confirmPassword = document.getElementById('profile-confirm-password').value;
  var btn = document.getElementById('profile-password-btn');

  if (!oldPassword || !newPassword || !confirmPassword) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกรหัสผ่านให้ครบทุกช่อง' });
    return;
  }
  if (newPassword !== confirmPassword) {
    Swal.fire({ icon: 'warning', title: 'รหัสผ่านไม่ตรงกัน', text: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังเปลี่ยน...');
  callApi('changeOwnPassword', { token: token, oldPassword: oldPassword, newPassword: newPassword }).then(function (result) {
    if (result.success) {
      document.getElementById('profile-old-password').value = '';
      document.getElementById('profile-new-password').value = '';
      document.getElementById('profile-confirm-password').value = '';
      Toast.fire({ icon: 'success', title: 'เปลี่ยนรหัสผ่านแล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function openHolidayModal() {
  document.getElementById('holiday-modal-overlay').style.display = 'flex';
  renderHolidayList();
  _pushModalNav('holiday-modal-overlay');
}
function closeHolidayModal() {
  document.getElementById('holiday-modal-overlay').style.display = 'none';
}

function toggleHolidayTypeFields() {
  var isWeekly = document.getElementById('holiday-type-weekly-radio').checked;
  document.getElementById('holiday-type').value = isWeekly ? 'weekly' : 'date';
  document.getElementById('holiday-date-field').style.display = isWeekly ? 'none' : 'block';
  document.getElementById('holiday-weekly-field').style.display = isWeekly ? 'block' : 'none';
}

function renderHolidayList() {
  var container = document.getElementById('holiday-list');
  container.innerHTML = '';
  if (holidaysCache.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">ยังไม่มีวันหยุดที่ตั้งไว้</p>';
    return;
  }

  var weekly = holidaysCache.filter(function (h) { return h.type === 'weekly'; });
  var dated = holidaysCache.filter(function (h) { return h.type === 'date'; })
    .slice().sort(function (a, b) { return a.value < b.value ? -1 : 1; });

  weekly.concat(dated).forEach(function (h) {
    var row = document.createElement('div');
    row.className = 'holiday-row';
    var badge = h.type === 'weekly'
      ? '<span class="holiday-badge weekly">ทุกสัปดาห์</span>'
      : '<span class="holiday-badge">' + h.value + '</span>';
    var label = h.type === 'weekly' ? ('ทุกวัน' + WEEKDAY_NAMES[h.value]) : h.name;
    row.innerHTML =
      badge +
      '<span class="hname">' + h.name + (h.type === 'weekly' ? ' (' + WEEKDAY_NAMES[h.value] + ')' : '') + '</span>' +
      '<button class="row-edit-btn" onclick="deleteHolidayConfirm(this, \'' + h.holidayId + '\')">ลบ</button>';
    container.appendChild(row);
  });
}

function submitAddHoliday() {
  var type = document.getElementById('holiday-type').value;
  var value = type === 'weekly'
    ? document.getElementById('holiday-weekday').value
    : document.getElementById('holiday-date').value;
  var name = document.getElementById('holiday-name').value.trim();
  var btn = document.getElementById('holiday-submit-btn');

  if (!value || !name) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวัน/วันที่ และกรอกชื่อวันหยุด' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังเพิ่ม...');
  callApi('addHoliday', { token: token, type: type, value: value, name: name }).then(function (result) {
    if (result.success) {
      document.getElementById('holiday-date').value = '';
      document.getElementById('holiday-name').value = '';
      refreshCalendarAfterHolidayChange();
      renderHolidayList();
      Toast.fire({ icon: 'success', title: 'เพิ่มวันหยุดแล้ว' });
    } else {
      Swal.fire({ icon: 'error', title: 'เพิ่มไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function deleteHolidayConfirm(btn, holidayId) {
  Swal.fire({
    icon: 'warning', title: 'ยืนยันลบวันหยุดนี้?',
    showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    setButtonLoading(btn, true, 'กำลังลบ...');
    callApi('deleteHoliday', { token: token, holidayId: holidayId }).then(function (result) {
      if (result.success) {
        refreshCalendarAfterHolidayChange();
        renderHolidayList();
        Toast.fire({ icon: 'success', title: 'ลบวันหยุดแล้ว' });
      } else {
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    }).finally(function () {
      setButtonLoading(btn, false);
    });
  });
}

// เก็บชื่อฟังก์ชันไว้ให้จุดเรียกใช้เดิมยังทำงานได้ แต่ไม่ต้องทำอะไรจริงแล้ว
// เพราะ setupHolidaysRealtimeListener() destroy+สร้างปฏิทินใหม่ให้อัตโนมัติอยู่แล้วทุกครั้งที่ addHoliday/deleteHoliday เปลี่ยนข้อมูลจริง
function refreshCalendarAfterHolidayChange() {
  // no-op: real-time listener จัดการให้แล้ว
}

// คำนวณความสว่างของสีพื้นหลัง แล้วเลือกสีตัวอักษร (ขาว/เข้ม) ให้อ่านง่ายเสมอไม่ว่าพื้นหลังจะเป็นสีอะไร
function getContrastTextColor(hex) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  var r = parseInt(hex.substr(0, 2), 16) / 255;
  var g = parseInt(hex.substr(2, 2), 16) / 255;
  var b = parseInt(hex.substr(4, 2), 16) / 255;
  var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#1f2430' : '#ffffff';
}

// ===== แปลงสี hex เป็น rgba แบบจาง (ใช้ทำพื้นหลังจางเต็มแถวในโหมด List) =====
function hexToRgba(hex, alpha) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
  var r = parseInt(hex.substr(0, 2), 16);
  var g = parseInt(hex.substr(2, 2), 16);
  var b = parseInt(hex.substr(4, 2), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// ===== Skeleton (shimmer) ตอนกำลังโหลดรายชื่อผู้ปฏิบัติงาน - โชว์เฉพาะตอนยังไม่มี cache ให้แสดงก่อน
// (มี cache แล้วโชว์ของจริงได้ทันทีไม่ต้องมีสถานะโหลดคั่น) ดู Item 3 =====
function renderMemberListSkeleton() {
  var container = document.getElementById('member-list');
  var rows = '';
  for (var i = 0; i < 4; i++) {
    rows += '<div class="skel-member-row">' +
      '<span class="skel"></span>' +
      '<span class="skel-lines"><span class="skel" style="width:70%;height:11px;"></span>' +
      '<span class="skel" style="width:45%;height:9px;"></span></span></div>';
  }
  container.innerHTML = rows;
}

function loadMemberSidebar() {
  var cached = getLocalCache(STAFF_CACHE_KEY);
  if (cached) { renderMemberList(cached); } else { renderMemberListSkeleton(); }

  callApi('getPublicStaffList', {}).then(function (result) {
    if (!result.success) {
      if (!cached) {
        document.getElementById('member-list').innerHTML =
          '<p style="font-size:12px;color:var(--danger-text)">โหลดไม่สำเร็จ: ' + (result.message || 'ไม่รู้จัก action นี้') + '</p>';
      }
      return;
    }
    setLocalCache(STAFF_CACHE_KEY, result.staff);
    renderMemberList(result.staff);
  }).catch(function (err) {
    console.error('โหลดรายชื่อผู้ปฏิบัติงานไม่สำเร็จ', err);
  });
}

function renderMemberList(staff) {
  // อัปเดต staffMapCache ไว้ใช้จับคู่ชื่อ+สีตอนสร้าง event ปฏิทินจาก staffIds (แทนที่ server เคย join ให้ตอนอยู่บน Apps Script)
  staff.forEach(function (s) {
    if (s.staffId) staffMapCache[s.staffId] = s;
  });
  refreshCalendarDayCells(); // ชื่อผู้ปฏิบัติงานอาจเพิ่ง resolve ได้ใหม่ (เช่น เพิ่งโหลดเสร็จ) ต้องรีเฟรช event ให้ตรง

  var container = document.getElementById('member-list');
  if (staff.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-faint)">ยังไม่มีผู้ปฏิบัติงาน</p>';
    return;
  }
  container.innerHTML = '';
  staff.forEach(function (s) {
    var color = s.colorHex || '#888780';
    var textColor = getContrastTextColor(color);
    var initial = (s.firstName || '?').charAt(0);

    var card = document.createElement('div');
    card.className = 'member-card';
    card.style.background = color;
    card.innerHTML =
      '<div class="member-avatar-wrap">' +
        (s.photoURL
          ? '<img src="' + s.photoURL + '" alt="">'
          : '<span class="member-avatar-fallback" style="color:' + color + '">' + initial + '</span>') +
      '</div>' +
      '<div class="member-info">' +
        '<p class="m-name" style="color:' + textColor + '">' + s.firstName + ' ' + s.lastName + '</p>' +
        '<p class="m-pos" style="color:' + textColor + '">' + (s.position || '-') + '</p>' +
      '</div>';
    container.appendChild(card);
  });
}

function isMobileView() {
  return window.innerWidth <= 768;
}

// Tablet (769-1024px) ใช้ drawer เหมือนมือถือด้วย แต่ปฏิทิน/topbar ยังเหมือน PC
function isDrawerView() {
  return window.innerWidth <= 1024;
}

function toggleSidebar(panelId) {
  var panel = document.getElementById(panelId);

  if (isDrawerView()) {
    var isOpening = !panel.classList.contains('drawer-open');
    closeAllDrawers();
    if (isOpening) {
      panel.classList.add('drawer-open');
      document.getElementById('drawer-backdrop').classList.add('show');
    }
    return;
  }

  var btnId = panelId === 'member-sidebar' ? 'toggle-members-btn' : 'toggle-legend-btn';
  var btn = document.getElementById(btnId);
  panel.classList.toggle('collapsed');
  btn.classList.toggle('active', !panel.classList.contains('collapsed'));
}

function closeAllDrawers() {
  document.getElementById('member-sidebar').classList.remove('drawer-open');
  document.getElementById('legend-sidebar').classList.remove('drawer-open');
  document.getElementById('drawer-backdrop').classList.remove('show');
}

// ===== เมนูลอยมือถือ (แท่งลอยเต็มความกว้าง) =====
function fabAction(action) {
  if (action === 'toggleView') {
    closeFabSpeedDial();
    toggleCalendarViewMode();
  } else if (action === 'team') {
    closeFabSpeedDial();
    toggleSidebar('member-sidebar');
  } else if (action === 'addtask') {
    if (!localStorage.getItem(TOKEN_KEY)) { closeAllDrawers(); openLoginModal(); return; }
    toggleFabSpeedDial();
  } else if (action === 'legend') {
    closeFabSpeedDial();
    toggleSidebar('legend-sidebar');
  } else if (action === 'menu') {
    closeFabSpeedDial();
    openMoreMenu();
  }
}

// ===== Speed-dial ของปุ่ม "+" กลาง (Approach B): แตะแล้วโผล่ 2 ตัวเลือกด้านบนปุ่มแทนที่จะเปิดฟอร์ม
// สร้างงานปฏิทินตรงๆ เหมือนเดิม - ใช้ toggle class เปิด/ปิด ไม่ผูก modal-nav (ไม่ใช่ modal จริง) =====
function toggleFabSpeedDial() {
  var dial = document.getElementById('mfn-speed-dial');
  if (!dial) return;
  if (dial.classList.contains('show')) { closeFabSpeedDial(); }
  else { openFabSpeedDial(); }
}
// ตัวจับ timer ตอนปิด (เก็บ .open ไว้รอ animation ปิดจบก่อนค่อยเอา display ออกจริง - ดูเหตุผลใน closeFabSpeedDial)
// เก็บเป็นตัวแปร module-level เพื่อยกเลิก timer เก่าได้ถ้าผู้ใช้กดเปิด-ปิดรัวๆ กันปุ่มถูกซ่อนผิดจังหวะ
var _fabSpeedDialCloseTimer = null;

function openFabSpeedDial() {
  closeAllDrawers();
  var dial = document.getElementById('mfn-speed-dial');
  var backdrop = document.getElementById('mfn-speed-dial-backdrop');
  var btn = document.getElementById('mfn-add-btn');
  if (_fabSpeedDialCloseTimer) { clearTimeout(_fabSpeedDialCloseTimer); _fabSpeedDialCloseTimer = null; }
  if (backdrop) backdrop.classList.add('show');
  if (btn) btn.classList.add('mfn-add-open');
  if (dial) {
    // ขั้นที่ 1: เปิด display:flex ก่อน (ปุ่มยังอยู่สถานะ opacity:0/scale เล็กตาม default ของ .mfn-speed-dial-item)
    dial.classList.add('open');
    // บังคับให้ browser reflow/paint เฟรม "ซ่อนอยู่" นี้จริงๆ ก่อน ไม่งั้น step ถัดไปจะโดนรวบเป็นเฟรมเดียวกัน
    // แล้ว animation จะไม่เกิดขึ้นเลยเหมือนบั๊กเดิม (นี่คือจุดสำคัญของ fix)
    void dial.offsetHeight;
    // ขั้นที่ 2: ค่อยเพิ่ม .show ในเฟรมถัดไป เพื่อให้ transition มีจังหวะ animate จากสถานะซ่อนไปสถานะเปิดจริง
    requestAnimationFrame(function () {
      dial.classList.add('show');
    });
  }
}
function closeFabSpeedDial() {
  var dial = document.getElementById('mfn-speed-dial');
  var backdrop = document.getElementById('mfn-speed-dial-backdrop');
  var btn = document.getElementById('mfn-add-btn');
  if (_fabSpeedDialCloseTimer) { clearTimeout(_fabSpeedDialCloseTimer); _fabSpeedDialCloseTimer = null; }
  if (dial) {
    dial.classList.remove('show');
    // รอให้ transition fade/scale ออกของแต่ละปุ่ม (0.28s ใน style.css) เล่นจบก่อน ค่อยเอาคลาส .open ออก (ตัด
    // display:flex) จริง ไม่งั้นปุ่มจะหายวับทันทีไม่มี fade out ให้เห็นเลย (ตัด transition ทิ้งเหมือนบั๊กเดิม)
    _fabSpeedDialCloseTimer = setTimeout(function () {
      dial.classList.remove('open');
      _fabSpeedDialCloseTimer = null;
    }, 280);
  }
  if (backdrop) backdrop.classList.remove('show');
  if (btn) btn.classList.remove('mfn-add-open');
}
function fabSpeedDialChoose(kind) {
  closeFabSpeedDial();
  if (kind === 'calendar') {
    openTaskModal();
  } else if (kind === 'personal') {
    openPersonalTaskModal(null);
  }
}

// ===== สลับมุมมองปฏิทิน Grid เดือน <-> List (สำหรับมือถือ/Tablet) จำค่าที่เลือกไว้ใน localStorage =====
var CALENDAR_VIEW_PREF_KEY = 'c2tech_calendar_view_pref';

// ===== Export ไฟล์ Excel / พิมพ์รายงาน ผ่านแท็บใหม่ แทนการบังคับดาวน์โหลด/เปิด print dialog ในเฟรมเดิม =====
// เหตุผล: C2 Calendar ถูกฝังอยู่ใน Google Sites ผ่าน iframe ซึ่ง Google ครอบ sandbox ไว้ (เจ้าของเว็บไซต์
// ปรับแต่งเองไม่ได้) sandbox นี้มักบล็อกการบังคับดาวน์โหลดไฟล์/เปิด print dialog ที่สั่งจาก JS ภายในเฟรมเดิม
// แบบเงียบๆ (กดปุ่มแล้วไม่มีอะไรเกิดขึ้นเลย) วิธีแก้คือเปิดแท็บใหม่ (top-level browsing context ที่ไม่ถูก
// sandbox ของ Google Sites ครอบ) แล้วสั่งดาวน์โหลด/พิมพ์จากในแท็บใหม่นั้นแทน
//
// ข้อควรระวัง: window.open() ต้องถูกเรียกแบบ synchronous ต่อเนื่องจาก user gesture (click) เท่านั้น ถ้าเรียก
// หลัง await/Promise (เช่นหลัง callApi รอ API ตอบกลับ) เบราว์เซอร์จะมองว่าไม่ได้มาจาก click โดยตรงแล้ว
// แล้วบล็อก popup ทันที - ฟังก์ชันที่มีการเรียก API ก่อน (doTaskExport) จึงต้องเปิดแท็บเปล่าไว้ล่วงหน้า
// ตั้งแต่ต้นฟังก์ชัน (ก่อน callApi) แล้วค่อยส่ง window ที่เปิดไว้แล้วนั้นมาเติมเนื้อหาทีหลังผ่าน preOpenedTab
function exportWorkbookViaNewTab(wb, filename, preOpenedTab) {
  var newTab = preOpenedTab || window.open('', '_blank');
  var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  var blob = new Blob([wbout], { type: 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  if (!newTab) {
    // popup ถูกบล็อก (เช่นตั้งค่าเบราว์เซอร์ไว้เข้มงวด) - fallback กลับไปดาวน์โหลดในเฟรมเดิมแบบเดิม
    // ยังดีกว่าไม่ทำอะไรเลย แม้อาจไม่รอดจาก sandbox ของ Google Sites ก็ตาม
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return;
  }
  var a2 = newTab.document.createElement('a');
  a2.href = url;
  a2.download = filename;
  newTab.document.body.appendChild(a2);
  a2.click();
  setTimeout(function () { URL.revokeObjectURL(url); try { newTab.close(); } catch (e) {} }, 1500);
}

// ===== รายงานสรุปผู้บริหาร (Exec Report) - A4 หนึ่งหน้า: โดนัทสัดส่วน + ภาระงานรายคน + คอลัมน์ขวา =====
// ดีไซน์นี้เลือกมาจาก preview 4 แบบที่ทำไว้ให้ผู้ใช้เทียบ (เวอร์ชันผสม: โดนัทฟอนต์ใหญ่ + ภาระงานฝั่งซ้าย +
// คำเตือน/รายการฝั่งขวา) แล้วเอามาใส่ข้อมูลจริงแทนข้อมูลจำลองตรงนี้

// สร้าง SVG โดนัทจาก segments [{label,count,color}] แบบไดนามิก (คำนวณ arc math เองไม่พึ่ง library)
function execReportBuildDonut(segments, total, r, sw, size) {
  var circumference = 2 * Math.PI * r;
  var cum = 0;
  var c = size / 2;
  var circlesHtml = segments.map(function (seg) {
    var len = total > 0 ? (seg.count / total) * circumference : 0;
    var dasharray = len.toFixed(2) + ' ' + (circumference - len).toFixed(2);
    var dashoffset = (-cum).toFixed(2);
    cum += len;
    return '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + seg.color + '" stroke-width="' + sw +
      '" stroke-dasharray="' + dasharray + '" stroke-dashoffset="' + dashoffset + '"></circle>';
  }).join('');
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><g transform="rotate(-90 ' + c + ' ' + c + ')">' + circlesHtml + '</g></svg>';
}

function execReportLegendRow(seg, total) {
  var pct = total > 0 ? Math.round(seg.count / total * 100) : 0;
  return '<div style="display:flex;align-items:center;justify-content:space-between;">' +
    '<div style="display:flex;align-items:center;gap:11px;"><span style="width:13px;height:13px;border-radius:50%;background:' + seg.color + ';display:inline-block;"></span>' +
    '<span style="font-size:17px;font-weight:500;">' + escapeHtmlPtb(seg.label) + '</span></div>' +
    '<div style="display:flex;align-items:center;gap:12px;"><span style="font-size:17px;font-weight:700;color:#201E1D;">' + seg.count + ' งาน</span>' +
    '<span style="font-size:15px;color:#63816F;width:38px;text-align:right;">' + pct + '%</span></div></div>';
}

function execReportWorkloadRow(item, maxCount) {
  var widthPct = maxCount > 0 ? Math.round(item.count / maxCount * 100) : 0;
  return '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">' +
    '<div style="display:flex;align-items:center;gap:8px;"><span style="width:9px;height:9px;border-radius:50%;background:' + item.color + ';flex-shrink:0;"></span>' +
    '<span style="font-size:13px;">' + escapeHtmlPtb(item.name) + '</span></div>' +
    '<span style="font-size:13px;font-weight:700;">' + item.count + '</span></div>' +
    '<div style="height:7px;background:#F1F3F2;border-radius:4px;"><div style="width:' + widthPct + '%;height:100%;background:' + item.color + ';border-radius:4px;"></div></div></div>';
}

function execReportListRow(label, badge, badgeColor) {
  return '<div style="display:flex;align-items:center;justify-content:space-between;">' +
    '<span style="font-size:12.5px;color:#201E1D;">' + escapeHtmlPtb(label) + '</span>' +
    '<span style="font-size:11.5px;font-weight:700;color:' + badgeColor + ';flex-shrink:0;margin-left:10px;">' + escapeHtmlPtb(badge) + '</span></div>';
}

function execReportUpcomingRow(item, isLast) {
  return '<tr style="' + (isLast ? '' : 'border-bottom:1px solid #F1F3F2;') + '">' +
    '<td style="padding:11px 0;font-size:13px;color:#201E1D;">' + escapeHtmlPtb(item.title) + '</td>' +
    '<td style="padding:11px 0;font-size:12.5px;color:#63816F;">' + escapeHtmlPtb(item.who || '-') + '</td>' +
    '<td style="padding:11px 0;text-align:right;"><span style="font-size:11px;font-weight:700;color:' + (item.badgeTextColor || '#3F654D') + ';background:' + (item.badgeBg || '#EEF6F1') + ';padding:3px 10px;border-radius:999px;white-space:nowrap;">' + escapeHtmlPtb(item.badge) + '</span></td>' +
  '</tr>';
}

// cfg = { periodLabel, dateRangeLabel, totalLabel, donutSegments:[{label,count,color}], donutSectionTitle,
//   donutCenterPct, donutCenterSub, workload:[{name,count,color}], rightWarning:{headerText,items:[{label,badge}]}|null,
//   upcomingTitle, upcomingItems:[{title,who,badge,badgeBg,badgeTextColor}], generatedAtLabel }
// หมายเหตุ (รีดีไซน์ 20260924 - เพิ่มแถบสี header + ตาราง "งานที่ใกล้จะถึง" เต็มความกว้างแทนลิสต์แคบๆ เดิม
// ฝั่งขวา): rightListTitle/rightListItems (ของเดิม) ถูกแทนที่ด้วย upcomingTitle/upcomingItems แล้ว - ผู้เรียก
// ทั้งสองจุด (exportTaskReport ของ Task Board, printDashboardReport ของปฏิทิน) อัปเดตตามด้านล่างแล้ว
function execReportHtml(cfg) {
  var total = cfg.donutSegments.reduce(function (s, x) { return s + x.count; }, 0);
  var donutSvg = execReportBuildDonut(cfg.donutSegments, total, 84, 28, 200);
  var legendHtml = cfg.donutSegments.map(function (seg) { return execReportLegendRow(seg, total); }).join('');
  var maxWorkload = cfg.workload.reduce(function (m, x) { return Math.max(m, x.count); }, 0) || 1;
  var workloadHtml = cfg.workload.map(function (item) { return execReportWorkloadRow(item, maxWorkload); }).join('');

  // กล่องขวา: มีแต่คำเตือนงานเกินกำหนดแล้ว (ตัดลิสต์ "ใกล้ครบกำหนด" แคบๆ ออก ย้ายไปทำเป็นตารางเต็มความกว้าง
  // ด้านล่างแทน) ถ้าไม่มีงานเกินกำหนดเลย โชว์กล่องเขียวให้กำลังใจแทนกล่องแดงว่าง
  var warningHtml;
  if (cfg.rightWarning && cfg.rightWarning.items.length) {
    warningHtml = '<div style="background:#FDF2F2;border:1.5px solid #F3C7C7;border-radius:12px;padding:18px 20px;">' +
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">' +
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3.5l9.5 16.5H2.5L12 3.5z"></path><line x1="12" y1="9.5" x2="12" y2="14"></line><circle cx="12" cy="17" r="0.9" fill="#DC2626" stroke="none"></circle></svg>' +
      '<span style="font-size:13.5px;font-weight:700;color:#B91C1C;">' + escapeHtmlPtb(cfg.rightWarning.headerText) + '</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
      cfg.rightWarning.items.map(function (it) { return execReportListRow(it.label, it.badge, '#DC2626'); }).join('') +
      '</div></div>';
  } else {
    warningHtml = '<div style="background:#EEF6F1;border:1.5px solid #CFE3D6;border-radius:12px;padding:18px 20px;display:flex;align-items:center;gap:9px;">' +
      '<span style="font-size:16px;">🎉</span><span style="font-size:13.5px;font-weight:700;color:#3F654D;">ไม่มีงานเกินกำหนดในช่วงนี้</span></div>';
  }

  var upcomingTableHtml;
  if (cfg.upcomingItems && cfg.upcomingItems.length) {
    upcomingTableHtml = '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr style="border-bottom:1.5px solid #D2DCD8;">' +
        '<th style="text-align:left;font-size:10.5px;font-weight:600;color:#9AA1A8;text-transform:uppercase;letter-spacing:0.04em;padding:0 0 9px;">ชื่องาน</th>' +
        '<th style="text-align:left;font-size:10.5px;font-weight:600;color:#9AA1A8;text-transform:uppercase;letter-spacing:0.04em;padding:0 0 9px;">ผู้รับผิดชอบ</th>' +
        '<th style="text-align:right;font-size:10.5px;font-weight:600;color:#9AA1A8;text-transform:uppercase;letter-spacing:0.04em;padding:0 0 9px;">กำหนดส่ง</th>' +
      '</tr></thead><tbody>' +
      cfg.upcomingItems.map(function (it, idx) { return execReportUpcomingRow(it, idx === cfg.upcomingItems.length - 1); }).join('') +
      '</tbody></table>';
  } else {
    upcomingTableHtml = '<div style="font-size:12.5px;color:#9AA1A8;">ไม่มีงานที่ใกล้ถึงกำหนดในช่วงนี้</div>';
  }

  var iconUrl = new URL('icons/icon-192.png', window.location.href).href; // แก้บั๊ก: เดิมเดา origin+'/icons/...' ผิด ถ้าแอป host ไม่ได้อยู่ที่ domain root โลโก้เลยหาย

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtmlPtb(cfg.periodLabel) + '</title>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap">' +
    '<style>' +
      '@page { size: A4; margin: 0; }' +
      'body{margin:0;background:#F4F5F4;font-family:"Chakra Petch","Noto Sans Thai","Sarabun",sans-serif;color:#201E1D;}' +
      '*{box-sizing:border-box;}' +
      '.page{width:210mm;min-height:297mm;background:#fff;position:relative;}' +
      '@media print{ body{background:#fff;} .page{margin:0;} }' +
    '</style></head><body>' +
    '<div class="page">' +
      // แถบสีเต็มความกว้าง header (เพิ่มใหม่ - เดิมเป็นพื้นขาวโล่งๆ) + เส้นไล่สีบางๆ ต่อท้ายกันดูตัดแข็ง
      '<div style="background:#3F654D;padding:26px 40px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<img src="' + iconUrl + '" alt="" style="height:38px;width:38px;border-radius:9px;">' +
          '<span style="font-size:17px;font-weight:700;color:#fff;">C2TECH</span>' +
        '</div>' +
        '<div style="text-align:right;font-size:11px;color:#D2DCD8;letter-spacing:0.08em;text-transform:uppercase;">รายงานสรุปงาน</div>' +
      '</div>' +
      '<div style="height:5px;background:linear-gradient(90deg,#63816F,#3F654D 60%,#2b4a37);"></div>' +
      '<div style="padding:30px 40px 40px;">' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;">' +
        '<div><div style="font-size:28px;font-weight:700;line-height:1.15;">' + escapeHtmlPtb(cfg.periodLabel) + '</div>' +
        '<div style="margin-top:6px;font-size:13px;color:#63816F;">' + escapeHtmlPtb(cfg.dateRangeLabel) + '</div></div>' +
        '<div style="text-align:right;background:#EEF6F1;border-radius:14px;padding:10px 20px;">' +
        '<div style="font-size:30px;font-weight:700;color:#3F654D;line-height:1;">' + total + '</div>' +
        '<div style="font-size:11px;color:#63816F;margin-top:3px;">' + escapeHtmlPtb(cfg.totalLabel || 'งานทั้งหมด') + '</div></div>' +
      '</div>' +
      '<div style="height:1px;background:#D2DCD8;margin-top:22px;"></div>' +
      '<div style="display:flex;gap:40px;align-items:center;margin-top:28px;">' +
        '<div style="position:relative;width:200px;height:200px;flex-shrink:0;">' + donutSvg +
          '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
            '<div style="font-size:42px;font-weight:700;color:#3F654D;line-height:1;">' + (cfg.donutCenterPct || 0) + '%</div>' +
            '<div style="font-size:12px;color:#63816F;margin-top:5px;">' + escapeHtmlPtb(cfg.donutCenterSub || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:17px;">' +
          '<div style="font-size:12px;font-weight:600;color:#9AA1A8;letter-spacing:0.08em;text-transform:uppercase;">' + escapeHtmlPtb(cfg.donutSectionTitle || 'สถานะงาน') + '</div>' +
          legendHtml +
        '</div>' +
      '</div>' +
      '<div style="height:1px;background:#D2DCD8;margin-top:30px;"></div>' +
      '<div style="display:flex;gap:26px;margin-top:24px;">' +
        '<div style="width:310px;flex-shrink:0;">' +
          '<div style="font-size:11px;font-weight:600;color:#9AA1A8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:15px;">ภาระงานรายคน</div>' +
          '<div style="display:flex;flex-direction:column;gap:13px;">' + (workloadHtml || '<div style="font-size:12.5px;color:#9AA1A8;">ไม่มีข้อมูล</div>') + '</div>' +
        '</div>' +
        '<div style="flex:1;">' + warningHtml + '</div>' +
      '</div>' +
      '<div style="height:1px;background:#D2DCD8;margin-top:26px;"></div>' +
      '<div style="margin-top:22px;">' +
        '<div style="font-size:11px;font-weight:600;color:#9AA1A8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">' + escapeHtmlPtb(cfg.upcomingTitle || '🗓️ งานที่ใกล้จะถึง — 7 วันข้างหน้า') + '</div>' +
        upcomingTableHtml +
      '</div>' +
      '<div style="margin-top:26px;display:flex;justify-content:space-between;font-size:10.5px;color:#9AA1A8;border-top:1px solid #EEF0EE;padding-top:10px;">' +
        '<span>C2TECH — C2 Calendar</span><span>สร้างรายงานเมื่อ ' + escapeHtmlPtb(cfg.generatedAtLabel) + '</span>' +
      '</div>' +
      '</div>' +
    '</div>' +
    '</body></html>';
}

function openExecReportInNewTab(html, preOpenedTab) {
  var w = preOpenedTab || window.open('', '_blank');
  if (!w) {
    Swal.fire({ icon: 'warning', title: 'เบราว์เซอร์บล็อกการเปิดแท็บใหม่', text: 'กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้แล้วลองอีกครั้ง' });
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  var triggered = false;
  function doPrint() { if (triggered) return; triggered = true; try { w.focus(); w.print(); } catch (e) {} }
  w.onload = doPrint;
  setTimeout(doPrint, 500); // เผื่อ onload ไม่ทำงาน/fire ไปแล้วก่อนตั้ง handler (มักเกิดกับเอกสารที่ document.write เอง) - ให้เวลาฟอนต์ Google Fonts โหลดด้วย
}

function fmtGeneratedAtLabel() {
  var d = new Date();
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

// ===== Export งานในเดือนที่กำลังดูอยู่เป็นไฟล์ Excel (ใช้ข้อมูลที่โหลดไว้แล้ว ไม่ต้องยิง API ใหม่) =====
function exportMonthToExcel() {
  if (!calendarInstance || !lastTaskDocs.length) {
    Swal.fire({ icon: 'info', title: 'ยังไม่มีข้อมูลงานให้ export' });
    return;
  }

  var rangeStart = calendarInstance.view.currentStart;
  var rangeEnd = calendarInstance.view.currentEnd;
  var monthLabel = calendarInstance.view.title;

  var rows = [];
  lastTaskDocs.forEach(function (docSnap) {
    var row = docSnap.data();
    if (row.isUndated || !row.startDateTime) return;
    var start = firestoreDateToJs(row.startDateTime);
    if (start < rangeStart || start >= rangeEnd) return; // เอาแค่งานในเดือนที่กำลังดูอยู่

    var end = firestoreDateToJs(row.endDateTime) || start;
    var staffNames = (row.staffIds || []).map(function (id) {
      var s = staffMapCache[id];
      return s ? s.firstName + ' ' + s.lastName : '';
    }).filter(function (n) { return n; }).join(', ');

    rows.push({
      'วันที่เริ่ม': start.toLocaleDateString('th-TH'),
      'วันที่สิ้นสุด': end.toLocaleDateString('th-TH'),
      'ชื่องาน': row.taskName,
      'ประเภทงาน': (TASK_TYPE_LABELS[row.taskType] || row.taskType),
      'ผู้ปฏิบัติงาน': staffNames,
      'สถานที่': row.locationName || '',
      'สถานะ': row.status,
      'รายละเอียด': stripHtmlToText(row.detail || '')
    });
  });

  if (rows.length === 0) {
    Swal.fire({ icon: 'info', title: 'ไม่มีงานในเดือนนี้ให้ export' });
    return;
  }

  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 16 }, { wch: 30 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'งาน');
  exportWorkbookViaNewTab(wb, 'C2Calendar_' + monthLabel.replace(/\s/g, '_') + '.xlsx');
  Toast.fire({ icon: 'success', title: 'Export สำเร็จ (' + rows.length + ' งาน)' });
}

// ===== เอฟเฟกต์สไลด์/ครอสเฟดตอนเปลี่ยนเดือน/มุมมองปฏิทิน (Item 5) - ทำแบบ sequential fade เท่านั้น
// (ใส่คลาส exit -> รอจบ transition -> เรียก FullCalendar API จริง -> ใส่คลาส enter -> ลบออก) ไม่โคลน/ครอบ
// DOM ภายในของ FullCalendar เอง จึงไม่กระทบ event listener ของปฏิทิน (คลิกวัน/ลากงาน ฯลฯ ยังทำงานปกติ) =====
function _calPrefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function _calSwapRun(exitClass, enterFromClass, action) {
  var el = document.getElementById('calendar');
  if (!el || _calPrefersReducedMotion()) { action(); return; }
  el.classList.add(exitClass);
  var done = false;
  function proceed() {
    if (done) return;
    done = true;
    el.removeEventListener('transitionend', proceed);
    action();
    // ตั้งสถานะเริ่มต้นฝั่งตรงข้ามแบบไม่มี transition ก่อน แล้วค่อยลบในเฟรมถัดไปเพื่อ trigger อนิเมชันเข้า
    el.classList.remove(exitClass);
    el.classList.add('cal-no-anim', enterFromClass);
    void el.offsetWidth; // force reflow
    requestAnimationFrame(function () {
      el.classList.remove('cal-no-anim');
      requestAnimationFrame(function () { el.classList.remove(enterFromClass); });
    });
  }
  el.addEventListener('transitionend', proceed);
  setTimeout(proceed, 280); // fallback กันเคส transitionend ไม่ยิง (เช่น element ถูกซ่อนกลางทาง)
}
// สลับเดือน/สัปดาห์/วัน แบบมีทิศทาง (next = ออกทางซ้าย เข้าทางขวา, prev = กลับกัน)
function calendarNavigate(dir) {
  if (!calendarInstance) return;
  var exit = dir === 'next' ? 'cal-exit-fwd' : 'cal-exit-back';
  var enterFrom = dir === 'next' ? 'cal-exit-back' : 'cal-exit-fwd';
  _calSwapRun(exit, enterFrom, function () { calendarInstance[dir](); });
}
// สลับมุมมอง (เดือน/สัปดาห์/วัน/รายการ/รายปี) แบบไม่มีทิศทาง ใช้ครอสเฟด+ย่อขนาดเล็กน้อยแทน
function calendarSwapView(changeFn) {
  _calSwapRun('cal-exit-fade', 'cal-exit-fade', changeFn);
}
// ดักคลิกปุ่ม prev/next/today/สลับมุมมองในแถบเครื่องมือของ FullCalendar เอง (headerToolbar) ด้วย capturing
// listener ที่ #calendar-wrap แล้ว stopPropagation กันไม่ให้ click handler เดิมของ FullCalendar ทำงานซ้ำ
// จากนั้นเรียก API ตัวเดียวกัน (prev()/next()/changeView()/today()) เองแทน แค่ห่อด้วยเอฟเฟกต์สไลด์/ครอสเฟด
// ก่อน - ไม่ได้แก้/แทนที่ปุ่มหรือ DOM ของ FullCalendar เลย จึงไม่กระทบการทำงานภายในของมัน
function setupCalendarSwapEffect() {
  var wrap = document.getElementById('calendar-wrap');
  if (!wrap || wrap._calSwapBound) return;
  wrap._calSwapBound = true;
  var viewBtnMap = {
    'fc-dayGridMonth-button': 'dayGridMonth',
    'fc-timeGridWeek-button': 'timeGridWeek',
    'fc-timeGridDay-button': 'timeGridDay',
    'fc-multiMonthYear-button': 'multiMonthYear'
  };
  wrap.addEventListener('click', function (e) {
    if (!calendarInstance) return;
    var btn = e.target.closest(
      '.fc-prev-button, .fc-next-button, .fc-today-button, .fc-dayGridMonth-button, ' +
      '.fc-timeGridWeek-button, .fc-timeGridDay-button, .fc-multiMonthYear-button'
    );
    if (!btn || !wrap.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.classList.contains('fc-prev-button')) { calendarNavigate('prev'); return; }
    if (btn.classList.contains('fc-next-button')) { calendarNavigate('next'); return; }
    if (btn.classList.contains('fc-today-button')) { calendarSwapView(function () { calendarInstance.today(); }); return; }
    for (var cls in viewBtnMap) {
      if (btn.classList.contains(cls)) {
        (function (viewType) {
          calendarSwapView(function () { calendarInstance.changeView(viewType); });
        })(viewBtnMap[cls]);
        return;
      }
    }
  }, true);
}

function toggleCalendarViewMode() {
  if (!calendarInstance) return;
  // แก้ให้รองรับ view.type เป็น listDay/listWeek ได้ด้วย (ไม่ใช่แค่ listMonth เดิม) เพราะตอนนี้มุมมอง List
  // มีแถบสลับช่วงย่อยแล้ว (ดู setListRange) - เดิมเช็คแค่ 'listMonth' ตรงๆ ทำให้กดสลับตอนอยู่ listWeek/listDay
  // แล้วได้ 'listMonth' (list) ซ้ำแทนที่จะกลับไปมุมมองเดือนแบบตาราง (dayGridMonth) ตามที่ตั้งใจ
  var isCurrentlyList = calendarInstance.view.type.indexOf('list') === 0;
  var newView = isCurrentlyList ? 'dayGridMonth' : 'listMonth';
  calendarSwapView(function () {
    calendarInstance.changeView(newView);
    localStorage.setItem(CALENDAR_VIEW_PREF_KEY, newView);
    updateViewToggleLabel(newView);
    // หมายเหตุ: ไม่ต้องเรียก reverseListViewDayOrder() ซ้ำตรงนี้ — changeView() ทำให้ eventsSet
    // ของปฏิทิน (ที่ผูก reverseListViewDayOrder ไว้แล้ว) ยิงเองอยู่แล้ว เรียกซ้ำจะกลายเป็นสลับ 2 ครั้ง
    // (สลับแล้วสลับกลับ) ทำให้ list กลับไปเรียงแบบเดิม (เก่า->ใหม่) เหมือนไม่ได้แก้อะไรเลย — นี่คือบั๊กที่พบ
  });
}

// ===== สลับลำดับปฏิทินมุมมอง List ให้วันล่าสุดอยู่บนสุด =====
// FullCalendar (ปลั๊กอิน List) ไม่มีตัวเลือกให้เรียงจากใหม่ไปเก่าในตัว เรียงเก่า->ใหม่เสมอ
// ฟังก์ชันนี้จึงสลับตำแหน่งกลุ่ม "วัน" (tr.fc-list-day + แถวงานของวันนั้น) ใน DOM หลัง render เสร็จ
// โดยไม่แตะลำดับงานภายในวันเดียวกัน (เวลาเช้า->เย็นยังเรียงปกติ) และไม่ลบ/สร้าง element ใหม่
// (แค่ appendChild ย้ายตำแหน่ง) เพื่อไม่ให้ event listener ของ FullCalendar ที่ผูกกับแถวหลุด
function reverseListViewDayOrder() {
  if (!calendarInstance || calendarInstance.view.type.indexOf('list') !== 0) return;
  var calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  var tbody = calendarEl.querySelector('.fc-list-table tbody');
  if (!tbody) return;

  var rows = Array.prototype.slice.call(tbody.children);
  var groups = [];
  var current = null;
  rows.forEach(function (row) {
    if (row.classList.contains('fc-list-day')) {
      current = [row];
      groups.push(current);
    } else if (current) {
      current.push(row);
    } else {
      // กันเคสแปลกที่มีแถวไม่มี day header นำหน้า (ไม่ควรเกิดกับโครงสร้างของ FullCalendar ปกติ)
      groups.push([row]);
    }
  });

  groups.reverse();
  var frag = document.createDocumentFragment();
  groups.forEach(function (g) {
    g.forEach(function (row) { frag.appendChild(row); });
  });
  tbody.appendChild(frag);
}

function updateViewToggleLabel(viewType) {
  var label = document.getElementById('mfn-view-toggle-label');
  if (!label) return;
  // เช็คด้วย indexOf('list') แทนการเทียบ 'listMonth' ตรงๆ ด้วยเหตุผลเดียวกับ toggleCalendarViewMode ด้านบน
  // (ตอนนี้มุมมอง List มีทั้ง listDay/listWeek/listMonth ไม่ใช่แค่ listMonth เดิม)
  label.textContent = viewType.indexOf('list') === 0 ? 'ดูเดือน' : 'ดูรายการ';
}

// ================================================================================
// ===== Phase: มุมมองปฏิทินมือถือ อ่านง่ายขึ้น (คุยกับผู้ใช้แล้วเลือกแนวทางนี้) ===================
// ================================================================================

// ===== แถบสลับช่วงของมุมมอง List (วันนี้/สัปดาห์นี้/เดือนนี้) — โชว์เฉพาะตอนอยู่มุมมอง List บนมือถือ
// (PC มีปุ่มสลับมุมมองจริงอยู่แล้วในแถบเครื่องมือด้านบน ไม่ต้องมีแถบซ้ำอีกชั้น) =====
function updateListRangeToggle(viewType) {
  var bar = document.getElementById('list-range-toggle');
  if (!bar) return;
  var show = isMobileView() && viewType.indexOf('list') === 0;
  bar.classList.toggle('show', show);
  if (!show) return;
  bar.querySelectorAll('button').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-range') === viewType);
  });
}

function setListRange(viewType) {
  if (!calendarInstance) return;
  // แก้บั๊ก: เดิมเรียก changeView(viewType) เฉยๆ ซึ่งแค่เปลี่ยน "ชนิด" มุมมอง แต่ยังค้างอยู่ที่วันที่เดิม
  // ที่ปฏิทินกำลังเลื่อนดูอยู่ (ไม่ใช่วันปัจจุบัน) ผู้ใช้กด "วันนี้/สัปดาห์นี้/เดือนนี้" คาดหวังว่าจะกระโดด
  // ไปที่ปัจจุบันเลยตามชื่อปุ่ม จึงต้องส่ง new Date() เป็นพารามิเตอร์ที่ 2 ให้ changeView() นำทางไปพร้อมกัน
  // ในการเรียกครั้งเดียว (ตามที่ FullCalendar API รองรับ) แทนที่จะแค่เปลี่ยนชนิดมุมมองอย่างเดียว
  calendarSwapView(function () {
    calendarInstance.changeView(viewType, new Date());
    // จำไว้เป็นค่า pref เดียวกับปุ่มสลับหลัก (มุมมอง List/เดือน) เพื่อให้เปิดแอปครั้งถัดไปกลับมาที่ช่วงเดิม
    localStorage.setItem(CALENDAR_VIEW_PREF_KEY, viewType);
    updateViewToggleLabel(viewType);
  });
}

// ===== เติมแถว "ไม่มีงาน" ให้วันที่ไม่มีงานเลยในมุมมอง List — เฉพาะ listDay/listWeek (ช่วงสั้น นับวันได้ไม่กี่วัน)
// ไม่ทำกับ listMonth เพราะอาจมีวันว่างเป็นสิบวันต่อเดือน จะรกเกินไป — FullCalendar เองไม่มีตัวเลือกให้โชว์
// วันว่างในมุมมอง List (ข้ามวันที่ไม่มี event ไปเลยโดยดีไซน์) จึงต้องแทรกแถวปลอมเข้าไปในตารางเองหลัง render
// เสร็จแล้ว (เรียกจาก eventsSet ต่อจาก reverseListViewDayOrder เสมอ เพื่อให้ทำงานกับลำดับที่ reverse แล้ว) =====
function fillEmptyListDays() {
  if (!calendarInstance) return;
  var view = calendarInstance.view;
  if (view.type !== 'listDay' && view.type !== 'listWeek') return;

  var calendarEl = document.getElementById('calendar');
  var tbody = calendarEl && calendarEl.querySelector('.fc-list-table tbody');
  if (!tbody) return;

  // ล้างแถวว่างเก่าที่แทรกไว้รอบก่อนหน้าออกก่อนเสมอ กันแทรกซ้ำซ้อนเวลา eventsSet ยิงซ้ำ (เปลี่ยนตัวกรอง ฯลฯ)
  tbody.querySelectorAll('.fc-list-day-empty').forEach(function (row) { row.remove(); });

  var existingDates = {};
  tbody.querySelectorAll('.fc-list-day').forEach(function (row) {
    var d = row.getAttribute('data-date');
    if (d) existingDates[d] = true;
  });

  var WEEKDAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var MONTH_TH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // currentEnd เป็น exclusive (มาตรฐาน FullCalendar) จึงวนแค่ < currentEnd ไม่รวมวันนั้น
  var cursor = new Date(view.currentStart.getFullYear(), view.currentStart.getMonth(), view.currentStart.getDate());
  var endDate = view.currentEnd;
  var missingRows = [];
  while (cursor < endDate) {
    var dateStr = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
    if (!existingDates[dateStr]) {
      var headRow = document.createElement('tr');
      headRow.className = 'fc-list-day fc-list-day-empty';
      headRow.setAttribute('data-date', dateStr);
      var isToday = new Date().toDateString() === cursor.toDateString();
      headRow.innerHTML = '<th colspan="3"><div class="fc-list-day-cushion">' +
        '<span>' + WEEKDAY_TH[cursor.getDay()] + ' ' + cursor.getDate() + ' ' + MONTH_TH_SHORT[cursor.getMonth()] +
        (isToday ? ' · วันนี้' : '') + '</span></div></th>';
      var emptyRow = document.createElement('tr');
      emptyRow.className = 'fc-list-day-empty';
      emptyRow.innerHTML = '<td colspan="3">ไม่มีงาน</td>';
      missingRows.push({ date: dateStr, rows: [headRow, emptyRow] });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (missingRows.length === 0) return;

  // จัดกลุ่มแถวที่มีอยู่แล้ว (จริง) ตาม data-date เดิม เพื่อเอาไปเรียงรวมกับแถววันว่างที่สร้างใหม่
  var existingGroups = [];
  var current = null;
  Array.prototype.slice.call(tbody.children).forEach(function (row) {
    if (row.classList.contains('fc-list-day')) {
      current = { date: row.getAttribute('data-date'), rows: [row] };
      existingGroups.push(current);
    } else if (current) {
      current.rows.push(row);
    }
  });

  var allGroups = existingGroups.concat(missingRows);
  // เรียงใหม่-ไปเก่า ให้ตรงกับพฤติกรรม reverseListViewDayOrder ที่ทำกับแถวจริงไปแล้วก่อนหน้านี้
  allGroups.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });

  var frag = document.createDocumentFragment();
  allGroups.forEach(function (g) { g.rows.forEach(function (row) { frag.appendChild(row); }); });
  tbody.appendChild(frag);
}

// ===== Bottom sheet "+N เพิ่มเติม" ของมุมมองเดือนบนมือถือ (แนวทาง 1) =====
var TASK_TYPE_DOT_COLOR = { meeting: '#FCE38A', onsite: '#FFB48A', event: '#C9A6FF', leave: '#E5E7EB' };
function openDaySheet(date, events) {
  var overlay = document.getElementById('day-sheet-overlay');
  var titleEl = document.getElementById('day-sheet-title');
  var listEl = document.getElementById('day-sheet-list');
  if (!overlay || !titleEl || !listEl) return;

  var WEEKDAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var MONTH_TH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  titleEl.textContent = 'วัน' + WEEKDAY_TH[date.getDay()] + ' ' + date.getDate() + ' ' + MONTH_TH_FULL[date.getMonth()] +
    ' ' + (date.getFullYear() + 543) + ' · ' + events.length + ' งาน';

  var sorted = events.slice().sort(function (a, b) {
    var ta = a.start ? a.start.getTime() : 0, tb = b.start ? b.start.getTime() : 0;
    return ta - tb;
  });

  if (sorted.length === 0) {
    listEl.innerHTML = '<div class="day-sheet-empty">ไม่มีงาน</div>';
  } else {
    listEl.innerHTML = sorted.map(function (ev, idx) {
      var timeText = (!ev.allDay && ev.start) ? ev.start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'ทั้งวัน';
      var dotColor = TASK_TYPE_DOT_COLOR[ev.extendedProps.taskType] || '#ccc';
      return '<div class="day-sheet-item" data-idx="' + idx + '">' +
        '<span class="ds-time">' + timeText + '</span>' +
        '<span class="ds-dot" style="background:' + dotColor + '"></span>' +
        '<span class="ds-title">' + escapeHtmlPtb(ev.title) + '</span>' +
        '</div>';
    }).join('');
    Array.prototype.slice.call(listEl.querySelectorAll('.day-sheet-item')).forEach(function (row, idx) {
      row.addEventListener('click', function () {
        closeDaySheet();
        openTaskDetailModal(sorted[idx]);
      });
    });
  }

  overlay.classList.add('show');
}
function closeDaySheet() {
  var overlay = document.getElementById('day-sheet-overlay');
  if (overlay) overlay.classList.remove('show');
}

// ===== Dashboard สรุปงาน (Admin/CEO) =====
var dashboardChartDaily = null;
var dashboardChartType = null;

function onDashboardPeriodChange() {
  var isCustom = document.getElementById('dashboard-period').value === 'custom';
  document.getElementById('dashboard-custom-range').style.display = isCustom ? 'inline-flex' : 'none';
  if (!isCustom) loadDashboardData();
}

function openDashboardModal() {
  document.getElementById('dashboard-modal-overlay').style.display = 'flex';
  loadDashboardData();
  _pushModalNav('dashboard-modal-overlay');
}

function closeDashboardModal() {
  document.getElementById('dashboard-modal-overlay').style.display = 'none';
}

// คำนวณช่วงวันที่ของงวดปัจจุบันและงวดก่อนหน้า (สำหรับเทียบเทรนด์) จาก period ที่เลือก
function getDashboardRanges(period) {
  var now = new Date();
  var curStart, curEnd, prevStart, prevEnd, label;

  if (period === 'custom') {
    var startVal = document.getElementById('dashboard-custom-start').value;
    var endVal = document.getElementById('dashboard-custom-end').value;
    if (!startVal || !endVal) {
      // ยังไม่ได้เลือกวันที่ครบ ใช้เดือนนี้ไปพลางๆก่อน
      curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else {
      curStart = new Date(startVal + 'T00:00:00');
      curEnd = new Date(endVal + 'T00:00:00');
      curEnd.setDate(curEnd.getDate() + 1); // รวมวันสิ้นสุดด้วย (exclusive end)
    }
    // ช่วงกำหนดเองไม่มีงวดก่อนหน้าให้เทียบ (ความยาวช่วงไม่แน่นอน) ใช้ช่วงเดียวกันไปเปรียบเทียบกับตัวเอง = ไม่มีเทรนด์
    prevStart = curStart; prevEnd = curStart;
    label = curStart.toLocaleDateString('th-TH') + ' - ' + new Date(curEnd - 86400000).toLocaleDateString('th-TH');
    return { curStart: curStart, curEnd: curEnd, prevStart: prevStart, prevEnd: prevEnd, label: label };
  }

  if (period === 'week') {
    var day = now.getDay(); // 0=อาทิตย์
    curStart = new Date(now); curStart.setDate(now.getDate() - day); curStart.setHours(0, 0, 0, 0);
    curEnd = new Date(curStart); curEnd.setDate(curStart.getDate() + 7);
    prevStart = new Date(curStart); prevStart.setDate(curStart.getDate() - 7);
    prevEnd = new Date(curStart);
    label = 'สัปดาห์นี้ (' + curStart.toLocaleDateString('th-TH') + ' - ' +
      new Date(curEnd - 86400000).toLocaleDateString('th-TH') + ')';
  } else {
    curStart = new Date(now.getFullYear(), now.getMonth(), 1);
    curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = curStart;
    label = curStart.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  }
  return { curStart: curStart, curEnd: curEnd, prevStart: prevStart, prevEnd: prevEnd, label: label };
}

// กรองงานจาก lastTaskDocs ที่โหลดไว้แล้ว (ไม่ยิง API ใหม่) ตามช่วงวันที่ที่กำหนด
function filterTasksByRange(start, end) {
  var result = [];
  lastTaskDocs.forEach(function (docSnap) {
    var row = docSnap.data();
    if (row.isUndated || !row.startDateTime || row.status === 'ยกเลิกงาน') return;
    var taskStart = firestoreDateToJs(row.startDateTime);
    if (taskStart >= start && taskStart < end) result.push({ id: docSnap.id, data: row, start: taskStart });
  });
  return result;
}

function trendBadge(cur, prev) {
  if (prev === 0) return cur > 0 ? '<span class="trend-up">ใหม่</span>' : '';
  var diff = cur - prev;
  var pct = Math.round((diff / prev) * 100);
  if (diff === 0) return '<span class="trend-flat">±0%</span>';
  return diff > 0
    ? '<span class="trend-up">▲ ' + pct + '%</span>'
    : '<span class="trend-down">▼ ' + Math.abs(pct) + '%</span>';
}

function loadDashboardData() {
  var period = document.getElementById('dashboard-period').value;
  var ranges = getDashboardRanges(period);
  var curTasks = filterTasksByRange(ranges.curStart, ranges.curEnd);
  var prevTasks = filterTasksByRange(ranges.prevStart, ranges.prevEnd);
  var showTrend = period !== 'custom'; // ช่วงกำหนดเองไม่มีงวดก่อนหน้าให้เทียบจริง ไม่โชว์เทรนด์กันหลอกตา

  // ===== การ์ดสรุป (พร้อมเทรนด์เทียบงวดก่อน) =====
  var typeKeys = ['meeting', 'onsite', 'event', 'leave'];
  var curByType = {}, prevByType = {};
  typeKeys.forEach(function (t) { curByType[t] = 0; prevByType[t] = 0; });
  curTasks.forEach(function (t) { curByType[t.data.taskType] = (curByType[t.data.taskType] || 0) + 1; });
  prevTasks.forEach(function (t) { prevByType[t.data.taskType] = (prevByType[t.data.taskType] || 0) + 1; });

  var cardsHtml = '<div class="dash-card"><p class="dash-num">' + curTasks.length + '</p>' +
    '<p class="dash-label">งานทั้งหมด</p>' + (showTrend ? trendBadge(curTasks.length, prevTasks.length) : '') + '</div>';
  typeKeys.forEach(function (t) {
    cardsHtml += '<div class="dash-card"><p class="dash-num">' + curByType[t] + '</p>' +
      '<p class="dash-label">' + (TASK_TYPE_LABELS[t] || t) + '</p>' +
      (showTrend ? trendBadge(curByType[t], prevByType[t]) : '') + '</div>';
  });
  document.getElementById('dashboard-cards').innerHTML = cardsHtml;

  // ===== กราฟแท่ง: จำนวนงานต่อวัน =====
  var dayCount = {};
  curTasks.forEach(function (t) {
    var key = t.start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    dayCount[key] = (dayCount[key] || 0) + 1;
  });
  var dayLabels = Object.keys(dayCount);
  if (dashboardChartDaily) dashboardChartDaily.destroy();
  dashboardChartDaily = new Chart(document.getElementById('dashboard-chart-daily'), {
    type: 'bar',
    data: { labels: dayLabels, datasets: [{ label: 'จำนวนงาน', data: dayLabels.map(function (k) { return dayCount[k]; }), backgroundColor: '#059669' }] },
    options: { responsive: true, plugins: { title: { display: true, text: 'จำนวนงานต่อวัน' } } }
  });

  // ===== กราฟวงกลม: สัดส่วนประเภทงาน =====
  if (dashboardChartType) dashboardChartType.destroy();
  dashboardChartType = new Chart(document.getElementById('dashboard-chart-type'), {
    type: 'doughnut',
    data: {
      labels: typeKeys.map(function (t) { return TASK_TYPE_LABELS[t] || t; }),
      datasets: [{ data: typeKeys.map(function (t) { return curByType[t]; }), backgroundColor: typeKeys.map(getTaskTypeColor) }]
    },
    options: { responsive: true, plugins: { title: { display: true, text: 'สัดส่วนประเภทงาน' } } }
  });

  // ===== ตารางภาระงาน (CEO + Staff เท่านั้น ไม่รวม Admin) =====
  var workload = {};
  curTasks.forEach(function (t) {
    (t.data.staffIds || []).forEach(function (id) {
      var s = staffMapCache[id];
      if (!s || s.role === 'admin') return;
      workload[id] = (workload[id] || 0) + 1;
    });
  });
  var sorted = Object.keys(workload).sort(function (a, b) { return workload[b] - workload[a]; });
  var tableHtml = '<table class="dash-workload-table"><tr><th>ชื่อ</th><th>จำนวนงาน</th></tr>';
  if (sorted.length === 0) tableHtml += '<tr><td colspan="2">ไม่มีข้อมูล</td></tr>';
  sorted.forEach(function (id) {
    var s = staffMapCache[id];
    tableHtml += '<tr><td>' + s.firstName + ' ' + s.lastName + '</td><td>' + workload[id] + '</td></tr>';
  });
  tableHtml += '</table>';
  document.getElementById('dashboard-workload-table').innerHTML = tableHtml;

  // เก็บไว้ใช้ตอนพิมพ์รายงาน (curByType เพิ่มมาให้รายงานสรุป exec ใช้ทำโดนัทสัดส่วนประเภทงาน)
  window._dashboardPrintData = { ranges: ranges, curTasks: curTasks, workload: workload, sorted: sorted, curByType: curByType };
}

// ===== พิมพ์รายงาน (เปิด print dialog ของเบราว์เซอร์ ให้ Save เป็น PDF ได้เอง) =====

function printDashboardReport() {
  var d = window._dashboardPrintData;
  if (!d) return;

  // โดนัทสัดส่วนประเภทงาน (ปฏิทินหลักไม่มีสถานะ เสร็จแล้ว/กำลังทำ/ต้องทำ แบบ Personal Task Board มีแต่ประเภทงาน
  // meeting/onsite/event/leave จึงใช้ตัวนี้แทนเป็นแกนโดนัทของรายงาน Dashboard)
  var typeKeys = ['meeting', 'onsite', 'event', 'leave'];
  var donutSegments = typeKeys.map(function (t) {
    return { label: (TASK_TYPE_LABELS[t] || t).replace(/\s*\(.*\)/, ''), count: (d.curByType && d.curByType[t]) || 0, color: getTaskTypeColor(t) };
  }).filter(function (seg) { return seg.count > 0; }); // ไม่โชว์ประเภทที่ไม่มีงานเลยกันโดนัทรก
  if (donutSegments.length === 0) donutSegments = [{ label: 'ไม่มีงาน', count: 0, color: '#E5E7EB' }];
  var donutTotal = donutSegments.reduce(function (s, x) { return s + x.count; }, 0);
  var topSeg = donutSegments.reduce(function (a, b) { return b.count > a.count ? b : a; }, donutSegments[0]);

  var workload = d.sorted.map(function (id) {
    var s = staffMapCache[id];
    return { name: s ? (s.firstName + ' ' + s.lastName) : id, count: d.workload[id], color: s ? s.colorHex : '#9AA1A8' };
  }).slice(0, 8);

  // งานที่ใกล้ถึงเร็วๆ นี้ในช่วงที่เลือก (จำกัด 7 วันข้างหน้า ให้สอดคล้องกับฝั่ง Task Board) - ปฏิทินหลักเป็น
  // กำหนดการ ไม่ใช่ deadline จึงไม่มีแนวคิด "เกินกำหนด" แบบ Task Board จึง rightWarning เป็น null เสมอ (โชว์กล่อง
  // เขียวแทนอัตโนมัติจาก execReportHtml) - เพิ่ม "who" จาก t.data.staffIds resolve ผ่าน staffMapCache
  var todayOnly2 = new Date(); todayOnly2.setHours(0, 0, 0, 0);
  var upcoming7d = d.curTasks.slice().filter(function (t) { return t.start >= todayOnly2; })
    .sort(function (a, b) { return a.start - b.start; })
    .map(function (t) {
      var due = new Date(t.start); due.setHours(0, 0, 0, 0);
      var diffDays = Math.round((due - todayOnly2) / 86400000);
      return { t: t, diffDays: diffDays };
    })
    .filter(function (x) { return x.diffDays <= 7; })
    .slice(0, 6)
    .map(function (x) {
      var t = x.t;
      var who = (t.data.staffIds || []).map(function (id) {
        var s = staffMapCache[id];
        return s ? (s.firstName + ' ' + s.lastName) : id;
      }).join(', ');
      var badge = x.diffDays === 0 ? 'วันนี้' : (x.diffDays === 1 ? 'พรุ่งนี้' : 'อีก ' + x.diffDays + ' วัน');
      var badgeBg = x.diffDays <= 1 ? '#FEF0E1' : (x.diffDays <= 3 ? '#FEF3E0' : '#EEF6F1');
      var badgeTextColor = x.diffDays <= 1 ? '#C2540A' : (x.diffDays <= 3 ? '#B45309' : '#3F654D');
      return { title: t.data.taskName, who: who, badge: badge, badgeBg: badgeBg, badgeTextColor: badgeTextColor };
    });

  var html = execReportHtml({
    periodLabel: 'Dashboard — ' + d.ranges.label,
    dateRangeLabel: d.ranges.label,
    totalLabel: 'งานทั้งหมด',
    donutSegments: donutSegments,
    donutSectionTitle: 'สัดส่วนประเภทงาน',
    donutCenterPct: donutTotal > 0 ? Math.round(topSeg.count / donutTotal * 100) : 0,
    donutCenterSub: topSeg.label,
    workload: workload,
    rightWarning: null,
    upcomingTitle: '🗓️ งานที่ใกล้จะถึง — 7 วันข้างหน้า',
    upcomingItems: upcoming7d,
    generatedAtLabel: fmtGeneratedAtLabel()
  });

  // สร้างและพิมพ์จากแท็บใหม่แทน window.print() ในเฟรมเดิม (ดูเหตุผลที่ exportWorkbookViaNewTab ด้านบน) -
  // ฟังก์ชันนี้ไม่มีการรอ API ก่อน จึงยังเปิดแท็บใหม่ได้ตรงๆ แบบ synchronous จาก click ปุ่ม
  openExecReportInNewTab(html);
}

// ===== เมนู More (มือถือ) - ดีไซน์แบบ minimal grouped list (Concept C ที่เลือกไว้) แบ่งเป็นกลุ่มการ์ด
// พื้นหลัง var(--surface-alt) แต่ละกลุ่ม, ไอคอนนำหน้าทุกรายการ, ปุ่มออกจากระบบแยกกลุ่มสีแดงชัดเจน
// หมายเหตุ: เมนู "การแจ้งเตือน" (ประวัติ) ถูกเอาออกจากที่นี่ตามที่ขอ - เข้าถึงได้จากปุ่ม "ดูประวัติ" ในหน้า
// "ตั้งค่าการแจ้งเตือน" แทน (มือถือไม่มีกระดิ่งบน topbar เพราะซ่อนไว้ - ดู #topbar-right ใน style.css) =====
function mmItem(icon, label, fn, extraClass, badge) {
  return '<button class="mm-item' + (extraClass ? ' ' + extraClass : '') + '" onclick="closeMoreMenu(); ' + fn + '">' +
    '<span class="mm-ic">' + icon + '</span><span class="mm-meta">' + label + '</span>' +
    (badge ? '<span class="mm-badge">' + badge + '</span>' : '') +
    '</button>';
}

function openMoreMenu() {
  closeAllDrawers();
  var role = localStorage.getItem(ROLE_KEY);
  var name = localStorage.getItem(NAME_KEY);
  var container = document.getElementById('more-menu-list');
  var nameEl = document.getElementById('more-menu-name');
  // ปุ่มธีมกดแล้วไม่ปิดเมนู (เรียก openMoreMenu() ซ้ำหลัง cycleTheme() เพื่อ re-render label/ไอคอนให้ตรงสถานะใหม่ทันที)
  var themeItem = '<button class="mm-item" onclick="cycleTheme(); openMoreMenu();">' +
    '<span class="mm-ic">' + THEME_META[getThemePref()].icon + '</span>' +
    '<span class="mm-meta">' + THEME_META[getThemePref()].label + '</span></button>';
  var refreshItem = mmItem('🔄', 'รีเฟรชข้อมูล', 'mobileRefreshFromMenu();');

  if (!localStorage.getItem(TOKEN_KEY)) {
    nameEl.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--text)">ยังไม่ได้เข้าสู่ระบบ</div>';
    container.innerHTML = '<div class="mm-group">' + refreshItem + themeItem + '</div>' +
      '<div class="mm-group">' + mmItem('🔑', 'เข้าสู่ระบบ', 'openLoginModal();') + '</div>';
  } else {
    var initial = (name || '?').trim().charAt(0).toUpperCase();
    // แก้บั๊ก: เดิมใส่ initial/name ลง innerHTML ตรงๆ ไม่ escape (name มาจากชื่อเต็มที่แอดมินตั้งให้ ซึ่ง
    // เป็นข้อความอิสระ) ถ้ามีอักขระ < หรือ " ปนอยู่ อาจกลายเป็น HTML ที่ render จริงในเมนูของผู้ใช้คนนั้นเอง -
    // escapeHtmlPtb() ตัวเดียวกับที่ใช้ทั่วแอปอยู่แล้ว (เช่น Personal Task Board)
    nameEl.innerHTML = '<div id="more-menu-name-row">' +
      '<div id="more-menu-avatar">' + escapeHtmlPtb(initial) + '</div>' +
      '<div><div id="more-menu-name-text">' + escapeHtmlPtb(name || '') + '</div>' +
      '<span class="mm-role-pill">⭐ ' + escapeHtmlPtb(ROLE_LABELS[role] || role) + '</span></div></div>';

    var groups = [];
    groups.push(refreshItem + themeItem);

    var group2 = mmItem('👤', 'โปรไฟล์', 'openProfileModal();') +
      mmItem('⚙️', 'ตั้งค่าการแจ้งเตือน', 'openNotifSettingsModal();');
    groups.push(group2);

    var group3 = '';
    if (role === 'admin') {
      group3 += mmItem('🧑‍💼', 'บัญชีผู้ใช้', 'openStaffModal();');
      group3 += mmItem('📆', 'วันหยุด', 'openHolidayModal();');
    }
    if (role === 'admin' || role === 'ceo') {
      group3 += mmItem('📊', 'Dashboard สรุปงาน', 'openDashboardModal();');
      group3 += mmItem('📥', 'Export Excel (เดือนที่ดูอยู่)', 'exportMonthToExcel();');
    }
    if (group3) groups.push(group3);

    groups.push(mmItem('🚪', 'ออกจากระบบ', 'doLogout();', 'danger'));

    container.innerHTML = groups.map(function (g) { return '<div class="mm-group">' + g + '</div>'; }).join('');
  }

  document.getElementById('more-menu-overlay').classList.add('show');
}

function mobileRefreshFromMenu() {
  Toast.fire({ icon: 'info', title: 'กำลังรีเฟรช...' });
  var token = localStorage.getItem(TOKEN_KEY);
  var role = localStorage.getItem(ROLE_KEY);
  Promise.all([
    loadHolidays(),
    loadMemberSidebar(),
    loadTodoList()
  ]).then(function () {
    if (token) { loadAdminEvents(token); } else { loadPublicEvents(); }
    Toast.fire({ icon: 'success', title: 'รีเฟรชข้อมูลแล้ว' });
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'รีเฟรชไม่สำเร็จ', text: err.message });
  });
}

function closeMoreMenu() {
  document.getElementById('more-menu-overlay').classList.remove('show');
}

// ===== Staff: ขอลบงาน =====
function requestDeleteTaskConfirm(taskId) {
  Swal.fire({
    title: 'ส่งคำขอลบงานนี้?',
    input: 'text', inputPlaceholder: 'เหตุผล (ไม่บังคับ)',
    html: '<div class="td-warning-banner" style="text-align:left;justify-content:flex-start">⚠️ Admin จะต้องอนุมัติก่อนงานถึงจะถูกลบจริง</div>',
    showCancelButton: true, confirmButtonText: 'ส่งคำขอ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    Toast.fire({ icon: 'info', title: 'กำลังส่งคำขอ...' });
    callApi('requestDeleteTask', { token: token, taskId: taskId, reason: res.value || '' }).then(function (result) {
      if (result.success) {
        Toast.fire({ icon: 'success', title: 'ส่งคำขอลบงานแล้ว รออนุมัติจาก Admin' });
      } else {
        Swal.fire({ icon: 'error', title: 'ส่งคำขอไม่สำเร็จ', text: result.message });
      }
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    });
  });
}

// ===== Modal ดูรายละเอียดงาน (กดที่งานในปฏิทิน) =====
// ===== ระบบคอมเมนต์ในการ์ดงาน - subscribe เฉพาะตอน modal เปิดอยู่ ต้อง unsubscribe ทุกครั้งที่ปิด modal
// (กันบั๊กแบบเดียวกับ listener แจ้งเตือนที่เคยรั่วข้ามบัญชี - ดู _unsubNotifications ด้านบน) =====
var _tdCommentsUnsub = null;
var _tdCurrentTaskId = null;

function closeTaskDetailModal() {
  document.getElementById('task-detail-modal-overlay').style.display = 'none';
  document.getElementById('td-map').style.display = 'none';
  if (_tdCommentsUnsub) { _tdCommentsUnsub(); _tdCommentsUnsub = null; }
  _tdCurrentTaskId = null;
  closeGlobalKebabMenu();
  _cmtEditingId = null;
  document.getElementById('td-cmt-toggle').classList.remove('open');
  document.getElementById('td-cmt-body').classList.remove('open');
}

function toggleTaskCommentsSection() {
  document.getElementById('td-cmt-toggle').classList.toggle('open');
  document.getElementById('td-cmt-body').classList.toggle('open');
}

function subscribeTaskComments(taskId) {
  if (_tdCommentsUnsub) { _tdCommentsUnsub(); _tdCommentsUnsub = null; }
  _tdCommentsUnsub = fbDb.collection('tasks').doc(taskId).collection('comments')
    .orderBy('createdAt', 'asc')
    .onSnapshot(function (snapshot) {
      // กันเคส: modal ถูกปิด/เปิดงานอื่นไปแล้วระหว่างที่ callback นี้ยังไม่ทันมา (race condition) -
      // เช็คว่ายังเป็นงานเดียวกับที่ modal เปิดอยู่จริงก่อนเขียนลง DOM
      if (_tdCurrentTaskId !== taskId) return;
      renderTaskComments(snapshot.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
    }, function (err) {
      console.error('subscribeTaskComments error', err);
    });
}

// ===== แก้ไข/ลบคอมเมนต์ (Design A - เมนู kebab ⋮) - ใช้ร่วมกันทั้ง Task หลักและ Personal Task Board
// เพราะทั้ง 2 ระบบใช้คลาส .td-cmt-* เดียวกันหมด ยืนยันกับผู้ใช้แล้ว: เจ้าของคอมเมนต์เท่านั้นที่แก้ไข/ลบได้
// ทั้งแก้ไขและลบทำได้ตลอดเวลาไม่จำกัด (ปรับจากเดิมที่เคยจำกัดลบแค่ 30 นาที) ลบแบบ soft-delete โชว์สไตล์
// LINE (ชื่อผู้คอมเมนต์ยังอยู่ + ข้อความ "ได้ลบข้อความนี้แล้ว") =====
var _cmtOpenKebabId = null;
var _cmtEditingId = null;

function _cmtRerender(kind) {
  if (kind === 'task') renderTaskComments(_tdLastComments, true);
  else renderPersonalTaskComments(_ptmLastComments, true);
}

function buildCommentItemHtml(c, kind, myAccountId) {
  var initial = (c.authorName || '?').trim().charAt(0).toUpperCase();

  if (c.deleted) {
    return '<div class="td-cmt-item">' +
      '<div class="td-cmt-avatar">' + escapeHtmlPtb(initial) + '</div>' +
      '<div class="td-cmt-bubble deleted">' +
        '<div class="td-cmt-top"><span class="td-cmt-name">' + escapeHtmlPtb(c.authorName || '') + '</span></div>' +
        '<div class="td-cmt-text">🚫 ' + escapeHtmlPtb(c.authorName || '') + ' ได้ลบข้อความนี้แล้ว</div>' +
      '</div></div>';
  }

  var isOwn = !!myAccountId && c.authorId === myAccountId;
  var timeLabel = c.createdAt && c.createdAt.toDate ? c.createdAt.toDate().toLocaleString('th-TH') : 'กำลังส่ง...';

  if (isOwn && _cmtEditingId === c.id) {
    return '<div class="td-cmt-item">' +
      '<div class="td-cmt-avatar">' + escapeHtmlPtb(initial) + '</div>' +
      '<div class="td-cmt-bubble' + (c.urgent ? ' urgent' : '') + '">' +
        '<div class="td-cmt-top"><span class="td-cmt-name">' + escapeHtmlPtb(c.authorName || '') + '</span>' +
        (c.urgent ? '<span class="td-cmt-tag">⚠ ด่วน</span>' : '') +
        '<span class="td-cmt-time">' + escapeHtmlPtb(timeLabel) + '</span></div>' +
        '<textarea class="td-cmt-edit-box" id="cmt-edit-box-' + c.id + '">' + escapeHtmlPtb(c.text || '') + '</textarea>' +
        '<div class="td-cmt-edit-actions">' +
          '<button class="td-cmt-edit-btn cancel" onclick="cancelEditComment(\'' + kind + '\')">ยกเลิก</button>' +
          '<button class="td-cmt-edit-btn save" onclick="saveEditComment(\'' + kind + '\', \'' + c.id + '\')">บันทึก</button>' +
        '</div>' +
      '</div></div>';
  }

  // หมายเหตุ: เมนู kebab ไม่ได้ฝังเป็น HTML ในนี้โดยตรง (ต่างจาก mockup ตอนออกแบบ) เพราะ #td-cmt-list/
  // #ptm-cmt-list เป็นกล่อง overflow-y:auto ความสูงจำกัด (max-height) ถ้าคอมเมนต์อยู่ท้ายๆ รายการ เมนูที่
  // โผล่ลงด้านล่างปุ่ม ⋮ จะโดนกล่องตัดขาดทันที (ทดสอบแล้วเจอบั๊กนี้จริงตอน verify) - แก้โดยให้ปุ่ม ⋮ แค่เปิด
  // เมนูลอย (fixed position) แนบกับ document.body แทน ดู toggleCommentKebab() ด้านล่าง
  var kebabHtml = isOwn
    ? '<button class="kebab-btn" onclick="toggleCommentKebab(event, \'' + kind + '\', \'' + c.id + '\')">⋮</button>'
    : '';

  return '<div class="td-cmt-item">' +
    '<div class="td-cmt-avatar">' + escapeHtmlPtb(initial) + '</div>' +
    '<div class="td-cmt-bubble' + (c.urgent ? ' urgent' : '') + (isOwn ? ' own' : '') + '">' +
      kebabHtml +
      '<div class="td-cmt-top"><span class="td-cmt-name">' + escapeHtmlPtb(c.authorName || '') + '</span>' +
      (c.urgent ? '<span class="td-cmt-tag">⚠ ด่วน</span>' : '') +
      '<span class="td-cmt-time">' + escapeHtmlPtb(timeLabel) + '</span>' +
      (c.editedAt ? '<span class="td-cmt-edited-tag">(แก้ไขแล้ว)</span>' : '') +
      '</div>' +
      '<div class="td-cmt-text">' + escapeHtmlPtb(c.text || '') + '</div>' +
    '</div></div>';
}

// เมนู kebab แบบลอย (fixed) แนบกับ document.body ตัวเดียวใช้ร่วมกันทั้ง 2 ระบบคอมเมนต์ - หลุดพ้นปัญหา
// ถูกตัดขาดโดย overflow-y:auto ของ #td-cmt-list/#ptm-cmt-list ตามที่คอมเมนต์ไว้ใน buildCommentItemHtml()
function closeGlobalKebabMenu() {
  var m = document.getElementById('cmt-global-kebab-menu');
  if (m) m.remove();
  _cmtOpenKebabId = null;
}

function toggleCommentKebab(evt, kind, commentId) {
  if (evt) evt.stopPropagation();
  if (_cmtOpenKebabId === commentId) { closeGlobalKebabMenu(); return; }
  closeGlobalKebabMenu();
  _cmtOpenKebabId = commentId;
  var list = kind === 'task' ? _tdLastComments : _ptmLastComments;
  var c = null;
  for (var i = 0; i < list.length; i++) { if (list[i].id === commentId) { c = list[i]; break; } }
  if (!c) return;
  var btn = evt.currentTarget;
  var rect = btn.getBoundingClientRect();
  var menu = document.createElement('div');
  menu.id = 'cmt-global-kebab-menu';
  menu.className = 'kebab-menu';
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  // แก้ไข/ลบได้ตลอดเวลาไม่จำกัด (ตามที่ผู้ใช้ปรับล่าสุด - เดิมเคยจำกัดลบแค่ 30 นาที)
  menu.innerHTML = '<button onclick="startEditComment(event, \'' + kind + '\', \'' + commentId + '\')">✏️ แก้ไข</button>' +
    '<div class="sep"></div><button class="danger" onclick="deleteCommentConfirm(event, \'' + kind + '\', \'' + commentId + '\')">🗑️ ลบ</button>';
  document.body.appendChild(menu);
}

function startEditComment(evt, kind, commentId) {
  if (evt) evt.stopPropagation();
  closeGlobalKebabMenu();
  _cmtEditingId = commentId;
  _cmtRerender(kind);
  var box = document.getElementById('cmt-edit-box-' + commentId);
  if (box) { box.focus(); box.selectionStart = box.selectionEnd = box.value.length; }
}

function cancelEditComment(kind) {
  _cmtEditingId = null;
  _cmtRerender(kind);
}

function saveEditComment(kind, commentId) {
  var box = document.getElementById('cmt-edit-box-' + commentId);
  if (!box) return;
  var text = (box.value || '').trim();
  if (!text) return;
  var token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  var taskId = kind === 'task' ? _tdCurrentTaskId : _ptmCmtCurrentTaskId;
  if (!taskId) return;
  var action = kind === 'task' ? 'editTaskComment' : 'editPersonalTaskComment';
  box.disabled = true;
  callApi(action, { token: token, taskId: taskId, commentId: commentId, text: text }).then(function (result) {
    if (result.success) {
      _cmtEditingId = null;
      _cmtRerender(kind); // onSnapshot จะอัปเดตข้อความจริงตามมาเองอีกที
    } else {
      box.disabled = false;
      Swal.fire({ icon: 'error', title: 'แก้ไขความคิดเห็นไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    box.disabled = false;
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  });
}

function deleteCommentConfirm(evt, kind, commentId) {
  if (evt) evt.stopPropagation();
  closeGlobalKebabMenu();
  Swal.fire({
    icon: 'warning', title: 'ลบความคิดเห็นนี้?', text: 'เมื่อลบแล้วจะไม่สามารถกู้คืนข้อความได้',
    showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#ef4444'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    var taskId = kind === 'task' ? _tdCurrentTaskId : _ptmCmtCurrentTaskId;
    if (!taskId) return;
    var action = kind === 'task' ? 'deleteTaskComment' : 'deletePersonalTaskComment';
    callApi(action, { token: token, taskId: taskId, commentId: commentId }).then(function (result) {
      if (!result.success) {
        Swal.fire({ icon: 'error', title: 'ลบความคิดเห็นไม่สำเร็จ', text: result.message });
      }
      // onSnapshot จะอัปเดต UI เป็นสถานะ "ลบแล้ว" ให้เองอัตโนมัติเมื่อสำเร็จ
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    });
  });
}

// ปิดเมนู kebab ลอยเมื่อคลิกนอกเมนู/ปุ่ม หรือเมื่อมีการ scroll ที่ไหนก็ตาม (กันเมนูค้างตำแหน่งเดิมทั้งที่
// ปุ่ม ⋮ เลื่อนตำแหน่งไปแล้วจาก scroll ของ #td-cmt-list/#ptm-cmt-list หรือหน้าเว็บ)
document.addEventListener('click', function (e) {
  if (_cmtOpenKebabId === null) return;
  if (e.target.closest('.kebab-menu') || e.target.closest('.kebab-btn')) return;
  closeGlobalKebabMenu();
});
window.addEventListener('scroll', function () { closeGlobalKebabMenu(); }, true);

var _tdLastComments = [];

function renderTaskComments(comments, skipScroll) {
  _tdLastComments = comments;
  var listEl = document.getElementById('td-cmt-list');
  var countEl = document.getElementById('td-cmt-count');
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);
  if (comments.length === 0) {
    listEl.innerHTML = '<div class="td-cmt-empty">ยังไม่มีความคิดเห็น</div>';
    countEl.style.display = 'none';
  } else {
    countEl.textContent = comments.length;
    countEl.style.display = 'inline-block';
    listEl.innerHTML = comments.map(function (c) { return buildCommentItemHtml(c, 'task', myAccountId); }).join('');
  }
  if (!skipScroll) listEl.scrollTop = listEl.scrollHeight;
}

function sendTaskComment() {
  var taskId = _tdCurrentTaskId;
  if (!taskId) return;
  var input = document.getElementById('td-cmt-input');
  var text = (input.value || '').trim();
  if (!text) return;
  var urgentBox = document.getElementById('td-cmt-urgent');
  var isUrgent = !!(urgentBox && urgentBox.checked);
  var sendBtn = document.getElementById('td-cmt-send-btn');
  var token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  sendBtn.disabled = true;
  callApi('addTaskComment', { token: token, taskId: taskId, text: text, urgent: isUrgent }).then(function (result) {
    sendBtn.disabled = false;
    if (result.success) {
      input.value = '';
      if (urgentBox) urgentBox.checked = false;
      // ไม่ต้อง render ซ้ำเอง - onSnapshot ของ subscribeTaskComments() จะได้ข้อมูลใหม่มาเองอัตโนมัติ
    } else {
      Swal.fire({ icon: 'error', title: 'ส่งความคิดเห็นไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    sendBtn.disabled = false;
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  });
}

function openTaskDetailModal(event) {
  var props = event.extendedProps;
  var taskId = event.id;

  document.getElementById('td-title').textContent = event.title;
  document.getElementById('td-type').textContent = TASK_TYPE_LABELS[props.taskType] || props.taskType;
  document.getElementById('td-date').textContent = formatEventDateRange(event);
  document.getElementById('td-location').textContent = props.location || '-';
  var tdDetailPlain = stripHtmlToText(props.detail || '');
  document.getElementById('td-detail').innerHTML = tdDetailPlain ? sanitizeRichText(props.detail) : '-';

  var warningEl = document.getElementById('td-warning-banner');
  warningEl.style.display = 'none';

  var staffCard = document.getElementById('td-staff-card');
  staffCard.innerHTML = '';
  var staffList = props.staff || [];
  if (!staffList.length) {
    staffCard.innerHTML = '<span style="font-size:13px;color:var(--text-muted)">-</span>';
  } else {
    staffList.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'td-staff-item';
      var dot = document.createElement('span');
      dot.className = 'td-staff-dot';
      dot.style.background = s.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(s.name));
      staffCard.appendChild(item);
    });
  }

  // ระบบคอมเมนต์ - ต้อง login ก่อนถึงจะเห็น/ใช้งานได้ (คนดูสาธารณะไม่มีตัวตนให้ผูกกับคอมเมนต์)
  var cmtToken = localStorage.getItem(TOKEN_KEY);
  var cmtSection = document.getElementById('td-comments-section');
  document.getElementById('td-cmt-toggle').classList.remove('open');
  document.getElementById('td-cmt-body').classList.remove('open');
  if (cmtToken) {
    cmtSection.style.display = 'block';
    _tdCurrentTaskId = taskId;
    document.getElementById('td-cmt-list').innerHTML = '<div class="td-cmt-empty">กำลังโหลด...</div>';
    document.getElementById('td-cmt-count').style.display = 'none';
    document.getElementById('td-cmt-input').value = '';
    subscribeTaskComments(taskId);
  } else {
    cmtSection.style.display = 'none';
    _tdCurrentTaskId = null;
  }

  var actionsEl = document.getElementById('td-actions');
  actionsEl.innerHTML = '';

  function addBtn(label, cls, onClick) {
    var btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = label;
    btn.onclick = onClick;
    actionsEl.appendChild(btn);
  }

  var token = localStorage.getItem(TOKEN_KEY);
  var myRole = localStorage.getItem(ROLE_KEY);
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);

  if (!token) {
    addBtn('ปิด', 'td-btn-plain', closeTaskDetailModal);
  } else if (myRole === 'admin' || myRole === 'ceo') {
    addBtn('ปิด', 'td-btn-plain', closeTaskDetailModal);
    addBtn('ลบงาน', 'td-btn-danger', function () { closeTaskDetailModal(); deleteTaskConfirm(taskId); });
    addBtn('แก้ไข', 'td-btn-primary', function () { closeTaskDetailModal(); openTaskModalForEdit(taskId); });
  } else {
    var isOwner = props.createdBy === myAccountId || (props.staffIds || []).indexOf(myAccountId) !== -1;
    addBtn('ปิด', 'td-btn-plain', closeTaskDetailModal);
    if (isOwner) {
      addBtn('ขอลบงาน', 'td-btn-danger', function () { closeTaskDetailModal(); requestDeleteTaskConfirm(taskId); });
      addBtn('ขอเปลี่ยนวัน', 'td-btn-primary', function () { closeTaskDetailModal(); openRescheduleModal(taskId); });
      addBtn('ขอแก้ไขงาน', 'td-btn-primary', function () { closeTaskDetailModal(); openEditRequestModal(taskId, props); });
    }
  }

  document.getElementById('task-detail-modal-overlay').style.display = 'flex';
  _pushModalNav('task-detail-modal-overlay');
  // ต้องเรียกหลังจากที่ modal โชว์แล้วเท่านั้น (ไม่ใช่ก่อนหน้า) เพราะ Google Maps ต้องการให้ container
  // มีขนาดจริงตอนสร้างแผนที่ - ถ้าเรียกตอน modal ยังซ่อนอยู่ (display:none) จะได้แผนที่ขนาด 0x0 มาแทน
  setupTaskDetailMap(props.lat, props.lng);
}

// ===== แผนที่ (ดูอย่างเดียว) ในหน้าดูรายละเอียดงาน - โชว์เฉพาะงานที่มีพิกัด lat/lng บันทึกไว้เท่านั้น
// (งานเก่าที่พิมพ์สถานที่เองก่อนมีฟีเจอร์แผนที่ หรือไม่ได้เลือกจาก autocomplete/คลิกแผนที่ จะไม่มีพิกัด) =====
function setupTaskDetailMap(lat, lng) {
  var mapEl = document.getElementById('td-map');
  if (!lat || !lng || !GOOGLE_MAPS_API_KEY) {
    mapEl.style.display = 'none';
    return;
  }
  mapEl.style.display = 'block';
  var latLng = { lat: Number(lat), lng: Number(lng) };
  loadGoogleMapsScript(function () {
    if (!taskDetailMap) {
      taskDetailMap = new google.maps.Map(mapEl, {
        center: latLng, zoom: 16, disableDefaultUI: true, gestureHandling: 'cooperative'
      });
    } else {
      // resize ก่อนเสมอ กันกรณี container เพิ่งเปลี่ยนจาก display:none เป็น block (แผนที่เดิมอาจจำขนาดเก่าค้างไว้)
      google.maps.event.trigger(taskDetailMap, 'resize');
      taskDetailMap.setCenter(latLng);
    }
    if (taskDetailMarker) taskDetailMarker.setMap(null);
    taskDetailMarker = new google.maps.Marker({ position: latLng, map: taskDetailMap });
  });
}

// ===== Staff: ขอเปลี่ยนวัน =====
var rescheduleTaskId = null;

function openRescheduleModal(taskId) {
  rescheduleTaskId = taskId;
  document.getElementById('reschedule-start-date').value = '';
  document.getElementById('reschedule-end-date').value = '';
  document.getElementById('reschedule-reason').value = '';
  document.getElementById('reschedule-modal-overlay').style.display = 'flex';
  _pushModalNav('reschedule-modal-overlay');
}
function closeRescheduleModal() {
  document.getElementById('reschedule-modal-overlay').style.display = 'none';
}

function submitRescheduleRequest() {
  var startDate = document.getElementById('reschedule-start-date').value;
  var endDate = document.getElementById('reschedule-end-date').value;
  var reason = document.getElementById('reschedule-reason').value.trim();
  var btn = document.getElementById('reschedule-submit-btn');

  if (!startDate || !endDate) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณาเลือกวันเริ่มและวันสิ้นสุดใหม่' });
    return;
  }

  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังส่งคำขอ...');
  callApi('requestRescheduleTask', {
    token: token, taskId: rescheduleTaskId,
    newStartDateTime: new Date(startDate).toISOString(),
    newEndDateTime: new Date(endDate).toISOString(),
    reason: reason
  }).then(function (result) {
    if (result.success) {
      closeRescheduleModal();
      Toast.fire({ icon: 'success', title: 'ส่งคำขอเปลี่ยนวันแล้ว รออนุมัติจาก Admin' });
    } else {
      Swal.fire({ icon: 'error', title: 'ส่งคำขอไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

// ===== Staff: ขอแก้ไขงาน (แยกจาก "ขอเปลี่ยนวัน" - ไม่รวมวันที่/เวลา ตามที่ผู้ใช้ระบุไว้) =====
var editRequestTaskId = null;

function setEditRequestType(value) {
  document.getElementById('edit-request-type').value = value;
  var buttons = document.querySelectorAll('#edit-request-type-segmented button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-value') === value);
  }
}

function openEditRequestModal(taskId, props) {
  editRequestTaskId = taskId;
  props = props || {};
  document.getElementById('edit-request-task-name').value = props.taskName || document.getElementById('td-title').textContent || '';
  setEditRequestType(props.taskType || 'meeting');
  document.getElementById('edit-request-location').value = props.location || '';
  document.getElementById('edit-request-detail').value = stripHtmlToText(props.detail || '');
  document.getElementById('edit-request-reason').value = '';
  loadTaskStaffChecklist(props.staffIds || [], 'edit-request-staff-list');
  document.getElementById('edit-request-modal-overlay').style.display = 'flex';
  _pushModalNav('edit-request-modal-overlay');
}

function closeEditRequestModal() {
  document.getElementById('edit-request-modal-overlay').style.display = 'none';
}

function submitEditRequest() {
  var taskName = document.getElementById('edit-request-task-name').value.trim();
  var btn = document.getElementById('edit-request-submit-btn');

  if (!taskName) {
    Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: 'กรุณากรอกชื่องาน' });
    return;
  }

  var staffIds = Array.prototype.slice.call(
    document.querySelectorAll('#edit-request-staff-list input[type="checkbox"]:checked')
  ).map(function (el) { return el.value; });
  var taskType = document.getElementById('edit-request-type').value;
  var locationName = document.getElementById('edit-request-location').value.trim();
  var detail = document.getElementById('edit-request-detail').value.trim();
  var reason = document.getElementById('edit-request-reason').value.trim();
  var token = localStorage.getItem(TOKEN_KEY);

  setButtonLoading(btn, true, 'กำลังส่งคำขอ...');
  callApi('requestEditTask', {
    token: token, taskId: editRequestTaskId,
    taskName: taskName, taskType: taskType, locationName: locationName, detail: detail,
    staffIds: staffIds, reason: reason
  }).then(function (result) {
    if (result.success) {
      closeEditRequestModal();
      Toast.fire({ icon: 'success', title: 'ส่งคำขอแก้ไขงานแล้ว รออนุมัติจาก Admin' });
    } else {
      Swal.fire({ icon: 'error', title: 'ส่งคำขอไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

// ===== แจ้งเตือนกระดิ่ง (Admin) =====
var REQUEST_TYPE_LABELS = { delete: 'ขอลบงาน', reschedule: 'ขอเปลี่ยนวัน', edit: 'ขอแก้ไขงาน' };

// ===== เสียงแจ้งเตือน: ลองใช้เสียงพูดก่อน (ไม่ต้องมีไฟล์เสียง) ถ้าเบราว์เซอร์ไม่รองรับใช้เสียง beep แทนอัตโนมัติ =====
// ===== เลือกเสียงพูดภาษาไทยที่มีในเครื่อง พร้อมเดาเพศจากชื่อเสียง =====
// ===== ขออนุญาตแจ้งเตือนระบบ (ครั้งเดียวหลัง login) เพื่อให้เรียก Notification ได้ทีหลัง =====
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ===== Push Notification (FCM) - ทำให้แจ้งเตือนเด้งออกมาที่มือถือ/เดสก์ท็อปได้แม้ปิดแท็บ/แอปไปแล้ว
// (ต่างจาก playNotificationSound() ด้านบนที่ต้องเปิดแท็บค้างไว้ให้ JS ทำงานถึงจะได้ยิน/เห็น) เรียกครั้งเดียว
// ตอนล็อกอิน/เข้าแอปสำเร็จจาก enterAdminMode() - ล้มเหลวได้แบบเงียบๆ ทุกจุด (เบราว์เซอร์เก่า, ปฏิเสธสิทธิ์,
// ยังไม่ได้ตั้งค่า VAPID key ฯลฯ) เพราะแจ้งเตือนในแอปแบบเดิม (กระดิ่ง/เสียง) ต้องทำงานได้ปกติไม่ว่า Push จะติดตั้ง
// สำเร็จหรือไม่ก็ตาม =====
function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !firebase.messaging) return;
  if (!FCM_VAPID_KEY || FCM_VAPID_KEY.indexOf('PASTE_YOUR') === 0) return; // ยังไม่ได้ตั้งค่า VAPID key จาก Firebase Console

  navigator.serviceWorker.register('firebase-messaging-sw.js').then(function (registration) {
    var messaging = firebase.messaging();

    function getAndSendToken() {
      messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration })
        .then(function (currentToken) {
          if (!currentToken) return;
          var token = localStorage.getItem(TOKEN_KEY);
          if (!token) return;
          callApi('registerPushToken', { token: token, fcmToken: currentToken }).catch(function (err) {
            console.error('registerPushToken error', err);
          });
        }).catch(function (err) { console.error('FCM getToken error', err); });
    }

    if (Notification.permission === 'granted') {
      getAndSendToken();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(function (perm) {
        if (perm === 'granted') getAndSendToken();
      });
    }
    // ถ้าเคยปฏิเสธไปแล้ว (denied) ไม่ทำอะไรต่อ - เบราว์เซอร์ไม่ให้ขอซ้ำอยู่แล้ว ต้องไปกดอนุญาตเองในตั้งค่าเว็บไซต์

    // ตอนแอปเปิดอยู่ (foreground) FCM จะไม่โชว์ notification ให้เอง (ต่างจากตอนปิด/มินิไมซ์ที่ไปเข้า
    // firebase-messaging-sw.js แทน) เดิมเคยดักโชว์เป็น Toast เองแทนตรงนี้ แต่ตอนนี้ทุกแจ้งเตือนที่ backend
    // สร้าง (createNotification) จะเขียนลง Firestore "notifications" เสมอคู่กับการยิง push อยู่แล้ว
    // ซึ่ง setupNotificationsRealtimeListener() ดักฟังอยู่และโชว์เป็น in-app banner ให้ทันทีที่มีเอกสารใหม่
    // (ครอบคลุมทุกประเภทแจ้งเตือน 100%) จึงตัด Toast.fire ตรงนี้ออก กัน popup ซ้อนกับ banner สำหรับ
    // เหตุการณ์เดียวกัน - เหลือ onMessage ไว้เฉยๆ เผื่ออนาคตต้องใช้ทำอย่างอื่น (เช่นอัปเดต badge count)
    messaging.onMessage(function (payload) {
      // ไม่ต้องทำอะไร - ให้ banner (ผ่าน Firestore listener) เป็นตัวแสดงแจ้งเตือนแบบเดียวเท่านั้น
    });
  }).catch(function (err) { console.error('Service worker register error', err); });
}

// ===== เปิด/ปิดเสียงแจ้งเตือน (ตั้งค่าการแจ้งเตือน > เสียงแจ้งเตือน) - เก็บใน localStorage ล้วนๆ
// (ไม่ผูกกับ backend เพราะเป็นเรื่องของเครื่อง/เบราว์เซอร์นี้เท่านั้น ไม่ต้อง sync ข้ามเครื่อง) ค่าเริ่มต้น = เปิด =====
var NOTIF_SOUND_KEY = 'c2tech_notif_sound_enabled';
function isNotifSoundEnabled() {
  return localStorage.getItem(NOTIF_SOUND_KEY) !== '0';
}
function setNotifSoundEnabled(enabled) {
  localStorage.setItem(NOTIF_SOUND_KEY, enabled ? '1' : '0');
}

// ===== โชว์แจ้งเตือนผ่าน Notification API ของเบราว์เซอร์/ระบบปฏิบัติการ =====
// วิธีนี้ให้ผลเหมือนกันทั้ง PC และมือถือ: ระบบปฏิบัติการเป็นคนเล่น "เสียงแจ้งเตือนมาตรฐาน" ให้เองอัตโนมัติ
// ไม่ต้องมาเลือกเสียงเองอีกต่อไป (เดิมใช้เสียงพูดสังเคราะห์ ซึ่งบางเครื่องไม่มีเสียงไทยที่ฟังดูเป็นธรรมชาติ)
function playNotificationSound(title, body) {
  if (!isNotifSoundEnabled()) return; // ผู้ใช้ปิดเสียงแจ้งเตือนไว้ในตั้งค่า
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body: body, icon: 'icons/icon-192.png' });
      return; // สำเร็จ - เบราว์เซอร์/OS เล่นเสียงแจ้งเตือนมาตรฐานให้เองแล้ว ไม่ต้องทำอะไรเพิ่ม
    } catch (e) { /* ตกไป beep สำรองด้านล่าง */ }
  }
  // สำรอง: ถ้ายังไม่ได้อนุญาต หรือเบราว์เซอร์ไม่รองรับ Notification เลย ใช้เสียง beep ธรรมดาแทน
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch (e) { /* เบราว์เซอร์ไม่รองรับเสียงเลย ปล่อยผ่านเงียบๆ */ }
}

// ===== ระบบแจ้งเตือนแบบใหม่ (Real-time + ถาวร 30 วัน) แทนระบบเดิมทั้งหมด =====
var lastNotifications = [];
var isFirstNotifSnapshot = true;
// แก้บั๊ก: เดิม listener ตัวนี้ไม่เคยถูก unsubscribe ตอน logout เลย - ถ้า login คนละบัญชีต่อกันในแท็บ
// เดียวกัน (ไม่ได้ refresh หน้า เช่นเครื่องคอมกลางที่หลายคนผลัดกันใช้) listener ของคนเก่าจะยังทำงานค้างอยู่
// ซ้อนกับของคนใหม่ ทำให้แจ้งเตือน/เสียง/badge ของคนเก่าหลุดมาปนกับคนใหม่ที่เพิ่ง login เข้ามา (ข้อมูลรั่ว
// ข้ามบัญชี) - เก็บตัว unsubscribe ไว้ในตัวแปรนี้ แล้วเรียกเคลียร์ใน exitAdminMode() เหมือนที่ทำกับ
// _unsubPersonalTasks/_unsubTaskTags อยู่แล้ว
var _unsubNotifications = null;

function setupNotificationsRealtimeListener() {
  var myId = localStorage.getItem(ACCOUNT_ID_KEY);
  if (!myId) return;
  if (_unsubNotifications) return; // กันสมัครซ้ำถ้าเรียกซ้อน

  _unsubNotifications = fbDb.collection('notifications').where('recipientId', '==', myId)
    .onSnapshot(function (snapshot) {
      // เล่นเสียงเฉพาะตอนมีรายการใหม่เข้ามาจริง (ไม่ใช่ตอนโหลดครั้งแรก) - เก็บ flag ไว้ด้วยว่ารอบนี้มีรายการ
      // ใหม่จริงไหม สำหรับเด้ง pop badge กระดิ่งด้านล่าง (กันไม่ให้ badge เด้งทุกครั้งที่ snapshot ยิงมาเฉยๆ
      // เช่นตอนแค่ mark อ่านแล้ว ซึ่งไม่ควรมี effect นี้)
      var hasNewNotif = false;
      if (!isFirstNotifSnapshot) {
        snapshot.docChanges().forEach(function (change) {
          if (change.type === 'added') {
            hasNewNotif = true;
            var d = change.doc.data();
            playNotificationSound(d.title || 'C2 Calendar', d.body || '');
            showInAppBanner(Object.assign({ id: change.doc.id }, d));
          }
        });
      }
      isFirstNotifSnapshot = false;

      lastNotifications = snapshot.docs.map(function (d) {
        return Object.assign({ id: d.id }, d.data());
      }).sort(function (a, b) {
        var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });

      var unreadCount = lastNotifications.filter(function (n) { return !n.read; }).length;
      var badge = document.getElementById('notif-badge');
      if (badge) {
        if (unreadCount > 0) { badge.textContent = unreadCount; badge.style.display = 'flex'; }
        else { badge.style.display = 'none'; }
        // เด้ง pop badge ทุกครั้งที่มีแจ้งเตือนใหม่จริงๆเข้ามา (ไม่ใช่แค่ re-render เฉยๆ) - ลบคลาสแล้วบังคับ
        // reflow ก่อนใส่กลับ เพราะถ้าแจ้งเตือนเข้ามาถี่ๆ ต่อกัน คลาส 'pop' อาจยังค้างอยู่จากรอบก่อน ใส่ซ้ำเฉยๆ
        // จะไม่ retrigger animation (ต้องเอาออกแล้วบังคับ reflow ก่อนใส่กลับเสมอ)
        if (hasNewNotif && unreadCount > 0) {
          badge.classList.remove('pop');
          void badge.offsetWidth;
          badge.classList.add('pop');
        }
      }

      // ถ้า modal เปิดอยู่ ให้ render รายการใหม่ทันที
      if (document.getElementById('my-requests-modal-overlay').style.display === 'flex') {
        renderNotificationsList();
      }
    }, function (err) {
      console.error('ฟังการแจ้งเตือนไม่สำเร็จ', err);
    });
}

// ===== ไอคอนกลม + สี + ป้ายหมวดของแจ้งเตือนแต่ละประเภท (type มาจาก Cloud Functions ฝั่ง backend
// ตรงๆ - ดู createNotification()/notifyTaskChange()/personalTaskDueReminders() ใน functions/index.js)
// เพิ่ม type ใหม่ที่ backend เพิ่มขึ้นมาทีหลัง ให้มาเพิ่ม mapping ที่นี่ด้วยเสมอ ไม่งั้นจะตกไปใช้ค่า
// default (กระดิ่งฟ้า ไม่มีป้ายหมวด) ซึ่งยังใช้งานได้ปกติ แค่ไม่ได้สื่อความหมายเฉพาะเจาะจง =====
function getNotifTypeInfo(type) {
  var map = {
    task_created: { icon: '🆕', color: 'blue', tag: 'ปฏิทินหลัก' },
    task_updated: { icon: '✏️', color: 'purple', tag: 'ปฏิทินหลัก' },
    task_cancelled: { icon: '🗑️', color: 'red', tag: 'ปฏิทินหลัก' },
    changeRequestNew: { icon: '📝', color: 'amber', tag: 'รออนุมัติ' },
    changeRequestReviewed: { icon: '✅', color: 'green', tag: 'คำขอ' },
    personalTask_created: { icon: '🆕', color: 'blue', tag: 'Personal Task' },
    personalTask_assigned: { icon: '👤', color: 'purple', tag: 'Personal Task' },
    personalTask_unassigned: { icon: '👤', color: 'slate', tag: 'Personal Task' },
    personalTask_done: { icon: '✅', color: 'green', tag: 'Personal Task' },
    personalTask_rescheduled: { icon: '📅', color: 'orange', tag: 'Personal Task' },
    personalTask_deleted: { icon: '🗑️', color: 'red', tag: 'Personal Task' },
    personalTask_dueSoon: { icon: '⏰', color: 'amber', tag: 'ใกล้ครบกำหนด' },
    personalTask_dueToday: { icon: '⏰', color: 'orange', tag: 'ครบกำหนดวันนี้' },
    personalTask_overdue: { icon: '⚠️', color: 'red', tag: 'เลยกำหนด' },
    taskComment: { icon: '💬', color: 'purple', tag: 'ความคิดเห็น' },
    taskComment_urgent: { icon: '⚠️', color: 'red', tag: 'ด่วน' },
    test: { icon: '🔔', color: 'green', tag: 'ทดสอบ' }
  };
  return map[type] || { icon: '🔔', color: 'blue', tag: '' };
}

// ===== แบนเนอร์แจ้งเตือนแบบอินแอป (ตอนเปิดแอปค้างอยู่) - แสดงทีละอันเดียวผ่านคิว กันซ้อนกันเวลามีแจ้งเตือน
// เข้ามาถี่ๆ - เลื่อนลงจากขอบบน 5 วิ พร้อมแถบนับถอยหลัง แตะแล้วเปิด modal รายการแจ้งเตือนเดิม =====
var _inAppBannerQueue = [];
var _inAppBannerShowing = false;
var _inAppBannerTimer = null;

function showInAppBanner(notifDoc) {
  _inAppBannerQueue.push(notifDoc);
  _inAppBannerProcessQueue();
}

function _inAppBannerProcessQueue() {
  if (_inAppBannerShowing) return;
  var next = _inAppBannerQueue.shift();
  if (!next) return;
  _inAppBannerShowing = true;

  var info = getNotifTypeInfo(next.type);
  var el = document.getElementById('inapp-banner');
  var icEl = document.getElementById('inapp-banner-ic');
  icEl.className = 'notif-ic ' + info.color;
  icEl.textContent = info.icon;
  document.getElementById('inapp-banner-title').textContent = next.title || 'C2 Calendar';
  document.getElementById('inapp-banner-text').textContent = next.body || '';

  // รีสตาร์ทอนิเมชันแถบนับถอยหลังทุกครั้ง (ลบ/ใส่ element ใหม่ แทนแค่ toggle class เพราะ CSS animation
  // จะไม่รันซ้ำถ้า element เดิมยังอยู่)
  var track = document.getElementById('inapp-banner-progress-track');
  track.innerHTML = '<div id="inapp-banner-progress-bar"></div>';

  // ขั้นที่ 1: เปิด display:flex ก่อน (ยังอยู่ตำแหน่งซ่อน translate(-50%,-120%) ตาม default)
  el.classList.add('open');
  // บังคับ reflow ให้ browser paint เฟรม "ซ่อนอยู่" นี้จริงก่อน ไม่งั้น step ถัดไปจะโดนรวบเป็นเฟรมเดียวกัน
  // แล้ว animation จะไม่เกิดขึ้นเลย (จุดสำคัญของ fix - ดูรายละเอียดใน style.css ที่ #inapp-banner.open)
  void el.offsetHeight;
  // ขั้นที่ 2: ค่อยเพิ่ม .show ในเฟรมถัดไปเพื่อให้ transition มีจังหวะ animate เลื่อนลงจริง
  requestAnimationFrame(function () {
    el.classList.add('show');
  });

  clearTimeout(_inAppBannerTimer);
  _inAppBannerTimer = setTimeout(_inAppBannerDismiss, 5000);
}

function _inAppBannerDismiss() {
  clearTimeout(_inAppBannerTimer);
  var el = document.getElementById('inapp-banner');
  el.classList.remove('show');
  _inAppBannerShowing = false;
  // เว้นจังหวะเล็กน้อยให้อนิเมชันเลื่อนขึ้นจบก่อน (0.35s = 350ms ให้ตรงกับ transition ใน style.css) ค่อยเอา
  // display ออกจริง (.open) แล้วค่อยโชว์อันถัดไปในคิว (ถ้ามี)
  setTimeout(function () {
    el.classList.remove('open');
    _inAppBannerProcessQueue();
  }, 350);
}

function inAppBannerClose(evt) {
  if (evt) evt.stopPropagation();
  _inAppBannerDismiss();
}

function inAppBannerTap() {
  _inAppBannerDismiss();
  if (localStorage.getItem(TOKEN_KEY)) { openMyRequestsModal(); }
}

// ===== Skeleton รายการแจ้งเตือน - โชว์เฉพาะตอน onSnapshot ของ setupNotificationsRealtimeListener() ยังไม่
// เคยตอบกลับเลยสักครั้ง (isFirstNotifSnapshot) กันเคสเปิด modal ทันทีหลังล็อกอินก่อนข้อมูลชุดแรกมาถึง =====
function renderNotificationsSkeleton() {
  var container = document.getElementById('my-requests-list');
  var rows = '';
  for (var i = 0; i < 4; i++) {
    rows += '<div class="skel-notif-row"><span class="skel"></span>' +
      '<span class="skel-lines"><span class="skel" style="width:90%;height:11px;"></span>' +
      '<span class="skel" style="width:50%;height:9px;"></span></span></div>';
  }
  container.innerHTML = rows;
}

function renderNotificationsList() {
  var container = document.getElementById('my-requests-list');
  if (isFirstNotifSnapshot) {
    renderNotificationsSkeleton();
    return;
  }
  if (lastNotifications.length === 0) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-faint)">ยังไม่มีการแจ้งเตือน</p>';
    return;
  }
  container.innerHTML = '';
  lastNotifications.forEach(function (n) {
    var card = document.createElement('div');
    card.className = 'request-card' + (n.read ? '' : ' notif-unread');
    var timeLabel = n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().toLocaleString('th-TH') : '';
    var info = getNotifTypeInfo(n.type);

    var actionsHtml = '';
    if (n.type === 'changeRequestNew' && !n.read) {
      actionsHtml = '<div class="rc-actions">' +
        '<button class="btn-approve" onclick="approveFromNotification(this, \'' + n.requestId + '\', \'' + n.id + '\')">อนุมัติ</button>' +
        '<button class="btn-reject" onclick="rejectFromNotification(this, \'' + n.requestId + '\', \'' + n.id + '\')">ไม่อนุมัติ</button>' +
        '</div>';
    }

    card.innerHTML =
      '<div class="notif-ic ' + info.color + '">' + info.icon + '</div>' +
      '<div class="notif-body-col">' +
        '<div class="rc-task">' + escapeHtmlPtb(n.body || '') + '</div>' +
        '<div class="notif-meta-row"><span class="rc-meta">' + timeLabel + '</span>' +
          (info.tag ? '<span class="notif-tag">' + info.tag + '</span>' : '') +
        '</div>' + actionsHtml +
      '</div>';

    // คลิกที่การ์ด: ถ้ายังไม่อ่านให้ทำเครื่องหมายอ่านแล้วเหมือนเดิม และถ้ามีงานผูกอยู่ (taskId ของปฏิทินหลัก
    // หรือ personalTaskId ของ Personal Task Board) ให้เปิดการ์ดรายละเอียดงานซ้อนขึ้นมาเลยโดยไม่ปิดลิสต์นี้ก่อน
    // (changeRequestNew ยังคงใช้ปุ่มอนุมัติ/ไม่อนุมัติเหมือนเดิม ไม่ต้องเปิดการ์ดงาน)
    var hasLinkedTask = n.type !== 'changeRequestNew' && (n.taskId || n.personalTaskId);
    var clickable = n.type !== 'changeRequestNew' && (!n.read || hasLinkedTask);
    if (clickable) {
      card.style.cursor = 'pointer';
      card.onclick = function () {
        if (!n.read) markNotificationReadAndRefresh(n.id);
        if (n.personalTaskId) {
          openPersonalTaskModal(n.personalTaskId);
        } else if (n.taskId) {
          openTaskFromNotification(n.taskId);
        }
      };
    }
    container.appendChild(card);
  });
}

// ===== เปิดการ์ดรายละเอียดงาน (ปฏิทินหลัก) จากการแจ้งเตือน - ซ้อนขึ้นมาโดยไม่ปิดลิสต์แจ้งเตือน =====
// ใช้ calendarInstance.getEventById แทนการยิง API ใหม่ เพราะ events ทั้งหมดโหลดแบบ real-time listener
// (ไม่จำกัดช่วงวันที่) อยู่แล้วใน lastRenderedEvents ตั้งแต่เปิดหน้าเว็บ
function openTaskFromNotification(taskId) {
  var ev = calendarInstance && calendarInstance.getEventById ? calendarInstance.getEventById(taskId) : null;
  if (ev) {
    openTaskDetailModal(ev);
  } else {
    Swal.fire({ icon: 'info', title: 'ไม่พบงานนี้แล้ว', text: 'งานอาจถูกลบหรือยกเลิกไปแล้ว' });
  }
}

function markNotificationReadAndRefresh(notificationId) {
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('markNotificationRead', { token: token, notificationId: notificationId }).then(function () {
    var n = lastNotifications.find(function (x) { return x.id === notificationId; });
    if (n) n.read = true;
    renderNotificationsList();
  });
}

function approveFromNotification(btn, requestId, notificationId) {
  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังอนุมัติ...');
  callApi('approveChangeRequest', { token: token, requestId: requestId }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: 'อนุมัติแล้ว' });
      markNotificationReadAndRefresh(notificationId);
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
      setButtonLoading(btn, false);
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    setButtonLoading(btn, false);
  });
}

function rejectFromNotification(btn, requestId, notificationId) {
  var token = localStorage.getItem(TOKEN_KEY);
  setButtonLoading(btn, true, 'กำลังปฏิเสธ...');
  callApi('rejectChangeRequest', { token: token, requestId: requestId }).then(function (result) {
    if (result.success) {
      Toast.fire({ icon: 'success', title: 'ไม่อนุมัติคำขอนี้แล้ว' });
      markNotificationReadAndRefresh(notificationId);
    } else {
      Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
      setButtonLoading(btn, false);
    }
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
    setButtonLoading(btn, false);
  });
}

/** ปุ่ม "อ่านทั้งหมด" ในเมนูแจ้งเตือน — ยิง markNotificationRead พร้อมกันทีละหลายรายการสำหรับทุกรายการที่ยังไม่ได้อ่าน
 * (ไม่รวมรายการ changeRequestNew ที่ยังไม่ได้กดอนุมัติ/ไม่อนุมัติ เพราะการันตีว่า Admin ยังต้องเปิดมาดำเนินการอยู่ดี) */
function markAllNotificationsRead(btn) {
  var token = localStorage.getItem(TOKEN_KEY);
  var unread = lastNotifications.filter(function (n) { return !n.read && n.type !== 'changeRequestNew'; });
  if (unread.length === 0) {
    Toast.fire({ icon: 'info', title: 'อ่านหมดแล้ว' });
    return;
  }
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังทำเครื่องหมาย...';
  Promise.all(unread.map(function (n) {
    return callApi('markNotificationRead', { token: token, notificationId: n.id }).then(function () {
      n.read = true;
    });
  })).then(function () {
    renderNotificationsList();
    Toast.fire({ icon: 'success', title: 'อ่านทั้งหมดแล้ว' });
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'ทำเครื่องหมายไม่สำเร็จบางรายการ', text: err.message });
    renderNotificationsList();
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = originalText;
  });
}

function openMyRequestsModal() {
  document.getElementById('my-requests-modal-overlay').style.display = 'flex';
  renderNotificationsList();
  _pushModalNav('my-requests-modal-overlay');
}
function closeMyRequestsModal() {
  document.getElementById('my-requests-modal-overlay').style.display = 'none';
}

// ===== หน้าตั้งค่าการแจ้งเตือน (#notif-settings-modal-overlay) - แยกจากกระดิ่ง/ประวัติแจ้งเตือนโดยเจตนา:
// ที่นี่ควบคุม "จะรับอะไรบ้าง/รับทางไหน" ส่วนกระดิ่งควบคุม "ดูประวัติที่เคยส่งมา" (เข้าถึงได้จากปุ่ม "ดูประวัติ"
// ในหน้านี้) ค่า per-type ผูกกับ accounts/{id}.notifPrefs ทาง Cloud Function getNotificationPrefs/
// updateNotificationPrefs (ดู functions/index.js) ส่วนเสียงเป็น localStorage ล้วนๆ ไม่ต้องมี backend =====
var NOTIF_CATEGORY_LABELS = {
  assigned: { label: 'ถูกมอบหมาย/ถอดออกจาก Task', desc: 'เมื่อมีคนมอบหมายงานให้คุณ หรือถอดคุณออกจากงาน/Task' },
  done: { label: 'Task เสร็จแล้ว', desc: 'เมื่อ Task ที่คุณรับผิดชอบร่วม ถูกทำเครื่องหมายว่าเสร็จแล้ว' },
  rescheduled: { label: 'เลื่อนวันครบกำหนด', desc: 'เมื่อวันครบกำหนดของงาน/Task ที่เกี่ยวข้องถูกเปลี่ยน' },
  deleted: { label: 'Task ถูกลบ', desc: 'เมื่องาน/Task ที่คุณเกี่ยวข้องถูกลบไป' },
  dueReminder: { label: 'เตือนใกล้ครบ/เลยกำหนด', desc: 'แจ้งอัตโนมัติทุกเช้า ถ้าใกล้หรือเลยกำหนดแล้วยังไม่เสร็จ' }
};
var NOTIF_ADMIN_CATEGORY_LABELS = {
  calendarActivity: { label: 'ความเคลื่อนไหวปฏิทินหลัก', desc: 'เมื่อมีการสร้าง/แก้ไข/ยกเลิกงานในปฏิทินหลัก' },
  approvalRequest: { label: 'คำขออนุมัติใหม่', desc: 'เมื่อมีคำขอลบงาน/เปลี่ยนวันงาน รอการอนุมัติ' }
};
var _notifSettingsPrefs = null;

function openNotifSettingsModal() {
  document.getElementById('notif-settings-modal-overlay').style.display = 'flex';
  _pushModalNav('notif-settings-modal-overlay');
  loadAndRenderNotifSettings();
}
function closeNotifSettingsModal() {
  document.getElementById('notif-settings-modal-overlay').style.display = 'none';
}

// ===== Skeleton หน้าตั้งค่าการแจ้งเตือน - จำลองแถว toggle (.ns-row: label+desc ซ้าย, สวิตช์ขวา) ตาม
// จำนวนคร่าวๆ ที่จะเห็นจริง ไม่ต้องคำนวณจำนวนแถวแอดมิน/role ให้ตรงเป๊ะ เพราะโชว์แค่ชั่วคราวระหว่างรอเท่านั้น =====
function renderNotifSettingsSkeleton() {
  var rows = '';
  for (var i = 0; i < 5; i++) {
    rows += '<div class="ns-row"><div class="ns-meta">' +
      '<span class="skel" style="display:block;width:150px;height:13px;margin-bottom:6px;"></span>' +
      '<span class="skel" style="display:block;width:210px;height:11px;"></span></div>' +
      '<span class="skel" style="width:42px;height:24px;border-radius:999px;flex-shrink:0;"></span></div>';
  }
  return rows;
}

function loadAndRenderNotifSettings() {
  var body = document.getElementById('notif-settings-body');
  body.innerHTML = renderNotifSettingsSkeleton();
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getNotificationPrefs', { token: token }).then(function (result) {
    _notifSettingsPrefs = (result && result.prefs) || {};
    renderNotifSettings();
  }).catch(function (err) {
    body.innerHTML = '<p style="font-size:13px;color:var(--danger-text)">โหลดค่าตั้งค่าไม่สำเร็จ: ' + err.message + '</p>';
  });
}

function nsSwitch(key, checked, disabled) {
  return '<label class="ns-sw"><input type="checkbox" ' + (checked ? 'checked' : '') + (disabled ? ' disabled' : '') +
    ' onchange="onNotifSwitchChange(\'' + key + '\', this)"><span class="ns-sw-track"></span></label>';
}
function nsToggleRow(key, meta, checked) {
  return '<div class="ns-row"><div class="ns-meta"><div class="ns-label">' + meta.label + '</div>' +
    '<div class="ns-desc">' + meta.desc + '</div></div>' + nsSwitch(key, checked, false) + '</div>';
}

function renderNotifSettings() {
  var body = document.getElementById('notif-settings-body');
  var role = localStorage.getItem(ROLE_KEY);
  var prefs = _notifSettingsPrefs || {};

  var permission = ('Notification' in window) ? Notification.permission : 'unsupported';
  var permStatusHtml;
  if (permission === 'granted') {
    permStatusHtml = '<span class="ns-status on">เปิดอยู่</span>';
  } else if (permission === 'denied') {
    permStatusHtml = '<span class="ns-status off">ถูกบล็อก</span>';
  } else {
    permStatusHtml = '<span class="ns-status off">ยังไม่อนุญาต</span>';
  }

  var permBannerHtml = '';
  if (permission === 'default') {
    permBannerHtml = '<div class="ns-perm-banner"><span>⚠️ ยังไม่ได้อนุญาตแจ้งเตือนเด้งบนเบราว์เซอร์นี้ กดปุ่มด้านข้างเพื่อเปิดใช้งาน</span>' +
      '<button onclick="requestPushPermissionFromSettings(this)">อนุญาต</button></div>';
  } else if (permission === 'denied') {
    permBannerHtml = '<div class="ns-perm-banner"><span>🚫 คุณเคยปฏิเสธไว้ก่อนหน้านี้ ต้องไปเปิดเองในตั้งค่าเว็บไซต์ของเบราว์เซอร์</span></div>';
  }

  var channelsHtml = '<div class="ns-group-label">ช่องทางรับแจ้งเตือน</div><div class="ns-group">' +
    '<div class="ns-row"><div class="ns-meta"><div class="ns-label">แจ้งเตือนในแอป</div>' +
    '<div class="ns-desc">ขึ้นที่กระดิ่งด้านบนเสมอ (ปิดไม่ได้เพราะเป็นฐานหลักของระบบ)</div></div>' +
    '<span class="ns-status on">เปิดอยู่</span></div>' +
    '<div class="ns-row"><div class="ns-meta"><div class="ns-label">แจ้งเตือนเด้ง (Push)</div>' +
    '<div class="ns-desc">เด้งที่มือถือ/เดสก์ท็อปได้แม้ปิดแอปอยู่ - โชว์สถานะจริงจากเบราว์เซอร์</div></div>' +
    permStatusHtml + '</div>' +
    '<div class="ns-row"><div class="ns-meta"><div class="ns-label">เสียงแจ้งเตือน</div>' +
    '<div class="ns-desc">เล่นเสียงตอนมีแจ้งเตือนใหม่ ขณะเปิดแอปอยู่</div></div>' +
    nsSwitch('sound', isNotifSoundEnabled(), false) + '</div>' +
    '</div>' + permBannerHtml;

  var typeRows = Object.keys(NOTIF_CATEGORY_LABELS).map(function (key) {
    return nsToggleRow(key, NOTIF_CATEGORY_LABELS[key], prefs[key] !== false);
  }).join('');
  var typesHtml = '<div class="ns-group-label">ประเภทที่ต้องการรับแจ้งเตือน</div><div class="ns-group">' + typeRows + '</div>';

  var adminHtml = '';
  if (role === 'admin') {
    var adminRows = Object.keys(NOTIF_ADMIN_CATEGORY_LABELS).map(function (key) {
      return nsToggleRow(key, NOTIF_ADMIN_CATEGORY_LABELS[key], prefs[key] !== false);
    }).join('');
    adminHtml = '<div class="ns-group-label">เฉพาะ Admin</div><div class="ns-group">' + adminRows + '</div>';
  }

  var testBtnHtml = '<button class="ns-test-btn" onclick="sendTestNotifFromSettings(this)">🔔 ส่งแจ้งเตือนทดสอบ</button>';

  body.innerHTML = channelsHtml + typesHtml + adminHtml + testBtnHtml;
}

// ===== สลับตั้งค่ารายประเภท - อัปเดต UI ทันที (optimistic) แล้วค่อยยิง backend, ถ้าพลาดค่อย revert กลับ
// (key === 'sound' ไม่ยิง backend เพราะเป็นแค่ localStorage ของเครื่องนี้) =====
function onNotifSwitchChange(key, inputEl) {
  var newValue = inputEl.checked;
  if (key === 'sound') {
    setNotifSoundEnabled(newValue);
    return;
  }
  var prevValue = _notifSettingsPrefs ? _notifSettingsPrefs[key] !== false : true;
  if (_notifSettingsPrefs) _notifSettingsPrefs[key] = newValue;
  var token = localStorage.getItem(TOKEN_KEY);
  var payload = {};
  payload[key] = newValue;
  callApi('updateNotificationPrefs', { token: token, prefs: payload }).then(function (result) {
    if (!result || !result.success) throw new Error((result && result.message) || 'บันทึกไม่สำเร็จ');
  }).catch(function (err) {
    inputEl.checked = prevValue;
    if (_notifSettingsPrefs) _notifSettingsPrefs[key] = prevValue;
    Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message });
  });
}

// ===== ปุ่ม "อนุญาต" ในแบนเนอร์ - เรียก setupPushNotifications() ซ้ำ (มันเช็ค Notification.permission เอง
// ว่าเป็น 'default' ถึงจะขอสิทธิ์จริง) แล้วรอสักครู่ค่อย re-render เพื่ออัปเดต badge ตามที่ผู้ใช้เพิ่งเลือกตอบ =====
function requestPushPermissionFromSettings(btn) {
  setButtonLoading(btn, true, '...');
  setupPushNotifications();
  setTimeout(function () {
    renderNotifSettings();
  }, 600);
}

function sendTestNotifFromSettings(btn) {
  setButtonLoading(btn, true, 'กำลังส่ง...');
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('sendTestNotification', { token: token }).then(function () {
    Toast.fire({ icon: 'success', title: 'ส่งแจ้งเตือนทดสอบแล้ว รอสักครู่' });
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'ส่งไม่สำเร็จ', text: err.message });
  }).finally(function () {
    setButtonLoading(btn, false);
  });
}

function manualRefresh() {
  var icon = document.getElementById('refresh-icon');
  icon.classList.add('spinning');

  var token = localStorage.getItem(TOKEN_KEY);
  var role = localStorage.getItem(ROLE_KEY);
  Promise.all([
    loadHolidays(),
    loadMemberSidebar(),
    loadTodoList()
  ]).then(function () {
    if (token) { loadAdminEvents(token); } else { loadPublicEvents(); }
    Toast.fire({ icon: 'success', title: 'รีเฟรชข้อมูลแล้ว' });
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'รีเฟรชไม่สำเร็จ', text: err.message });
  }).finally(function () {
    setTimeout(function () { icon.classList.remove('spinning'); }, 300);
  });
}

// เก็บชื่อฟังก์ชันไว้ให้ทุกจุดที่เรียกใช้ทั่วไฟล์ (~12 จุด) ยังทำงานได้โดยไม่ต้องแก้ทีละจุด
// แต่ไม่ต้องทำอะไรจริงแล้ว เพราะ setupTasksRealtimeListener() ทำให้ปฏิทินอัปเดตอัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยนอยู่แล้ว
function loadPublicEvents() {
  // no-op: real-time listener จัดการให้แล้ว
}

function loadAdminEvents(token) {
  // no-op: real-time listener จัดการให้แล้ว (พารามิเตอร์ token ไม่ได้ใช้แล้ว เก็บไว้กันจุดเรียกใช้เดิมพัง)
}

function renderCalendar(result) {
  if (!result.success) {
    console.error(result.message);
    hidePageLoading();
    return;
  }

  if (calendarInstance) {
    calendarInstance.removeAllEvents();
    calendarInstance.addEventSource(result.events);
    return;
  }

  var calendarEl = document.getElementById('calendar');
  var mobile = isMobileView();
  var savedViewPref = localStorage.getItem(CALENDAR_VIEW_PREF_KEY);
  var initialViewToUse = mobile ? (savedViewPref || 'listMonth') : 'dayGridMonth';
  calendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: initialViewToUse,
    headerToolbar: mobile
      ? { left: 'prev,next', center: 'title', right: 'today' }
      // Phase: เพิ่มมุมมอง "รายปี" (multiMonthYear) ต่อจากเดือน/สัปดาห์/วันเดิม — เฉพาะจอเดสก์ท็อป/แท็บเล็ต
      // เท่านั้น จอมือถือแคบเกินจะอ่าน 12 เดือนพร้อมกันจึงไม่เพิ่มปุ่มนี้ในโหมดมือถือ
      : { left: 'prev,next today', center: 'title', right: 'multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay' },
    locale: 'th',
    height: 'auto',
    eventDisplay: 'block',
    allDayText: 'ทั้งวัน',
    buttonText: { today: 'วันนี้', year: 'year' },
    // ข้อความ "No events to display" เริ่มต้นของปลั๊กอิน List เป็นภาษาอังกฤษ ล้วนโผล่เฉพาะตอนทั้งสัปดาห์/วัน
    // ที่เลือกดูไม่มีงานเลยสักอันเดียว (FullCalendar ไม่สร้าง <table> แถวรายวันมาให้ fillEmptyListDays()
    // เติมแถวว่างต่อจึงต้องอาศัยข้อความนี้แทนในเคสนี้โดยเฉพาะ)
    noEventsText: 'ไม่มีงานในช่วงนี้',
    events: result.events,
    // Phase: ลดความแน่นของมุมมองเดือน (แนวทาง 1 จาก preview ที่คุยกับผู้ใช้) — โชว์งานเต็มคำแค่ 3 อันแรก
    // ต่อวัน ที่เหลือยุบเป็น "+N เพิ่มเติม" กดแล้วเปิด bottom sheet ของเราเอง (มือถือ) แทน popover
    // ค้างจอแคบเดิมของ FullCalendar - ใช้เลข 3 คงที่ทั้ง PC/มือถือให้พฤติกรรมสม่ำเสมอ ไม่มีโหมดพิเศษแยก
    dayMaxEvents: 3,
    moreLinkClick: function (info) {
      if (!isMobileView()) return 'popover'; // จอกว้างพอ ใช้ popover เริ่มต้นของ FullCalendar ตามเดิม
      var evs = (info.allSegs || [])
        .map(function (seg) { return seg.event; })
        .filter(function (ev) { return !ev.extendedProps.isHoliday; });
      openDaySheet(info.date, evs);
      return 'none'; // กันไม่ให้ FullCalendar เปิด popover ซ้อนทับ sheet ของเราอีกชั้น
    },
    // Phase: การ์ดประเภทงาน (ไซด์บาร์ขวา) กดกรองปฏิทินได้ — ใส่ class ให้งานที่ไม่ตรงกับตัวกรองที่เลือกอยู่
    // แล้วซ่อนด้วย CSS (.fc-type-filtered) ดู setTaskTypeFilter() ที่เรียก calendarInstance.render() เพื่อให้
    // callback นี้ถูกประเมินใหม่ทุกครั้งที่เปลี่ยนตัวกรอง (ไม่กระทบ event ของจริงที่โหลดมา แค่ซ่อน/โชว์ด้วย CSS)
    eventClassNames: function (arg) {
      if (arg.event.extendedProps.isHoliday) return [];
      if (!activeTaskTypeFilter) return [];
      return arg.event.extendedProps.taskType === activeTaskTypeFilter ? [] : ['fc-type-filtered'];
    },
    datesSet: function (arg) {
      // มุมมองรายปี (multiMonthYear) ช่วงวันที่ครอบคลุมทั้งปี ไม่ใช่แค่เดือนเดียว — ถ้าเอาไปอัปเดตแผง
      // "📅 วันหยุดเดือนนี้" ตรงๆ จะกลายเป็นโชว์วันหยุดทั้งปีทั้งที่หัวข้อบอกว่า "เดือนนี้" ทำให้เข้าใจผิด
      // จึงข้ามไปเลยตอนอยู่มุมมองรายปี ปล่อยให้แผงคงค่าจากเดือนล่าสุดที่เคยดูไว้แทน
      if (arg.view.type === 'multiMonthYear') return;
      renderMonthHolidayList(arg.view.currentStart, arg.view.currentEnd);
      // แถบสลับช่วง "วันนี้/สัปดาห์นี้/เดือนนี้" ของมุมมอง List (มือถือ) - โชว์เฉพาะตอนอยู่มุมมอง List
      // และไฮไลต์ปุ่มที่ตรงกับ view.type ปัจจุบัน ต้องเรียกตรงนี้ (ไม่ใช่ eventsSet) เพราะเปลี่ยนมุมมองแล้ว
      // แม้ยังไม่มี event ใหม่มาก็ต้องอัปเดตทันที
      updateListRangeToggle(arg.view.type);
    },
    eventsSet: function () {
      // ยิงทุกครั้งที่ FullCalendar render เนื้อหาชุดใหม่เสร็จ (เปลี่ยนเดือน/เพิ่ม-แก้-ลบงาน/โหลดครั้งแรก)
      // ใช้จุดนี้เรียง list view ใหม่ให้วันล่าสุดอยู่บนสุด แทนที่จะเรียงเก่า->ใหม่ตามค่าเริ่มต้นของไลบรารี
      reverseListViewDayOrder();
      // Phase: เติมแถว "ไม่มีงาน" ให้วันว่างในมุมมอง List ช่วงสั้น (วันนี้/สัปดาห์นี้) ต้องรันหลัง
      // reverseListViewDayOrder เสมอ เพราะฟังก์ชันนี้อ้างอิงลำดับ/กลุ่มแถวที่ reverse แล้วเป็นฐาน
      fillEmptyListDays();
      // จุดเดียวกันนี้ครอบคลุมทั้งเปลี่ยนเดือนและข้อมูลอัปเดต จึงใช้อัปเดตตัวเลขท้ายชื่อประเภทงาน
      // ในไซด์บาร์ขวาด้วย ให้ตรงกับช่วงเดือน/มุมมองที่กำลังดูอยู่เสมอ
      updateLegendCounts();
    },
    dayCellDidMount: function (arg) {
      var d = arg.date;
      var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var matched = holidaysCache.filter(function (h) {
        if (h.type === 'date') return h.value === dateStr;
        return h.type === 'weekly' && d.getDay() === h.value;
      });
      if (matched.length === 0) return;

      var frame = arg.el.querySelector('.fc-daygrid-day-frame') || arg.el;
      frame.classList.add('fc-holiday-cell');
      // มุมมองรายปีเซลล์เล็กมาก ใส่แค่ไฮไลต์สีพอ ไม่ใส่ป้ายชื่อวันหยุดตัวหนังสือ (ล้นเซลล์แน่นอน)
      if (arg.view.type === 'multiMonthYear') return;
      var label = document.createElement('div');
      label.className = 'holiday-cell-label';
      label.textContent = matched.map(function (h) { return h.name; }).join(', ');
      frame.appendChild(label);
    },
    eventContent: function (arg) {
      if (arg.event.extendedProps.isHoliday) return true;
      // มุมมองรายปี เซลล์เล็กมาก ปล่อยให้ FullCalendar ใช้การ์ดเหตุการณ์แบบมาตรฐาน (จุดสี+ชื่อย่อ) แทน
      // เลย์เอาต์แถวไอคอน/เวลาที่ปรับเองด้านล่างนี้ ซึ่งออกแบบมาสำหรับเซลล์เดือน/สัปดาห์/วันที่ใหญ่กว่า
      if (arg.view.type === 'multiMonthYear') return true;
      var staff = arg.event.extendedProps.staff || [];
      var shown = staff.slice(0, 4);
      var dotsHtml = shown.map(function (s) {
        return '<span style="width:7px;height:7px;border-radius:50%;background:' + s.color +
          ';display:inline-block;flex-shrink:0"></span>';
      }).join('');
      if (staff.length > 4) {
        dotsHtml += '<span style="font-size:10px;color:inherit">+' + (staff.length - 4) + '</span>';
      }

      var isListView = arg.view.type.indexOf('list') === 0;

      // งานระบุเวลาในโหมด Grid (PC) เดิมไม่โชว์เวลาเลย เพิ่มให้เห็นชัดว่างานเริ่มกี่โมง
      var timeHtml = '';
      if (!arg.event.allDay && !isListView) {
        var timeText = arg.event.start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        timeHtml = '<span style="font-size:10px;font-weight:700;flex-shrink:0">' + timeText + '</span>';
      }

      var wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = isListView ? 'column' : 'row';
      wrapper.style.alignItems = isListView ? 'flex-start' : 'center';
      wrapper.style.gap = '3px';
      wrapper.style.overflow = 'hidden';
      wrapper.style.padding = '1px 2px';
      wrapper.style.width = '100%';
      wrapper.style.minWidth = '0';

      var topRow = document.createElement('div');
      topRow.style.display = 'flex';
      // มุมมอง List: จุดสี/เวลาอยู่ชิดขอบบนของบรรทัดแรกเท่านั้น (ไม่ center ทั้งแนวตั้ง) เพราะชื่องาน
      // อาจขึ้นหลายบรรทัดแล้ว (แก้บั๊กชื่องานยาวดันจอมือถือล้น - เปลี่ยนจากตัดจบ "..." เป็นขึ้นบรรทัดใหม่แทน)
      topRow.style.alignItems = isListView ? 'flex-start' : 'center';
      topRow.style.gap = '3px';
      topRow.style.overflow = 'hidden';
      topRow.style.width = '100%';
      topRow.style.minWidth = '0';
      topRow.innerHTML = timeHtml + dotsHtml;

      var titleSpan = document.createElement('span');
      titleSpan.style.minWidth = '0';
      titleSpan.style.flex = '1';
      if (isListView) {
        // List view: ให้ขึ้นบรรทัดใหม่แทนการตัดจบด้วย "..." (ผู้ใช้เลือกแบบนี้ - เห็นชื่องานเต็มเสมอ)
        titleSpan.style.whiteSpace = 'normal';
        titleSpan.style.wordBreak = 'break-word';
        titleSpan.style.fontWeight = '600';
      } else {
        // มุมมอง Grid (เดือน/สัปดาห์/วัน) เซลล์เตี้ย ยังต้องตัดจบบรรทัดเดียวเหมือนเดิม
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.whiteSpace = 'nowrap';
      }
      titleSpan.textContent = arg.event.title;
      topRow.appendChild(titleSpan);
      wrapper.appendChild(topRow);

      if (isListView) {
        var dateLabel = document.createElement('div');
        dateLabel.style.fontSize = '12px';
        dateLabel.style.color = 'var(--text-muted)';
        dateLabel.textContent = formatEventDateRange(arg.event);
        wrapper.appendChild(dateLabel);
      }

      return { domNodes: [wrapper] };
    },
    eventDidMount: function (arg) {
      if (arg.event.extendedProps.isHoliday) return;
      var isListView = arg.view.type.indexOf('list') === 0;
      if (!isListView) return; // Grid มีแถบสีเต็มอยู่แล้ว ไม่ต้องเพิ่ม
      var color = arg.event.backgroundColor || arg.event.borderColor || '#f4f5f7';
      arg.el.style.backgroundColor = hexToRgba(color, 0.22);
    },
    eventClick: function (info) {
      if (info.event.extendedProps.isHoliday) return;
      // แก้บั๊ก: ตอนกดงานจากใน popover "+n เพิ่มเติม" ของ FullCalendar (จอ PC ใช้ popover เริ่มต้นของ
      // ไลบรารีเอง - ดู moreLinkClick ด้านบน) ตัว popover จะไม่ปิดอัตโนมัติเพราะเรากดงาน "ใน" popover เอง
      // (ไม่ใช่กดนอกพื้นที่ ซึ่งเป็นเงื่อนไขปิดปกติของ FullCalendar) และ .fc-popover มี z-index สูงมาก (ปกติ
      // 9999 ตามค่ามาตรฐานไลบรารี) สูงกว่า modal รายละเอียดงานของเรา (2050) ผลคือ popover ลอยค้างทับ modal
      // ที่เพิ่งเปิดพอดี จึงต้องปิด/เอา popover ออกจากจอเองตรงนี้ก่อนเปิด modal เสมอ กันปัญหานี้ทุกครั้ง
      document.querySelectorAll('.fc-popover').forEach(function (el) { el.remove(); });
      openTaskDetailModal(info.event);
    }
  });
  calendarInstance.render();
  setupCalendarSwapEffect();
  updateViewToggleLabel(initialViewToUse);
  hidePageLoading();
}

// ================================================================================
// ===== Personal Task Board (ptb/ptm) — ระบบจัดการ Task รายบุคคล ================
// ================================================================================
// แยกจาก collection "tasks" เดิม (= Event ปฏิทิน) และแยกจาก To-Do List (kanban ตาม
// ประเภทงานของ Event ที่ยังไม่ระบุวันที่) โดยสิ้นเชิง — นี่คือบอร์ด Kanban ส่วนบุคคลใหม่
// ต้อง login ก่อนถึงจะใช้ได้ (personalTasks ไม่ public เหมือน tasks/holidays)

var _personalTasksCache = [];
var _taskTagsCache = [];
var _ptbCurrentPersonId = null;
var _ptmEditingTaskId = null;
var _ptmReadOnly = false; // true = กำลังเปิดดู Task ของคนอื่นที่ไม่มีสิทธิ์แก้ไข/ลบ (ดู openPersonalTaskModal)
var _unsubPersonalTasks = null;

// ===== ระบบคอมเมนต์ของ Personal Task Board - แพทเทิร์นเดียวกับ _tdCommentsUnsub/_tdCurrentTaskId ของ Task
// หลัก (ต้อง unsubscribe ทุกครั้งที่ปิด modal กันบั๊ก listener รั่วข้ามบัญชี) ต่างกันแค่ collection เป็น
// personalTasks และฟิลด์ผู้รับผิดชอบเป็น assigneeIds (ไม่ใช่ staffIds) =====
var _ptmCmtUnsub = null;
var _ptmCmtCurrentTaskId = null;
var _unsubTaskTags = null;
// ไฟล์ที่ผู้ใช้เลือกแนบไว้ตอนกำลัง "เพิ่ม Task ใหม่" (ยังไม่มี taskId จริง เลยอัปโหลดขึ้น Storage ไม่ได้ทันที
// เพราะ Storage Rules เช็ค assigneeIds ของ Task ที่มีอยู่จริงในฐานข้อมูล) - พักไว้ในนี้ก่อน แล้วอัปโหลดจริง
// ทันทีหลังบันทึก Task สำเร็จใน savePersonalTaskModal() ผู้ใช้เลยทำ "เพิ่ม Task + แนบไฟล์" ในขั้นตอนเดียวได้
// โดยไม่ต้องปิด-เปิด modal ใหม่มาแนบทีหลัง (ลบออกจาก array ด้วย ptmRemovePendingFile ได้ก่อนบันทึกจริง)
var _ptmPendingFiles = [];

var _personalTasksLoaded = false;

function setupPersonalTasksListener() {
  if (_unsubPersonalTasks) return; // กันสมัครซ้ำถ้าเรียกซ้อน

  _unsubPersonalTasks = fbDb.collection('personalTasks').onSnapshot(function (snapshot) {
    _personalTasksLoaded = true;
    _personalTasksCache = snapshot.docs.map(function (doc) {
      var d = doc.data();
      return {
        taskId: doc.id,
        title: d.title,
        description: d.description || '',
        status: d.status,
        priority: d.priority,
        tag: d.tag || '',
        dueDate: d.dueDate ? firestoreDateToJs(d.dueDate) : null,
        linkedEventId: d.linkedEventId || null,
        assigneeIds: d.assigneeIds || [],
        checklist: d.checklist || [],
        attachments: d.attachments || [],
        createdBy: d.createdBy
      };
    });
    updatePtbSummaryCard();
    if (document.getElementById('task-board-modal-overlay').style.display === 'flex') {
      refreshCurrentPtbView();
    }
  }, function (err) {
    console.error('personalTasks listener error', err);
  });

  _unsubTaskTags = fbDb.collection('taskTags').onSnapshot(function (snapshot) {
    _taskTagsCache = snapshot.docs.map(function (doc) { return doc.id; });
  }, function (err) {
    console.error('taskTags listener error', err);
  });
}

function teardownPersonalTasksListener() {
  if (_unsubPersonalTasks) { _unsubPersonalTasks(); _unsubPersonalTasks = null; }
  if (_unsubTaskTags) { _unsubTaskTags(); _unsubTaskTags = null; }
  _personalTasksCache = [];
  _taskTagsCache = [];
  _personalTasksLoaded = false;
}

function updatePtbSummaryCard() {
  var myId = localStorage.getItem(ACCOUNT_ID_KEY);
  var mine = _personalTasksCache.filter(function (t) {
    return t.assigneeIds.indexOf(myId) !== -1 && t.status !== 'done';
  });
  var el = document.getElementById('ptb-summary-count');
  if (el) el.textContent = mine.length === 0 ? 'ไม่มีงานค้าง' : mine.length + ' งานที่ต้องทำ';
  updateOrgTaskSummaryCard();
}

// การ์ด "สรุปงานภาพรวมขององค์กร" ในไซด์บาร์ "สรุป" (เฉพาะมือถือ - ดู style.css) - คำนวณจาก _personalTasksCache
// ตรงๆ (แคชนี้มีงาน "ทั้งบริษัท" อยู่แล้ว ไม่ใช่แค่ของฉัน ดู setupPersonalTasksListener()) ไม่ต้องยิง API เพิ่ม
// เรียกซ้ำทุกครั้งที่แคชอัปเดต (ดู updatePtbSummaryCard ด้านบนที่เรียกฟังก์ชันนี้ต่อ)
function updateOrgTaskSummaryCard() {
  var totalEl = document.getElementById('ots-total-n');
  if (!totalEl) return; // การ์ดนี้อยู่ในไซด์บาร์ที่ยังไม่ถูก render (ยังไม่ login) - ข้ามไปเงียบๆ
  if (!_personalTasksLoaded) return;
  var all = _personalTasksCache;
  var doneN = 0, peopleSet = {};
  all.forEach(function (t) {
    if (t.status === 'done') doneN++;
    (t.assigneeIds || []).forEach(function (id) { peopleSet[id] = true; });
  });
  var overdueN = all.filter(isPtbOverdue).length;
  document.getElementById('ots-total-n').textContent = all.length;
  document.getElementById('ots-done-n').textContent = doneN;
  document.getElementById('ots-overdue-n').textContent = overdueN;
  document.getElementById('ots-people-n').textContent = Object.keys(peopleSet).length;
}

// เปิด Task Board ไปที่แท็บ "ภาพรวมทั้งบริษัท" ตรงๆ เลย - เรียกจากการ์ด #org-task-summary-card บนมือถือ
function openOrgTaskDashboard() {
  openTaskBoardModal();
  switchTaskBoardView('admin');
}

// แก้บั๊กที่ผู้ใช้แจ้ง: การ์ด "สรุปงานภาพรวมขององค์กร" (sidebar มือถือ, ใช้ฟังก์ชันนี้ผ่าน updateOrgTaskSummaryCard)
// กับ Task Board "ภาพรวมทั้งบริษัท" (ดึงเลข overdueCount ตรงจาก backend getCompanyTaskSummary) นับจำนวน
// "เกินกำหนด" ไม่ตรงกัน เพราะ 2 จุดนี้ใช้นิยาม "เกินกำหนด" คนละแบบ - เดิมฟังก์ชันนี้เทียบ timestamp ดิบ
// (dueDate < เวลาปัจจุบันเป๊ะๆ) ทำให้งานที่ครบกำหนด "วันนี้" (เก็บเป็นเที่ยงคืนของวันนั้น) โดนตีว่าเกินกำหนด
// ทันทีที่เลยเที่ยงคืนนั้นไปแค่เสี้ยววินาที ทั้งที่ยังไม่เลยวันจริงๆ ต่างจากฝั่ง backend (getCompanyTaskSummary
// ใน functions/index.js) ที่แก้เป็นเทียบ "วันปฏิทิน" แล้วตั้งแต่ก่อนหน้านี้ - เปลี่ยนมาเทียบวันปฏิทิน (ตัดเวลา
// ออกด้วย setHours(0,0,0,0) ก่อนเทียบ) แบบเดียวกับที่ใช้อยู่แล้วใน exportTaskReport ด้านล่าง (บรรทัดที่มี
// "todayOnly") ให้ตรงกันทั้งแอป
function isPtbOverdue(t) {
  if (t.status === 'done' || !t.dueDate) return false;
  var todayOnly = new Date(); todayOnly.setHours(0, 0, 0, 0);
  var due = new Date(t.dueDate); due.setHours(0, 0, 0, 0);
  return due.getTime() < todayOnly.getTime();
}

function fmtPtbDate(d) {
  if (!d || isNaN(d.getTime())) return '-'; // กันเผื่อ d เป็น Date object ที่ invalid หลุดมาจากที่อื่น
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function ptbStaffInitial(staffId) {
  var s = staffMapCache[staffId];
  return s ? (s.firstName || '?').charAt(0) : '?';
}
function ptbStaffColor(staffId) {
  var s = staffMapCache[staffId];
  return s ? (s.colorHex || '#888780') : '#888780';
}
function ptbStaffName(staffId) {
  var s = staffMapCache[staffId];
  return s ? (s.firstName + (s.lastName ? ' ' + s.lastName : '')) : 'ไม่ทราบชื่อ';
}

function openTaskBoardModal() {
  // เปิดให้ทุก role ที่ login แล้วเห็นแท็บ "ภาพรวมทั้งบริษัท" เหมือนกันหมด (เดิมซ่อนไว้เฉพาะ Admin/CEO)
  // ผู้ใช้ยืนยันแล้วว่าต้องการให้ทุกคน "ดู" ภาพรวม/บอร์ดรายคนได้ เพื่อช่วยกัน manage งาน แต่การแก้ไข/ลบ/
  // เปลี่ยนสถานะงานของคนอื่นยังจำกัดสิทธิ์เหมือนเดิม (คุมที่ canManagePersonalTask ฝั่ง Cloud Function)
  document.getElementById('ptb-tabs').style.display = 'flex';
  switchTaskBoardView('mystaff');
  document.getElementById('task-board-modal-overlay').style.display = 'flex';
  _pushModalNav('task-board-modal-overlay');
}
function closeTaskBoardModal() {
  document.getElementById('task-board-modal-overlay').style.display = 'none';
}

function switchTaskBoardView(view) {
  document.querySelectorAll('.ptb-view').forEach(function (v) { v.classList.remove('active'); });
  document.querySelectorAll('.ptb-tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === view); });

  if (view === 'mystaff') {
    document.getElementById('ptb-view-mystaff').classList.add('active');
    document.getElementById('ptb-modal-title').textContent = '📋 Task ของฉัน';
    renderPtbBoard('ptb-board-mystaff', localStorage.getItem(ACCOUNT_ID_KEY));
  } else if (view === 'admin') {
    document.getElementById('ptb-view-admin').classList.add('active');
    document.getElementById('ptb-modal-title').textContent = '📋 Task Board — ภาพรวมทั้งบริษัท';
    var adminTabBtn = document.querySelector('.ptb-tab[data-view="admin"]');
    if (adminTabBtn) adminTabBtn.classList.add('active');
    // ปุ่ม Export รายงานยังจำกัดเฉพาะ Admin/CEO เหมือนเดิม (ต่างจากตัวภาพรวมที่เปิดให้ทุกคนดูได้แล้ว)
    // ซ่อนไว้สำหรับ staff ทั่วไป กันกดแล้วเจอ error จาก Cloud Function โดยไม่จำเป็น
    var role = localStorage.getItem(ROLE_KEY);
    var isAdminOrCeo = role === 'admin' || role === 'ceo';
    var exportBtn = document.getElementById('ptb-export-btn');
    if (exportBtn) exportBtn.style.display = isAdminOrCeo ? 'inline-block' : 'none';
    renderPtbAdminOverview();
  } else if (view === 'person') {
    document.getElementById('ptb-view-person').classList.add('active');
    document.getElementById('ptb-modal-title').textContent = '📋 Task Board';
  }
}

function refreshCurrentPtbView() {
  var active = document.querySelector('.ptb-view.active');
  if (!active) return;
  if (active.id === 'ptb-view-mystaff') renderPtbBoard('ptb-board-mystaff', localStorage.getItem(ACCOUNT_ID_KEY));
  else if (active.id === 'ptb-view-admin') renderPtbAdminOverview();
  else if (active.id === 'ptb-view-person' && _ptbCurrentPersonId) renderPtbBoard('ptb-board-person', _ptbCurrentPersonId);
}

var PTB_COLS = [
  { key: 'todo', label: 'สิ่งที่ต้องทำ', color: '#dfe3e6' },
  { key: 'doing', label: 'กำลังทำ', color: '#fbbf24' },
  { key: 'done', label: 'เสร็จแล้ว', color: '#059669' }
];

// ===== เรียงลำดับการ์ดในบอร์ด: ค่าเริ่มต้น (ไม่เรียง) / วันครบกำหนดเก่า→ใหม่ / ความสำคัญสูง→ต่ำ =====
// ใช้ร่วมกันทั้งบอร์ด "งานของฉัน" และ "บอร์ดรายคน" (คุมด้วย select เดียวกันในแต่ละหน้า ซิงก์ค่ากันผ่าน
// applyPtbSortModeToSelects() กันเปิดคนละมุมมองแล้วค่า dropdown ไม่ตรงกับที่เลือกไว้จริง)
var _ptbSortMode = '';
var PTB_PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
function setPtbSortMode(mode) {
  _ptbSortMode = mode;
  applyPtbSortModeToSelects();
  refreshCurrentPtbView();
}
function applyPtbSortModeToSelects() {
  ['ptb-sort-select-mystaff', 'ptb-sort-select-person'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = _ptbSortMode;
  });
}
function sortPtbTaskList(list) {
  if (_ptbSortMode === 'date_asc') {
    return list.slice().sort(function (a, b) {
      var da = a.dueDate ? a.dueDate.getTime() : Infinity; // ไม่มีวันครบกำหนด ไปอยู่ท้ายสุด
      var db = b.dueDate ? b.dueDate.getTime() : Infinity;
      return da - db;
    });
  }
  if (_ptbSortMode === 'priority_desc') {
    return list.slice().sort(function (a, b) {
      return (PTB_PRIORITY_RANK[b.priority] || 2) - (PTB_PRIORITY_RANK[a.priority] || 2);
    });
  }
  // ค่าเริ่มต้น (ผู้ใช้ยืนยันแล้ว): เรียงวันครบกำหนดเก่า→ใหม่ก่อนเป็นหลัก แล้วถ้าวันตรงกัน (หรือไม่มี
  // วันครบกำหนดทั้งคู่) ใช้ความสำคัญสูง→ต่ำตัดสินลำดับรอง ให้เห็นงานด่วน+สำคัญขึ้นก่อนเสมอโดยไม่ต้องเลือกเอง
  return list.slice().sort(function (a, b) {
    var da = a.dueDate ? a.dueDate.getTime() : Infinity;
    var db = b.dueDate ? b.dueDate.getTime() : Infinity;
    if (da !== db) return da - db;
    return (PTB_PRIORITY_RANK[b.priority] || 2) - (PTB_PRIORITY_RANK[a.priority] || 2);
  });
}

// ===== Skeleton บอร์ด Task ส่วนบุคคล (PTB) - 3 คอลัมน์ (todo/doing/done) โชว์ตอน setupPersonalTasksListener()
// ยังไม่เคยได้ snapshot แรกกลับมาเลย (เปิด modal เร็วกว่าที่ Firestore listener จะตอบ) =====
function renderPtbBoardSkeleton(containerId) {
  var el = document.getElementById(containerId);
  var html = '';
  PTB_COLS.forEach(function (col) {
    html += '<div class="ptb-col"><div class="ptb-col-head"><span class="sw" style="background:' + col.color + '"></span>' + col.label + '</div>' +
      '<div class="ptb-cards"><div class="skel-kanban-card"><span class="skel" style="width:80%;height:11px;"></span>' +
      '<span class="skel" style="width:50%;height:9px;"></span></div></div></div>';
  });
  el.innerHTML = html;
}

function renderPtbBoard(containerId, personId) {
  if (!_personalTasksLoaded) { renderPtbBoardSkeleton(containerId); return; }
  var el = document.getElementById(containerId);
  el.innerHTML = '';
  applyPtbSortModeToSelects();
  var myTasks = _personalTasksCache.filter(function (t) { return t.assigneeIds.indexOf(personId) !== -1; });

  PTB_COLS.forEach(function (col) {
    var colEl = document.createElement('div');
    colEl.className = 'ptb-col';
    colEl.setAttribute('data-status', col.key);
    var list = sortPtbTaskList(myTasks.filter(function (t) { return t.status === col.key; }));
    colEl.innerHTML =
      '<div class="ptb-col-head"><span class="sw" style="background:' + col.color + '"></span>' + col.label +
      '<span class="cnt">' + list.length + '</span></div><div class="ptb-cards"></div>';
    el.appendChild(colEl);

    var cardsEl = colEl.querySelector('.ptb-cards');
    if (list.length === 0) {
      cardsEl.innerHTML = '<div class="ptb-empty-hint">ลากการ์ดมาวางที่นี่</div>';
    } else {
      list.forEach(function (t) { cardsEl.appendChild(buildPtbCard(t)); });
    }

    colEl.addEventListener('dragover', function (e) { e.preventDefault(); colEl.classList.add('dragover'); });
    colEl.addEventListener('dragleave', function () { colEl.classList.remove('dragover'); });
    colEl.addEventListener('drop', function (e) {
      e.preventDefault();
      colEl.classList.remove('dragover');
      var taskId = e.dataTransfer.getData('text/plain');
      var task = _personalTasksCache.filter(function (t) { return t.taskId === taskId; })[0];
      if (!task || task.status === col.key) return;
      var token = localStorage.getItem(TOKEN_KEY);
      callApi('updatePersonalTaskStatus', { token: token, taskId: taskId, status: col.key }).then(function (result) {
        if (!result.success) Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: result.message });
        // ไม่ต้อง re-render เอง — onSnapshot จะยิงกลับมาให้ re-render อัตโนมัติ
      }).catch(function (err) {
        Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: err.message });
      });
    });
  });
}

function buildPtbCard(t) {
  var card = document.createElement('div');
  card.className = 'ptb-card';
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', function (e) {
    e.dataTransfer.setData('text/plain', t.taskId);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
  card.addEventListener('click', function () { openPersonalTaskModal(t.taskId); });

  var avatars = t.assigneeIds.map(function (id) {
    return '<span class="dot" style="background:' + ptbStaffColor(id) + '">' + ptbStaffInitial(id) + '</span>';
  }).join('');

  var doneCount = t.checklist.filter(function (c) { return c.done; }).length;
  var pct = t.checklist.length ? Math.round(doneCount / t.checklist.length * 100) : 0;
  var overdue = isPtbOverdue(t);
  var prioLabel = t.priority === 'low' ? 'ต่ำ' : (t.priority === 'high' ? 'สูง' : 'กลาง');

  card.innerHTML =
    '<div class="ptb-top-row"><div class="ptb-ttl">' + escapeHtmlPtb(t.title) + '</div>' +
    '<span class="ptb-prio-pip ' + t.priority + '">' + prioLabel + '</span></div>' +
    '<div class="ptb-meta-row">' +
      (t.tag ? '<span class="ptb-tag-pip">' + escapeHtmlPtb(t.tag) + '</span>' : '') +
      '<span class="ptb-due ' + (overdue ? 'overdue' : '') + '">' + (overdue ? '⚠ ' : '📅 ') + fmtPtbDate(t.dueDate) + '</span>' +
      '<span class="ptb-avatars">' + avatars + '</span>' +
    '</div>' +
    (t.checklist.length ? '<div class="ptb-checkbar"><i style="width:' + pct + '%"></i></div>' : '');
  return card;
}

function escapeHtmlPtb(s) {
  return (s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ===== Skeleton หน้า "ภาพรวมทั้งบริษัท" - getCompanyTaskSummary เป็น Cloud Function ที่ทำ aggregation
// ฝั่งเซิร์ฟเวอร์ข้ามทั้งองค์กร ช้ากว่าจุดอื่นที่ใช้ real-time listener ธรรมดา ระหว่างรอทั้ง 3 ส่วน (แถบสถิติ/
// งานใกล้ครบกำหนด/ภาระงานรายคน) จะว่างเปล่าเดิม ใช้รูปทรงคอนเทนเนอร์จริง (.ptb-stat-tile/.ptb-deadline-row/
// .ptb-wl-row) เดิมแทน .skel ข้างในเพื่อให้ layout ไม่กระตุกตอนสลับเป็นข้อมูลจริง =====
function renderPtbOverviewSkeleton() {
  var stats = '';
  for (var i = 0; i < 3; i++) {
    stats += '<div class="ptb-stat-tile"><span class="skel" style="display:inline-block;width:58px;height:10px;"></span>' +
      '<div style="margin-top:7px;"><span class="skel" style="display:inline-block;width:42px;height:22px;"></span></div></div>';
  }
  document.getElementById('ptb-stat-row').innerHTML = stats;

  var deadlineRows = '';
  for (var d = 0; d < 3; d++) {
    deadlineRows += '<div class="ptb-deadline-row">' +
      '<span class="skel" style="width:6px;height:6px;border-radius:50%;flex-shrink:0;"></span>' +
      '<span class="skel" style="flex:1;height:11px;max-width:130px;"></span>' +
      '<span class="skel" style="width:46px;height:10px;flex-shrink:0;"></span>' +
      '<span class="skel" style="width:38px;height:10px;flex-shrink:0;"></span></div>';
  }
  document.getElementById('ptb-deadline-list').innerHTML = deadlineRows;

  var wlRows = '';
  for (var w = 0; w < 3; w++) {
    wlRows += '<div class="ptb-wl-row"><span class="skel" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;"></span>' +
      '<div style="flex:1;min-width:0;"><span class="skel" style="display:block;width:96px;height:11px;margin-bottom:6px;"></span>' +
      '<span class="skel" style="display:block;width:100%;height:6px;border-radius:5px;"></span></div></div>';
  }
  document.getElementById('ptb-workload-list').innerHTML = wlRows;

  // เคลียร์ส่วนกราฟใหม่ (โดนัท/ความสำคัญ/แท็ก) ระหว่างโหลด กันโชว์ข้อมูลเก่าค้างจากครั้งก่อน
  ['ptb-status-donut', 'ptb-priority-bars', 'ptb-tag-chips'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="ptb-empty-hint">กำลังโหลด...</div>';
  });
}

// ===== มุมมอง Admin/CEO — ภาพรวมทั้งบริษัท =====
function renderPtbAdminOverview() {
  renderPtbOverviewSkeleton();
  var token = localStorage.getItem(TOKEN_KEY);
  callApi('getCompanyTaskSummary', { token: token }).then(function (result) {
    if (!result.success) {
      document.getElementById('ptb-stat-row').innerHTML = '';
      document.getElementById('ptb-deadline-list').innerHTML = '<div class="ptb-empty-hint">โหลดภาพรวมไม่สำเร็จ</div>';
      document.getElementById('ptb-workload-list').innerHTML = '';
      Swal.fire({ icon: 'error', title: 'โหลดภาพรวมไม่สำเร็จ', text: result.message });
      return;
    }

    document.getElementById('ptb-stat-row').innerHTML =
      '<div class="ptb-stat-tile"><div class="lbl">Task ทั้งหมด</div><div class="val">' + result.totalTasks + '</div></div>' +
      '<div class="ptb-stat-tile"><div class="lbl">เกินกำหนด</div><div class="val danger">' + result.overdueCount + '</div></div>' +
      '<div class="ptb-stat-tile"><div class="lbl">เสร็จแล้ว</div><div class="val brand">' + result.doneCount + '</div></div>';

    var deadlineHtml = result.upcoming.map(function (t) {
      var who = t.assigneeIds.map(function (id) { return ptbStaffName(id); }).join(', ');
      var d = t.dueDate ? firestoreDateToJs(t.dueDate) : null;
      // จุดสี + ข้อความ: เกินกำหนดจริง = แดง, ครบกำหนดวันนี้ = ส้ม ("วันนี้"), ยังไม่ถึงกำหนด = เหลือง + วันที่
      var dotColor = t.overdue ? '#ef4444' : (t.dueToday ? '#f97316' : '#fbbf24');
      var dateClass = t.overdue ? 'od' : (t.dueToday ? 'today' : '');
      var dateText = t.overdue ? ('เกินกำหนด · ' + fmtPtbDate(d)) : (t.dueToday ? 'วันนี้' : fmtPtbDate(d));
      return '<div class="ptb-deadline-row" onclick="openPersonalTaskModal(\'' + t.taskId + '\')">' +
        '<span class="d-dot" style="background:' + dotColor + '"></span>' +
        '<span class="d-title">' + escapeHtmlPtb(t.title) + '</span>' +
        '<span class="d-who">' + who + '</span>' +
        '<span class="d-date ' + dateClass + '">' + dateText + '</span>' +
      '</div>';
    }).join('');
    document.getElementById('ptb-deadline-list').innerHTML = deadlineHtml || '<div class="ptb-empty-hint">ไม่มีงานใกล้ครบกำหนด</div>';

    var workloadHtml = result.workload.map(function (s) {
      var totalN = s.total || 1;
      return '<div class="ptb-wl-row" onclick="viewPtbPersonBoard(\'' + s.staffId + '\')">' +
        '<div class="ptb-wl-avatar" style="background:' + (s.colorHex || '#888780') + '">' + (s.firstName || '?').charAt(0) +
          (s.hasOverdue ? '<span class="od-dot"></span>' : '') + '</div>' +
        '<div class="ptb-wl-body">' +
          '<div class="ptb-wl-name-row"><span class="ptb-wl-name">' + s.firstName + ' ' + (s.lastName || '') + '</span><span class="ptb-wl-total">' + s.total + ' งาน</span></div>' +
          '<div class="ptb-wl-bar">' +
            (s.todo ? '<span style="width:' + (s.todo / totalN * 100) + '%; background:#dfe3e6"></span>' : '') +
            (s.doing ? '<span style="width:' + (s.doing / totalN * 100) + '%; background:#fbbf24"></span>' : '') +
            (s.done ? '<span style="width:' + (s.done / totalN * 100) + '%; background:#059669"></span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="ptb-wl-go">ดูบอร์ด ›</span>' +
      '</div>';
    }).join('');
    document.getElementById('ptb-workload-list').innerHTML = workloadHtml || '<div class="ptb-empty-hint">ยังไม่มีผู้ปฏิบัติงาน</div>';

    // โดนัทสถานะงาน - รวม todo/doing/done จาก result.workload ของทุกคน (เชื่อถือได้เท่ากับตัวเลขที่ใช้ทำแท่ง
    // ภาระงานรายคนด้านบนอยู่แล้ว) ไม่ต้องเพิ่ม field ใหม่จาก backend
    var statusTotals = { todo: 0, doing: 0, done: 0 };
    result.workload.forEach(function (s) {
      statusTotals.todo += s.todo || 0;
      statusTotals.doing += s.doing || 0;
      statusTotals.done += s.done || 0;
    });
    renderPtbStatusDonut(statusTotals);

    // ความสำคัญ + แท็ก - คำนวณจาก _personalTasksCache ตรงๆ (มีข้อมูลทั้งบริษัทอยู่แล้วในแคชนี้ ดูคอมเมนต์ที่
    // setupPersonalTasksListener) ไม่นับงานที่ถูกลบเพราะแคชกรองออกให้แล้วตั้งแต่ onSnapshot
    var priorityTotals = { high: 0, medium: 0, low: 0 };
    var tagTotals = {};
    _personalTasksCache.forEach(function (t) {
      var p = t.priority === 'high' ? 'high' : (t.priority === 'low' ? 'low' : 'medium');
      priorityTotals[p]++;
      if (t.tag) tagTotals[t.tag] = (tagTotals[t.tag] || 0) + 1;
    });
    renderPtbPriorityBars(priorityTotals);
    renderPtbTagChips(tagTotals);

    window._ptbLastSummary = result; // เก็บไว้ใช้ตอน export
  }).catch(function (err) {
    document.getElementById('ptb-stat-row').innerHTML = '';
    document.getElementById('ptb-deadline-list').innerHTML = '<div class="ptb-empty-hint">โหลดภาพรวมไม่สำเร็จ</div>';
    document.getElementById('ptb-workload-list').innerHTML = '';
    Swal.fire({ icon: 'error', title: 'โหลดภาพรวมไม่สำเร็จ', text: err.message });
  });
}

// โดนัทสถานะงาน (SVG) - ใช้ pathLength="100" เพื่อคำนวณ stroke-dasharray เป็น % ตรงๆ ไม่ต้องคูณเส้นรอบวงเอง
function renderPtbStatusDonut(totals) {
  var el = document.getElementById('ptb-status-donut');
  if (!el) return;
  var total = totals.todo + totals.doing + totals.done;
  if (total === 0) { el.innerHTML = '<div class="ptb-empty-hint">ยังไม่มีข้อมูล</div>'; return; }
  var donePct = total ? (totals.done / total * 100) : 0;
  var doingPct = total ? (totals.doing / total * 100) : 0;
  var todoPct = total ? (totals.todo / total * 100) : 0;
  var doneOffset = 0;
  var doingOffset = -donePct;
  var todoOffset = -(donePct + doingPct);
  el.innerHTML =
    '<div class="pdb-donut-row">' +
      '<svg width="110" height="110" viewBox="0 0 120 120">' +
        '<circle cx="60" cy="60" r="48" fill="none" stroke="var(--surface-alt)" stroke-width="16"/>' +
        '<circle cx="60" cy="60" r="48" fill="none" stroke="#3F654D" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="' + donePct + ' 100" stroke-dashoffset="' + doneOffset + '" transform="rotate(-90 60 60)"/>' +
        '<circle cx="60" cy="60" r="48" fill="none" stroke="#D97706" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="' + doingPct + ' 100" stroke-dashoffset="' + doingOffset + '" transform="rotate(-90 60 60)"/>' +
        '<circle cx="60" cy="60" r="48" fill="none" stroke="#9AA6A0" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="' + todoPct + ' 100" stroke-dashoffset="' + todoOffset + '" transform="rotate(-90 60 60)"/>' +
        '<text x="60" y="56" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)">' + Math.round(donePct) + '%</text>' +
        '<text x="60" y="72" text-anchor="middle" font-size="10" fill="var(--text-muted)">เสร็จแล้ว</text>' +
      '</svg>' +
      '<div style="flex:1">' +
        '<div class="pdb-leg-row"><span class="lbl"><span class="pdb-dot" style="background:#3F654D"></span>เสร็จแล้ว</span><b>' + totals.done + '</b></div>' +
        '<div class="pdb-leg-row"><span class="lbl"><span class="pdb-dot" style="background:#D97706"></span>กำลังทำ</span><b>' + totals.doing + '</b></div>' +
        '<div class="pdb-leg-row"><span class="lbl"><span class="pdb-dot" style="background:#9AA6A0"></span>ต้องทำ</span><b>' + totals.todo + '</b></div>' +
      '</div>' +
    '</div>';
}

function renderPtbPriorityBars(totals) {
  var el = document.getElementById('ptb-priority-bars');
  if (!el) return;
  var total = totals.high + totals.medium + totals.low;
  if (total === 0) { el.innerHTML = '<div class="ptb-empty-hint">ยังไม่มีข้อมูล</div>'; return; }
  var rows = [
    { label: 'สูง', n: totals.high, color: '#ef4444' },
    { label: 'กลาง', n: totals.medium, color: '#f59e0b' },
    { label: 'ต่ำ', n: totals.low, color: '#9ca3af' }
  ];
  el.innerHTML = rows.map(function (r) {
    var pct = total ? (r.n / total * 100) : 0;
    return '<div class="pdb-bar-row">' +
      '<div class="pdb-bar-top"><span>' + r.label + '</span><span><b>' + r.n + '</b> งาน</span></div>' +
      '<div class="pdb-bar-track"><div class="pdb-bar-fill" style="width:' + pct + '%;background:' + r.color + ';"></div></div>' +
    '</div>';
  }).join('');
}

function renderPtbTagChips(tagTotals) {
  var el = document.getElementById('ptb-tag-chips');
  if (!el) return;
  var tags = Object.keys(tagTotals).sort(function (a, b) { return tagTotals[b] - tagTotals[a]; }).slice(0, 10);
  if (!tags.length) { el.innerHTML = '<div class="ptb-empty-hint">ยังไม่มีการติดแท็กงาน</div>'; return; }
  el.innerHTML = tags.map(function (tag) {
    return '<span class="pdb-tag-chip">' + escapeHtmlPtb(tag) + ' · ' + tagTotals[tag] + '</span>';
  }).join('');
}

function viewPtbPersonBoard(staffId) {
  _ptbCurrentPersonId = staffId;
  document.getElementById('ptb-person-title').textContent = 'บอร์ดของ ' + ptbStaffName(staffId);
  document.getElementById('ptb-person-add-btn').onclick = function () { openPersonalTaskModal(null, staffId); };
  document.querySelectorAll('.ptb-view').forEach(function (v) { v.classList.remove('active'); });
  document.getElementById('ptb-view-person').classList.add('active');
  renderPtbBoard('ptb-board-person', staffId);
}

// ===== Modal เพิ่ม/แก้ไข Task =====
function openPersonalTaskModal(taskId, defaultAssigneeId) {
  _ptmEditingTaskId = taskId || null;
  _ptmPendingFiles = []; // เคลียร์ไฟล์ที่ค้างจาก modal ครั้งก่อน (กันไฟล์เก่าหลุดติดมากับ Task ใหม่ที่ไม่เกี่ยวกัน)
  var t = taskId ? _personalTasksCache.filter(function (x) { return x.taskId === taskId; })[0] : null;

  // แก้บั๊ก: เดิม modal นี้เปิดดู Task ของใครก็ได้แบบแก้ไขได้เต็มรูปแบบเสมอ (ช่องกรอก/ปุ่มลบไม่เคยเช็คสิทธิ์
  // เลยแม้แต่นิดเดียว) ทั้งที่ตั้งแต่เปิดให้ทุก role ดูภาพรวมทั้งบริษัทได้ (ดูคอมเมนต์ใน openTaskBoardModal)
  // คนที่ไม่ใช่ผู้สร้าง/ผู้รับผิดชอบร่วม/Admin กดบันทึก-ลบไปก็จะโดนเซิร์ฟเวอร์ปฏิเสธอยู่ดี (canManagePersonalTask
  // ฝั่ง Cloud Function) แต่หน้าเว็บไม่เคยบอกล่วงหน้าเลยว่ากดไปแล้วจะไม่มีสิทธิ์ - เพิ่มเช็คสิทธิ์แบบเดียวกัน
  // ไว้ตั้งแต่ฝั่งหน้าเว็บ แล้วสลับเป็นโหมดดูอย่างเดียวถ้าไม่ผ่าน (งานใหม่ที่ยังไม่มี taskId ถือว่าแก้ไขได้เสมอ)
  var _ptmMyId = localStorage.getItem(ACCOUNT_ID_KEY);
  var _ptmMyRole = localStorage.getItem(ROLE_KEY);
  var canManage = !t || t.createdBy === _ptmMyId || _ptmMyRole === 'admin' || (t.assigneeIds || []).indexOf(_ptmMyId) !== -1;
  _ptmReadOnly = !canManage;
  document.getElementById('personal-task-box').classList.toggle('ptm-readonly', _ptmReadOnly);
  document.getElementById('ptm-readonly-banner').style.display = _ptmReadOnly ? 'flex' : 'none';
  document.getElementById('ptm-save-btn').style.display = _ptmReadOnly ? 'none' : '';

  document.getElementById('ptm-title').value = t ? t.title : '';
  document.getElementById('ptm-title').readOnly = _ptmReadOnly;
  document.getElementById('ptm-desc').innerHTML = t ? sanitizeRichText(t.description || '') : '';
  document.getElementById('ptm-desc').contentEditable = _ptmReadOnly ? 'false' : 'true';
  document.getElementById('ptm-delete-btn').style.display = (t && canManage) ? 'block' : 'none';

  var row = document.getElementById('ptm-assignee-row');
  row.querySelectorAll('.ptm-avatar-chip').forEach(function (c) { c.remove(); });
  var myId = localStorage.getItem(ACCOUNT_ID_KEY);
  var initialAssignees = t ? t.assigneeIds.slice() : (defaultAssigneeId ? [defaultAssigneeId] : [myId]);
  initialAssignees.forEach(function (id) { ptmAddAssigneeChip(id); });
  ptmRenderAssigneePicker();

  document.getElementById('ptm-link-toggle').checked = t ? !!t.linkedEventId : false;
  document.getElementById('ptm-event-input').value = '';
  document.getElementById('ptm-event-input').setAttribute('data-event-id', t && t.linkedEventId ? t.linkedEventId : '');
  if (t && t.linkedEventId) {
    ptmLoadLinkableEvents(); // โหลดแคชก่อนเสมอ กันกรณีเปิด modal แก้ไขเป็นครั้งแรกโดยยังไม่เคยกดสวิตช์ผูก Event มาก่อน
    var ev = _ptmLinkableEventsCache.filter(function (e) { return e.taskId === t.linkedEventId; })[0];
    document.getElementById('ptm-event-input').value = ev ? ev.taskName : '(Event ที่เคยผูกไว้)';
  }
  document.getElementById('ptm-manual-date').value = t && t.dueDate ? ptbDateToInputValue(t.dueDate) : ptbDateToInputValue(new Date());
  // เช็ค "ไม่ระบุวันที่" ให้อัตโนมัติถ้าเป็นการแก้ไข Task ที่ไม่มีวันครบกำหนดและไม่ได้ผูก Event อยู่แล้ว (งานรูทีน)
  // ส่วน Task ใหม่ปล่อยว่าง (ไม่ติ๊ก) ไว้ก่อนเพื่อไม่ให้พฤติกรรมเดิม (ค่าเริ่มต้นเป็นวันนี้) เปลี่ยนไปโดยไม่ได้ตั้งใจ
  document.getElementById('ptm-nodate-toggle').checked = !!(t && !t.dueDate && !t.linkedEventId);
  ptmSyncToggle();
  ptmSyncNoDate();

  document.querySelectorAll('.ptm-prio-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-p') === (t ? t.priority : 'med'));
  });

  document.getElementById('ptm-tag-input').value = '';
  document.getElementById('ptm-tag-selected').innerHTML = t && t.tag ? ptmTagChipHtml(t.tag) : '';

  var ci = document.getElementById('ptm-check-items');
  ci.innerHTML = '';
  (t ? t.checklist : []).forEach(function (item) { ptmAddCheckItemRow(item.text, item.done); });

  document.getElementById('ptm-att-list').innerHTML = (t ? t.attachments : []).map(function (a) { return ptmAttChipHtml(a); }).join('');

  // ระบบคอมเมนต์ - ต้อง login ก่อนถึงจะเห็น/ใช้งานได้ (เหมือน Task หลัก) และต้องเป็น Task ที่บันทึกแล้วเท่านั้น
  // (Task ใหม่ที่ยังไม่มี taskId ยังไม่มีที่ให้ผูกคอมเมนต์ด้วย) - ซ่อนทั้งแผงข้าง (PC) และแท็บ (มือถือ) ถ้าไม่เข้าเงื่อนไข
  var ptmCmtToken = localStorage.getItem(TOKEN_KEY);
  var ptmCmtPanel = document.getElementById('ptm-cmt-panel');
  var ptmWrap = document.getElementById('ptm-modal-wrap');
  var ptmTabs = document.getElementById('ptm-mobile-tabs');
  ptmWrap.classList.remove('ptm-show-cmt');
  ptmSwitchMobileView('form');
  if (t && ptmCmtToken) {
    ptmCmtPanel.classList.add('ptm-has-cmt');
    ptmTabs.style.display = '';
    _ptmCmtCurrentTaskId = taskId;
    document.getElementById('ptm-cmt-list').innerHTML = '<div class="td-cmt-empty">กำลังโหลด...</div>';
    document.getElementById('ptm-cmt-badge').style.display = 'none';
    document.getElementById('ptm-mtab-cnt').style.display = 'none';
    document.getElementById('ptm-cmt-input').value = '';
    subscribePersonalTaskComments(taskId);
  } else {
    ptmCmtPanel.classList.remove('ptm-has-cmt');
    ptmTabs.style.display = 'none';
    _ptmCmtCurrentTaskId = null;
    if (_ptmCmtUnsub) { _ptmCmtUnsub(); _ptmCmtUnsub = null; }
  }

  document.getElementById('personal-task-modal-overlay').style.display = 'flex';
  _pushModalNav('personal-task-modal-overlay');
}
function closePersonalTaskModal() {
  document.getElementById('personal-task-modal-overlay').style.display = 'none';
  if (_ptmCmtUnsub) { _ptmCmtUnsub(); _ptmCmtUnsub = null; }
  _ptmCmtCurrentTaskId = null;
  closeGlobalKebabMenu();
  _cmtEditingId = null;
}

// สลับมุมมอง "รายละเอียดงาน" / "ความคิดเห็น" - มีผลเฉพาะจอแคบ/มือถือ (ดู .ptm-modal-wrap.ptm-show-cmt ใน
// style.css) บน PC ทั้งสองฝั่งโชว์พร้อมกันอยู่แล้วเป็นแผงข้างถาวร ฟังก์ชันนี้แค่ไม่มีผลอะไรที่นั่น
function ptmSwitchMobileView(view) {
  var showCmt = view === 'cmt';
  document.getElementById('ptm-modal-wrap').classList.toggle('ptm-show-cmt', showCmt);
  document.getElementById('ptm-mtab-form').classList.toggle('active', !showCmt);
  document.getElementById('ptm-mtab-cmt').classList.toggle('active', showCmt);
}

function subscribePersonalTaskComments(taskId) {
  if (_ptmCmtUnsub) { _ptmCmtUnsub(); _ptmCmtUnsub = null; }
  _ptmCmtUnsub = fbDb.collection('personalTasks').doc(taskId).collection('comments')
    .orderBy('createdAt', 'asc')
    .onSnapshot(function (snapshot) {
      // กันเคส race condition แบบเดียวกับ subscribeTaskComments ของ Task หลัก - เช็คว่ายังเป็น Task
      // เดียวกับที่ modal เปิดอยู่จริงก่อนเขียนลง DOM (ผู้ใช้อาจปิด/เปิด Task อื่นไปแล้วระหว่างรอ callback)
      if (_ptmCmtCurrentTaskId !== taskId) return;
      renderPersonalTaskComments(snapshot.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
    }, function (err) {
      console.error('subscribePersonalTaskComments error', err);
    });
}

var _ptmLastComments = [];

function renderPersonalTaskComments(comments, skipScroll) {
  _ptmLastComments = comments;
  var listEl = document.getElementById('ptm-cmt-list');
  var badgeEl = document.getElementById('ptm-cmt-badge');
  var tabCntEl = document.getElementById('ptm-mtab-cnt');
  var myAccountId = localStorage.getItem(ACCOUNT_ID_KEY);
  if (comments.length === 0) {
    listEl.innerHTML = '<div class="td-cmt-empty">ยังไม่มีความคิดเห็น</div>';
    badgeEl.style.display = 'none';
    tabCntEl.style.display = 'none';
  } else {
    badgeEl.textContent = comments.length;
    badgeEl.style.display = 'inline-block';
    tabCntEl.textContent = comments.length;
    tabCntEl.style.display = 'inline-block';
    listEl.innerHTML = comments.map(function (c) { return buildCommentItemHtml(c, 'ptm', myAccountId); }).join('');
  }
  if (!skipScroll) listEl.scrollTop = listEl.scrollHeight;
}

function sendPersonalTaskComment() {
  var taskId = _ptmCmtCurrentTaskId;
  if (!taskId) return;
  var input = document.getElementById('ptm-cmt-input');
  var text = (input.value || '').trim();
  if (!text) return;
  var urgentBox = document.getElementById('ptm-cmt-urgent');
  var isUrgent = !!(urgentBox && urgentBox.checked);
  var sendBtn = document.getElementById('ptm-cmt-send-btn');
  var token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  sendBtn.disabled = true;
  callApi('addPersonalTaskComment', { token: token, taskId: taskId, text: text, urgent: isUrgent }).then(function (result) {
    sendBtn.disabled = false;
    if (result.success) {
      input.value = '';
      if (urgentBox) urgentBox.checked = false;
      // ไม่ต้อง render ซ้ำเอง - onSnapshot ของ subscribePersonalTaskComments() จะได้ข้อมูลใหม่มาเองอัตโนมัติ
    } else {
      Swal.fire({ icon: 'error', title: 'ส่งความคิดเห็นไม่สำเร็จ', text: result.message });
    }
  }).catch(function (err) {
    sendBtn.disabled = false;
    Swal.fire({ icon: 'error', title: 'เชื่อมต่อ API ไม่ได้', text: err.message });
  });
}

function ptbDateToInputValue(d) {
  var yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function ptmTagChipHtml(val) {
  return '<span class="ptm-tag-chip" data-val="' + escapeHtmlPtb(val) + '">' + escapeHtmlPtb(val) +
    ' <button onclick="document.getElementById(\'ptm-tag-selected\').innerHTML=\'\'">✕</button></span>';
}
function ptmAttChipHtml(a) {
  // แก้บั๊ก: เดิมไม่ได้ใช้ a.url เลย ไฟล์แนบเลยกดดู/เปิดไม่ได้แม้จะอัปโหลดสำเร็จแล้วก็ตาม (URL มีเก็บ
  // ไว้ในฐานข้อมูลอยู่แล้วตั้งแต่แรกจาก registerTaskAttachment แค่ฝั่งแสดงผลไม่เคยดึงมาใช้)
  var isImg = (a.type || '').indexOf('image/') === 0;
  var thumbStyle = (isImg && a.url) ? ' style="background-image:url(\'' + escapeHtmlPtb(a.url) + '\')"' : '';
  var thumbClass = 'ptm-att-thumb' + (isImg ? ' is-img' : '');
  var inner = '<div class="' + thumbClass + '"' + thumbStyle + '></div><div class="ptm-att-meta"><b>' +
    escapeHtmlPtb(a.name) + '</b><small>' + Math.round((a.size || 0) / 1024) + ' KB</small></div>';
  if (a.url) {
    // เปิดแท็บใหม่ - รูปภาพเบราว์เซอร์แสดงได้ตรงๆ ส่วนไฟล์เอกสารอื่นจะดาวน์โหลด/เปิดตามที่เบราว์เซอร์รองรับ
    return '<a class="ptm-att-chip" href="' + escapeHtmlPtb(a.url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>';
  }
  return '<div class="ptm-att-chip">' + inner + '</div>';
}
// การ์ดไฟล์ที่ "รอบันทึก" - ใช้ตอนเพิ่ม Task ใหม่ที่ยังไม่มี taskId จริง (แนบไฟล์พร้อมกับสร้าง Task ในขั้นตอน
// เดียว) ยังอัปโหลดขึ้น Storage จริงไม่ได้ จึงโชว์เป็นการ์ดสถานะ "รอ" พร้อมปุ่มลบออกก่อนได้ถ้าเปลี่ยนใจ
function ptmPendingAttChipHtml(file, idx) {
  var isImg = (file.type || '').indexOf('image/') === 0;
  var thumbClass = 'ptm-att-thumb' + (isImg ? ' is-img' : '');
  return '<div class="ptm-att-chip ptm-att-pending" data-pending-idx="' + idx + '">' +
    '<div class="' + thumbClass + '"></div><div class="ptm-att-meta"><b>' + escapeHtmlPtb(file.name) +
    '</b><small>' + Math.round((file.size || 0) / 1024) + ' KB · รอบันทึก Task</small></div>' +
    '<button type="button" class="ptm-att-pending-rm" onclick="ptmRemovePendingFile(' + idx + ')" title="ลบไฟล์นี้ออก">✕</button></div>';
}
function ptmRemovePendingFile(idx) {
  _ptmPendingFiles[idx] = null; // เว้นตำแหน่งว่างไว้แทนการ splice กัน index ของไฟล์อื่นที่แนบไปแล้วเพี้ยน
  var el = document.querySelector('.ptm-att-pending[data-pending-idx="' + idx + '"]');
  if (el) el.remove();
}

function ptmAddAssigneeChip(id) {
  var row = document.getElementById('ptm-assignee-row');
  var chip = document.createElement('div');
  chip.className = 'ptm-avatar-chip';
  chip.setAttribute('data-id', id);
  chip.innerHTML = '<span class="dt" style="background:' + ptbStaffColor(id) + '">' + ptbStaffInitial(id) + '</span>' +
    ptbStaffName(id) + '<button class="rm">✕</button>';
  chip.querySelector('.rm').addEventListener('click', function () { chip.remove(); ptmRenderAssigneePicker(); });
  row.insertBefore(chip, row.querySelector('.ptm-picker-pop'));
}
function ptmRenderAssigneePicker() {
  var chosen = Array.prototype.map.call(document.querySelectorAll('#ptm-assignee-row .ptm-avatar-chip'), function (c) { return c.getAttribute('data-id'); });
  var list = document.getElementById('ptm-assignee-list');
  var opts = Object.keys(staffMapCache).filter(function (id) { return chosen.indexOf(id) === -1; });
  if (opts.length === 0) {
    list.innerHTML = '<div style="padding:6px 8px; font-size:11px; color:var(--text-faint)">เลือกครบทุกคนแล้ว</div>';
    return;
  }
  list.innerHTML = opts.map(function (id) {
    return '<div class="ptm-picker-opt" onclick="ptmPickAssignee(\'' + id + '\')"><span class="dt" style="background:' +
      ptbStaffColor(id) + '">' + ptbStaffInitial(id) + '</span>' + ptbStaffName(id) + '</div>';
  }).join('');
}
function ptmPickAssignee(id) {
  ptmAddAssigneeChip(id);
  ptmRenderAssigneePicker();
  document.getElementById('ptm-assignee-list').classList.remove('open');
}
document.getElementById('ptm-add-assignee-btn').addEventListener('click', function (e) {
  e.stopPropagation();
  document.getElementById('ptm-assignee-list').classList.toggle('open');
});
document.addEventListener('click', function (e) {
  if (!e.target.closest('.ptm-picker-pop')) {
    var list = document.getElementById('ptm-assignee-list');
    if (list) list.classList.remove('open');
  }
});

var ptmLinkToggle = document.getElementById('ptm-link-toggle');
var ptmEventCombo = document.getElementById('ptm-event-combo');
var ptmManualDate = document.getElementById('ptm-manual-date');
var ptmToggleLabel = document.getElementById('ptm-toggle-label');
function ptmSyncToggle() {
  if (ptmLinkToggle.checked) {
    ptmEventCombo.classList.add('show');
    ptmManualDate.classList.remove('show');
    ptmToggleLabel.textContent = '🔗 ผูกกับ Event ในปฏิทิน';
    ptmLoadLinkableEvents();
  } else {
    ptmEventCombo.classList.remove('show');
    ptmManualDate.classList.add('show');
    ptmToggleLabel.textContent = '📅 กำหนดวันเอง (ไม่ผูก Event)';
  }
}
ptmLinkToggle.addEventListener('change', ptmSyncToggle);

// ===== "ไม่ระบุวันที่" - สำหรับงานรูทีนที่ไม่ต้องมีกำหนดวัน กันไม่ต้องลบวันที่ในช่องกรอกเองทุกครั้ง =====
var ptmNoDateToggle = document.getElementById('ptm-nodate-toggle');
var ptmLinkToggleWrap = document.getElementById('ptm-link-toggle-wrap');
var ptmDateFields = document.getElementById('ptm-date-fields');
function ptmSyncNoDate() {
  var noDate = ptmNoDateToggle.checked;
  ptmLinkToggleWrap.style.display = noDate ? 'none' : '';
  ptmDateFields.style.display = noDate ? 'none' : '';
}
ptmNoDateToggle.addEventListener('change', ptmSyncNoDate);

document.querySelectorAll('.ptm-prio-btn').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('.ptm-prio-btn').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active');
  });
});

// ===== ค้นหา Event ในปฏิทินเพื่อผูกกับ Task (ใช้ lastTaskDocs ที่แคชไว้แล้วจากปฏิทินหลัก) =====
var _ptmLinkableEventsCache = [];
function ptmLoadLinkableEvents() {
  _ptmLinkableEventsCache = (lastTaskDocs || []).filter(function (docSnap) {
    var d = docSnap.data();
    return !d.isUndated && d.status !== 'ยกเลิกงาน';
  }).map(function (docSnap) {
    var d = docSnap.data();
    return { taskId: docSnap.id, taskName: d.taskName, startDateTime: d.startDateTime };
  });
}
var ptmEventInput = document.getElementById('ptm-event-input');
var ptmEventList = document.getElementById('ptm-event-list');
function ptmRenderEventList() {
  var q = ptmEventInput.value.trim().toLowerCase();
  var opts = _ptmLinkableEventsCache.filter(function (e) { return !q || e.taskName.toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
  ptmEventList.innerHTML = opts.map(function (e) {
    var d = firestoreDateToJs(e.startDateTime);
    return '<div class="ptm-combo-opt" data-id="' + e.taskId + '" data-name="' + escapeHtmlPtb(e.taskName) + '">' +
      escapeHtmlPtb(e.taskName) + ' <span style="color:var(--text-faint)">' + (d ? fmtPtbDate(d) : '') + '</span></div>';
  }).join('') || '<div style="padding:6px 9px; font-size:11.5px; color:var(--text-faint)">ไม่พบ Event</div>';
  ptmEventList.querySelectorAll('.ptm-combo-opt[data-id]').forEach(function (o) {
    o.addEventListener('click', function () {
      ptmEventInput.value = o.getAttribute('data-name');
      ptmEventInput.setAttribute('data-event-id', o.getAttribute('data-id'));
      ptmEventList.classList.remove('open');
    });
  });
}
ptmEventInput.addEventListener('focus', function () { ptmRenderEventList(); ptmEventList.classList.add('open'); });
ptmEventInput.addEventListener('input', ptmRenderEventList);
document.addEventListener('click', function (e) { if (!e.target.closest('#ptm-event-combo')) ptmEventList.classList.remove('open'); });

// ===== แท็ก (combobox: เลือกจากที่มี หรือพิมพ์ใหม่แล้วเพิ่มได้เลย) =====
var ptmTagInput = document.getElementById('ptm-tag-input');
var ptmTagList = document.getElementById('ptm-tag-list');
function ptmRenderTagList() {
  var q = ptmTagInput.value.trim();
  var opts = _taskTagsCache.filter(function (tg) { return !q || tg.toLowerCase().indexOf(q.toLowerCase()) !== -1; });
  var html = opts.map(function (tg) { return '<div class="ptm-combo-opt" data-val="' + escapeHtmlPtb(tg) + '">' + escapeHtmlPtb(tg) + '</div>'; }).join('');
  var exists = _taskTagsCache.some(function (tg) { return tg.toLowerCase() === q.toLowerCase(); });
  if (q && !exists) {
    html += '<div class="ptm-combo-opt add-new" data-newval="' + escapeHtmlPtb(q) + '">+ เพิ่มแท็กใหม่ "' + escapeHtmlPtb(q) + '"</div>';
  }
  ptmTagList.innerHTML = html;
  ptmTagList.querySelectorAll('.ptm-combo-opt[data-val]').forEach(function (o) {
    o.addEventListener('click', function () { ptmSelectTag(o.getAttribute('data-val')); });
  });
  var addBtn = ptmTagList.querySelector('.add-new');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var newVal = addBtn.getAttribute('data-newval');
      var token = localStorage.getItem(TOKEN_KEY);
      callApi('addTaskTag', { token: token, name: newVal }).then(function (result) {
        if (result.success) ptmSelectTag(result.name);
        else Swal.fire({ icon: 'error', title: 'เพิ่มแท็กไม่สำเร็จ', text: result.message });
      });
    });
  }
}
function ptmSelectTag(val) {
  document.getElementById('ptm-tag-selected').innerHTML = ptmTagChipHtml(val);
  ptmTagInput.value = '';
  ptmTagList.classList.remove('open');
}
ptmTagInput.addEventListener('focus', function () { ptmRenderTagList(); ptmTagList.classList.add('open'); });
ptmTagInput.addEventListener('input', ptmRenderTagList);
document.addEventListener('click', function (e) { if (!e.target.closest('#ptm-tag-input') && !e.target.closest('#ptm-tag-list')) ptmTagList.classList.remove('open'); });

// ===== Checklist =====
var ptmCheckInput = document.getElementById('ptm-check-input');
function ptmAddCheckItemRow(text, done) {
  var row = document.createElement('div');
  row.className = 'ptm-check-item' + (done ? ' done' : '');
  row.innerHTML = '<input type="checkbox" ' + (done ? 'checked' : '') + '><span>' + escapeHtmlPtb(text) + '</span><button class="rm">✕</button>';
  row.querySelector('input').addEventListener('change', function (e) { row.classList.toggle('done', e.target.checked); });
  row.querySelector('.rm').addEventListener('click', function () { row.remove(); });
  document.getElementById('ptm-check-items').appendChild(row);
}
document.getElementById('ptm-check-add-btn').addEventListener('click', function () {
  var v = ptmCheckInput.value.trim();
  if (v) { ptmAddCheckItemRow(v, false); ptmCheckInput.value = ''; }
});
ptmCheckInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    var v = ptmCheckInput.value.trim();
    if (v) { ptmAddCheckItemRow(v, false); ptmCheckInput.value = ''; }
  }
});

// ===== ไฟล์แนบ: รูปภาพบีบอัดผ่าน canvas ก่อนเสมอ (แนวทางเดียวกับรูปโปรไฟล์) ไฟล์อื่นอัปโหลดตรง =====
// ปรับให้ "เพิ่ม Task ใหม่ + แนบไฟล์" ทำได้ในขั้นตอนเดียว: ถ้ากำลังแก้ไข Task ที่มีอยู่แล้ว (_ptmEditingTaskId)
// อัปโหลดขึ้น Storage ทันที เหมือนเดิม แต่ถ้ากำลังสร้าง Task ใหม่ (ยังไม่มี taskId จริง เลยอัปโหลดขึ้น Storage
// ไม่ได้ทันที เพราะ Storage Rules เช็ค assigneeIds ของ Task ที่มีอยู่จริงในฐานข้อมูล) จะพักไฟล์ไว้ใน
// _ptmPendingFiles ก่อน แล้วอัปโหลดจริงทันทีหลังบันทึก Task สำเร็จใน savePersonalTaskModal()
function ptmUploadOneFile(taskId, token, file) {
  return new Promise(function (resolve, reject) {
    function uploadBlob(blob, contentType, displayName) {
      var fileName = Date.now() + '_' + displayName.replace(/[^a-zA-Z0-9._-]/g, '_');
      var storageRef = fbStorage.ref('taskAttachments/' + taskId + '/' + fileName);
      var uploadedUrl = ''; // เก็บ URL ที่อัปโหลดได้ไว้ใช้ตอนเติมการ์ดแนบไฟล์ทันที (กันต้องปิด-เปิด modal ใหม่ถึงจะกดดูได้)
      storageRef.put(blob, { contentType: contentType }).then(function () {
        return storageRef.getDownloadURL();
      }).then(function (url) {
        uploadedUrl = url;
        return callApi('registerTaskAttachment', {
          token: token, taskId: taskId, url: url, thumbUrl: '', name: displayName, size: blob.size, type: contentType
        });
      }).then(function (result) {
        if (result.success) {
          resolve({ name: displayName, size: blob.size, url: uploadedUrl, type: contentType });
        } else {
          reject(new Error(result.message || 'แนบไฟล์ไม่สำเร็จ'));
        }
      }).catch(reject);
    }

    if (file.type.startsWith('image/')) {
      var img = new Image();
      var objectUrl = URL.createObjectURL(file);
      img.onload = function () {
        var MAX_SIZE = 1600;
        var w = img.width, h = img.height;
        if (w > h && w > MAX_SIZE) { h = Math.round(h * (MAX_SIZE / w)); w = MAX_SIZE; }
        else if (h > MAX_SIZE) { w = Math.round(w * (MAX_SIZE / h)); h = MAX_SIZE; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(function (blob) { uploadBlob(blob, 'image/jpeg', file.name); }, 'image/jpeg', 0.75);
      };
      img.onerror = function () { URL.revokeObjectURL(objectUrl); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
      img.src = objectUrl;
    } else {
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('ไฟล์เอกสารต้องไม่เกิน 5MB'));
        return;
      }
      uploadBlob(file, file.type || 'application/octet-stream', file.name);
    }
  });
}

document.getElementById('ptm-drop-zone').addEventListener('click', function () {
  document.getElementById('ptm-file-input').click();
});
document.getElementById('ptm-file-input').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;

  if (_ptmEditingTaskId) {
    // Task มีอยู่แล้ว - อัปโหลดขึ้น Storage ได้ทันทีเหมือนเดิม
    var token = localStorage.getItem(TOKEN_KEY);
    ptmUploadOneFile(_ptmEditingTaskId, token, file).then(function (att) {
      document.getElementById('ptm-att-list').insertAdjacentHTML('beforeend', ptmAttChipHtml(att));
      Toast.fire({ icon: 'success', title: 'แนบไฟล์แล้ว' });
    }).catch(function (err) {
      Swal.fire({ icon: 'error', title: 'แนบไฟล์ไม่สำเร็จ', text: err.message });
    });
  } else {
    // กำลังเพิ่ม Task ใหม่ - ยังไม่มี taskId จริง พักไฟล์ไว้ก่อน แสดงเป็นการ์ด "รอบันทึก Task"
    // แล้วจะอัปโหลดจริงทันทีหลังกดบันทึก Task สำเร็จ (ผู้ใช้เลยทำ add + แนบไฟล์ ในขั้นตอนเดียวได้)
    var idx = _ptmPendingFiles.length;
    _ptmPendingFiles.push(file);
    document.getElementById('ptm-att-list').insertAdjacentHTML('beforeend', ptmPendingAttChipHtml(file, idx));
  }
  e.target.value = '';
});

// ===== บันทึก / ลบ Task =====
function savePersonalTaskModal() {
  // กันไว้อีกชั้น (defense-in-depth) เผื่อกรณีปุ่มถูกกดได้ทั้งที่ควรถูกซ่อน/บล็อกไปแล้วจาก .ptm-readonly
  if (_ptmReadOnly) { Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์แก้ไข Task นี้', text: 'ต้องเป็นผู้สร้าง, ผู้รับผิดชอบร่วม, หรือ Admin เท่านั้น' }); return; }

  var title = document.getElementById('ptm-title').value.trim();
  if (!title) { Swal.fire({ icon: 'warning', title: 'กรุณาใส่ชื่องาน' }); return; }

  var assigneeIds = Array.prototype.map.call(document.querySelectorAll('#ptm-assignee-row .ptm-avatar-chip'), function (c) { return c.getAttribute('data-id'); });
  var prioBtn = document.querySelector('.ptm-prio-btn.active');
  var priority = prioBtn ? prioBtn.getAttribute('data-p') : 'med';
  var tagChip = document.querySelector('#ptm-tag-selected .ptm-tag-chip');
  var tag = tagChip ? tagChip.getAttribute('data-val') : '';
  var noDate = document.getElementById('ptm-nodate-toggle').checked;
  var linked = !noDate && ptmLinkToggle.checked;
  var linkedEventId = linked ? (ptmEventInput.getAttribute('data-event-id') || '') : '';
  var dueDate = noDate ? '' : (linked ? null : ptmManualDate.value);
  var checklist = Array.prototype.map.call(document.querySelectorAll('#ptm-check-items .ptm-check-item'), function (r) {
    return { text: r.querySelector('span').textContent, done: r.classList.contains('done') };
  });

  if (linked && !linkedEventId) {
    Swal.fire({ icon: 'warning', title: 'กรุณาเลือก Event ที่จะผูก', text: 'หรือปิดสวิตช์เพื่อกำหนดวันเอง' });
    return;
  }

  var ptmDescEl = document.getElementById('ptm-desc');
  var description = ptmDescEl.textContent.trim() ? sanitizeRichText(ptmDescEl.innerHTML) : '';

  var token = localStorage.getItem(TOKEN_KEY);
  var payload = {
    token: token, title: title, description: description,
    assigneeIds: assigneeIds, priority: priority, tag: tag,
    linkedEventId: linked ? linkedEventId : null, dueDate: dueDate, checklist: checklist
  };

  var action = _ptmEditingTaskId ? 'updatePersonalTask' : 'createPersonalTask';
  if (_ptmEditingTaskId) payload.taskId = _ptmEditingTaskId;

  callApi(action, payload).then(function (result) {
    if (!result.success) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: result.message }); return; }

    // ถ้าเป็น Task ใหม่และมีไฟล์ที่พักไว้ตอนเพิ่ม Task (แนบพร้อมกับ add ในขั้นตอนเดียว) ให้อัปโหลดขึ้น Storage
    // จริงทันทีตอนนี้ เพราะเพิ่งมี taskId จริงแล้ว (ก่อนหน้านี้อัปโหลดไม่ได้เพราะ Storage Rules เช็ค
    // assigneeIds ของ Task ที่มีอยู่จริงในฐานข้อมูล)
    var pendingFiles = _ptmPendingFiles.filter(function (f) { return f; });
    if (!_ptmEditingTaskId && pendingFiles.length && result.taskId) {
      var newTaskId = result.taskId;
      var failCount = 0;
      var chain = Promise.resolve();
      pendingFiles.forEach(function (file) {
        chain = chain.then(function () {
          return ptmUploadOneFile(newTaskId, token, file).catch(function () { failCount++; });
        });
      });
      chain.then(function () {
        _ptmPendingFiles = [];
        Toast.fire({
          icon: failCount ? 'warning' : 'success',
          title: failCount ? ('เพิ่ม Task ใหม่แล้ว (แนบไฟล์ไม่สำเร็จ ' + failCount + ' ไฟล์ กรุณาแนบใหม่)') : 'เพิ่ม Task ใหม่แล้ว พร้อมไฟล์แนบ'
        });
        closePersonalTaskModal();
      });
      return;
    }

    Toast.fire({ icon: 'success', title: _ptmEditingTaskId ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่ม Task ใหม่แล้ว' });
    closePersonalTaskModal();
  }).catch(function (err) {
    Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err.message });
  });
}

function deleteCurrentPersonalTask() {
  if (!_ptmEditingTaskId) return;
  if (_ptmReadOnly) { Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์ลบ Task นี้', text: 'ต้องเป็นผู้สร้าง, ผู้รับผิดชอบร่วม, หรือ Admin เท่านั้น' }); return; }
  var taskId = _ptmEditingTaskId;
  Swal.fire({
    icon: 'warning', title: 'ยืนยันลบ Task นี้?', showCancelButton: true,
    confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
  }).then(function (res) {
    if (!res.isConfirmed) return;
    var token = localStorage.getItem(TOKEN_KEY);
    callApi('deletePersonalTask', { token: token, taskId: taskId }).then(function (result) {
      if (!result.success) { Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: result.message }); return; }
      Toast.fire({ icon: 'success', title: 'ลบ Task แล้ว' });
      closePersonalTaskModal();
    });
  });
}

// ===== Export รายงาน =====
document.querySelectorAll('.ptx-preset-btn').forEach(function (b) {
  b.addEventListener('click', function () { document.querySelectorAll('.ptx-preset-btn').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); });
});
document.querySelectorAll('.ptx-fmt-btn').forEach(function (b) {
  b.addEventListener('click', function () { document.querySelectorAll('.ptx-fmt-btn').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); });
});
function openTaskExportModal() { document.getElementById('task-export-modal-overlay').style.display = 'flex'; _pushModalNav('task-export-modal-overlay'); }
function closeTaskExportModal() { document.getElementById('task-export-modal-overlay').style.display = 'none'; }

function doTaskExport() {
  var range = document.querySelector('.ptx-preset-btn.active').getAttribute('data-r');
  var fmt = document.querySelector('.ptx-fmt-btn.active').getAttribute('data-f');
  var token = localStorage.getItem(TOKEN_KEY);

  // เปิดแท็บใหม่ไว้ล่วงหน้าตั้งแต่ตรงนี้เลย (ยัง synchronous ต่อเนื่องจาก click ปุ่ม "สร้างไฟล์" อยู่) ก่อนจะ
  // ไปรอ callApi แบบ async - ถ้ารอไปเปิดแท็บใหม่ทีหลังใน .then() เบราว์เซอร์จะมองว่าไม่ได้มาจาก user gesture
  // โดยตรงแล้ว แล้วบล็อก popup ทันที ค่อยส่งแท็บที่เปิดไว้แล้วนี้ไปเติมเนื้อหาทีหลังเมื่อข้อมูลพร้อม
  var preOpenedTab = window.open('', '_blank');
  if (preOpenedTab) {
    preOpenedTab.document.write('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px;color:#6b7280">กำลังสร้างรายงาน...</body>');
  }

  callApi('exportTaskReport', { token: token, range: range }).then(function (result) {
    if (!result.success) {
      if (preOpenedTab) preOpenedTab.close();
      Swal.fire({ icon: 'error', title: 'Export ไม่สำเร็จ', text: result.message });
      return;
    }
    closeTaskExportModal();

    if (fmt === 'xlsx') {
      var rows = result.rows.map(function (r) {
        return {
          'ชื่องาน': r.title, 'สถานะ': r.status === 'done' ? 'เสร็จแล้ว' : (r.status === 'doing' ? 'กำลังทำ' : 'ต้องทำ'),
          'ความสำคัญ': r.priority, 'แท็ก': r.tag,
          'ผู้รับผิดชอบ': r.assigneeIds.map(function (id) { return ptbStaffName(id); }).join(', '),
          'วันครบกำหนด': r.dueDate ? new Date(r.dueDate).toLocaleDateString('th-TH') : '',
          'สร้างเมื่อ': new Date(r.createdAt).toLocaleDateString('th-TH')
        };
      });
      var ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 14 }];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Task Report');
      exportWorkbookViaNewTab(wb, 'C2Calendar_TaskReport_' + range + '.xlsx', preOpenedTab);
    } else {
      var periodLabel = 'Task Board — ' + (range === 'week' ? 'สัปดาห์นี้' : (range === 'month' ? 'เดือนนี้' : 'ไตรมาสนี้'));

      var doneCount = result.rows.filter(function (r) { return r.status === 'done'; }).length;
      var doingCount = result.rows.filter(function (r) { return r.status === 'doing'; }).length;
      var todoCount = result.rows.filter(function (r) { return r.status === 'todo'; }).length;
      var donutSegments = [
        { label: 'เสร็จแล้ว', count: doneCount, color: '#3F654D' },
        { label: 'กำลังทำ', count: doingCount, color: '#D97706' },
        { label: 'ต้องทำ', count: todoCount, color: '#9AA6A0' }
      ];
      var donutTotal = doneCount + doingCount + todoCount;

      // ภาระงานรายคน: นับจำนวน Task ที่แต่ละคนรับผิดชอบ (นับซ้ำได้ถ้า Task มีผู้รับผิดชอบหลายคน)
      var workloadCount = {};
      result.rows.forEach(function (r) {
        (r.assigneeIds || []).forEach(function (id) { workloadCount[id] = (workloadCount[id] || 0) + 1; });
      });
      var workload = Object.keys(workloadCount)
        .sort(function (a, b) { return workloadCount[b] - workloadCount[a]; })
        .slice(0, 8)
        .map(function (id) { return { name: ptbStaffName(id), count: workloadCount[id], color: ptbStaffColor(id) }; });

      // งานเกินกำหนด/ใกล้ครบกำหนด (ไม่นับ Task ที่เสร็จแล้ว - ตามนิยามเดียวกับฝั่ง backend getCompanyTaskSummary)
      // เพิ่ม "who" (ชื่อผู้รับผิดชอบ) เข้าไปด้วย สำหรับตาราง "งานที่ใกล้จะถึง" แบบเต็มความกว้างในรีพอร์ตใหม่
      var todayOnly = new Date(); todayOnly.setHours(0, 0, 0, 0);
      var dueRows = result.rows.filter(function (r) { return r.status !== 'done' && r.dueDate; }).map(function (r) {
        var due = new Date(r.dueDate); due.setHours(0, 0, 0, 0);
        var diffDays = Math.round((due - todayOnly) / 86400000);
        var who = (r.assigneeIds || []).map(function (id) { return ptbStaffName(id); }).join(', ');
        return { title: r.title, diffDays: diffDays, who: who };
      });
      var overdueItems = dueRows.filter(function (r) { return r.diffDays < 0; })
        .sort(function (a, b) { return a.diffDays - b.diffDays; }).slice(0, 4)
        .map(function (r) { return { label: r.title, badge: 'เกิน ' + Math.abs(r.diffDays) + ' วัน' }; });
      // จำกัดช่วง "ใกล้จะถึง" ไว้แค่ 7 วันข้างหน้า (0-7) ตามที่ผู้ใช้ขอ ("ในอีก 1 สัปดาห์") และแสดงสูงสุด 6 แถว
      var upcoming7d = dueRows.filter(function (r) { return r.diffDays >= 0 && r.diffDays <= 7; })
        .sort(function (a, b) { return a.diffDays - b.diffDays; }).slice(0, 6)
        .map(function (r) {
          var badge = r.diffDays === 0 ? 'วันนี้' : (r.diffDays === 1 ? 'พรุ่งนี้' : 'อีก ' + r.diffDays + ' วัน');
          // สี badge ไล่ตามความเร่งด่วน: ส้ม = พรุ่งนี้/วันนี้, อำพัน = 2-3 วัน, เขียว = 4-7 วัน
          var badgeBg = r.diffDays <= 1 ? '#FEF0E1' : (r.diffDays <= 3 ? '#FEF3E0' : '#EEF6F1');
          var badgeTextColor = r.diffDays <= 1 ? '#C2540A' : (r.diffDays <= 3 ? '#B45309' : '#3F654D');
          return { title: r.title, who: r.who, badge: badge, badgeBg: badgeBg, badgeTextColor: badgeTextColor };
        });

      var html = execReportHtml({
        periodLabel: periodLabel,
        dateRangeLabel: range === 'week' ? 'สัปดาห์นี้' : (range === 'month' ? 'เดือนนี้' : 'ไตรมาสนี้'),
        totalLabel: 'งานทั้งหมด',
        donutSegments: donutSegments,
        donutSectionTitle: 'สถานะงาน',
        donutCenterPct: donutTotal > 0 ? Math.round(doneCount / donutTotal * 100) : 0,
        donutCenterSub: 'เสร็จแล้ว',
        workload: workload,
        rightWarning: overdueItems.length ? { headerText: overdueItems.length + ' งานเกินกำหนดแล้ว ต้องติดตามด่วน', items: overdueItems } : null,
        upcomingTitle: '🗓️ งานที่ใกล้จะถึง — 7 วันข้างหน้า',
        upcomingItems: upcoming7d,
        generatedAtLabel: fmtGeneratedAtLabel()
      });
      openExecReportInNewTab(html, preOpenedTab);
    }
  }).catch(function (err) {
    if (preOpenedTab) preOpenedTab.close();
    Swal.fire({ icon: 'error', title: 'Export ไม่สำเร็จ', text: err.message });
  });
}